from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import service
from app.auth.cookies import (
    clear_refresh_cookie,
    public_token_pair,
    read_refresh_token,
    set_refresh_cookie,
)
from app.auth.schemas import (
    LoginRequest,
    LogoutRequest,
    MfaActivateRequest,
    MfaActivateResponse,
    MfaChallengeResponse,
    MfaDisableRequest,
    MfaEnrollResponse,
    MfaRecoveryCodesResponse,
    MfaResendRequest,
    MfaVerifyRequest,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    PasswordResetRequestResponse,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
)
from app.auth.security_events import record_security_event
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.rate_limit import check_rate_limit
from app.core.security import (
    MFA_CHALLENGE_TOKEN,
    assert_password_strength,
    decode_token,
    hash_password,
    verify_password,
)
from app.households.service import create_personal_household
from app.users.models import User
from app.users.schemas import UserResponse

router = APIRouter(prefix="/v1/auth", tags=["auth"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


async def _issue_and_set_cookie(
    db: AsyncSession,
    response: Response,
    request: Request,
    user_id,
) -> TokenPair:
    pair = await service.issue_token_pair(db, user_id, request.headers.get("user-agent"))
    set_refresh_cookie(response, pair.refresh_token, request)
    return TokenPair(**public_token_pair(request, pair.access_token, pair.refresh_token))


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: DbDep, request: Request) -> User:
    check_rate_limit(request, bucket="auth-register", limit=10, window_seconds=900)
    assert_password_strength(body.password)
    existing = await db.execute(select(User).where(User.email == body.email.lower()))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "An account with this email already exists. Sign in or reset your password.",
        )
    user = User(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        display_name=body.display_name,
        mfa_enabled=True,  # Email MFA on by default; can disable later in Account.
    )
    db.add(user)
    await db.flush()
    await create_personal_household(db, user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=TokenPair | MfaChallengeResponse)
async def login(body: LoginRequest, db: DbDep, request: Request, response: Response):
    check_rate_limit(request, bucket="auth-login", limit=20, window_seconds=900)
    result = await db.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()
    if user is None or not user.password_hash or not verify_password(body.password, user.password_hash):
        await record_security_event(
            db,
            event_type="login_failed",
            user_id=user.id if user else None,
            request=request,
            meta={"email_domain": body.email.split("@")[-1].lower() if "@" in body.email else None},
            commit=True,
        )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if user.mfa_enabled:
        return await service.issue_login_mfa_challenge(db, user)
    pair = await _issue_and_set_cookie(db, response, request, user.id)
    await record_security_event(
        db,
        event_type="login_success",
        user_id=user.id,
        request=request,
        meta={"method": "password"},
        commit=True,
    )
    return pair


@router.post("/mfa/verify", response_model=TokenPair)
async def mfa_verify(
    body: MfaVerifyRequest, db: DbDep, request: Request, response: Response
) -> TokenPair:
    check_rate_limit(request, bucket="auth-mfa", limit=15, window_seconds=900)
    user_id = decode_token(body.challenge_token, MFA_CHALLENGE_TOKEN)
    if user_id is None:
        await record_security_event(
            db, event_type="mfa_verify_failed", request=request, meta={"reason": "bad_challenge"}, commit=True
        )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired challenge")
    user = await db.get(User, user_id)
    if user is None or not await service.verify_login_mfa(db, user, body.code):
        await record_security_event(
            db,
            event_type="mfa_verify_failed",
            user_id=user_id,
            request=request,
            meta={"reason": "bad_code"},
            commit=True,
        )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid code")
    pair = await _issue_and_set_cookie(db, response, request, user.id)
    await record_security_event(
        db, event_type="mfa_verify_success", user_id=user.id, request=request, commit=True
    )
    return pair


@router.post("/mfa/resend", response_model=MfaChallengeResponse)
async def mfa_resend(body: MfaResendRequest, db: DbDep, request: Request) -> MfaChallengeResponse:
    check_rate_limit(request, bucket="auth-mfa-resend", limit=8, window_seconds=900)
    user_id = decode_token(body.challenge_token, MFA_CHALLENGE_TOKEN)
    if user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired challenge")
    user = await db.get(User, user_id)
    if user is None or not user.mfa_enabled:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired challenge")
    return await service.issue_login_mfa_challenge(db, user)


@router.post("/refresh", response_model=TokenPair)
async def refresh(
    request: Request,
    response: Response,
    db: DbDep,
    body: RefreshRequest = RefreshRequest(),
) -> TokenPair:
    check_rate_limit(request, bucket="auth-refresh", limit=60, window_seconds=900)
    token = read_refresh_token(request, body.refresh_token)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    pair = await service.rotate_refresh_token(db, token, request.headers.get("user-agent"))
    if pair is None:
        clear_refresh_cookie(response, request)
        await record_security_event(
            db, event_type="refresh_failed", request=request, meta={"reason": "invalid"}, commit=True
        )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    set_refresh_cookie(response, pair.refresh_token, request)
    return TokenPair(**public_token_pair(request, pair.access_token, pair.refresh_token))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    db: DbDep,
    body: LogoutRequest = LogoutRequest(),
) -> None:
    token = read_refresh_token(request, body.refresh_token)
    if not token:
        clear_refresh_cookie(response, request)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    user_id = await service.active_session_user_id(db, token)
    if not await service.revoke_session(db, token):
        clear_refresh_cookie(response, request)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    clear_refresh_cookie(response, request)
    await record_security_event(
        db, event_type="logout", user_id=user_id, request=request, commit=True
    )


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(user: CurrentUser, db: DbDep, request: Request, response: Response) -> None:
    await service.revoke_all_sessions(db, user.id)
    clear_refresh_cookie(response, request)
    await record_security_event(
        db, event_type="logout_all", user_id=user.id, request=request, commit=True
    )


@router.post("/mfa/enroll", response_model=MfaEnrollResponse)
async def mfa_enroll(user: CurrentUser, db: DbDep) -> MfaEnrollResponse:
    """Start authenticator enrollment (QR). Allowed while email MFA is already on."""
    if service.authenticator_enabled(user):
        raise HTTPException(status.HTTP_409_CONFLICT, "Authenticator already enabled")
    secret, encrypted, uri = service.build_mfa_enrollment(user)
    user.mfa_secret = encrypted
    # Clear prior recovery hashes until activate completes.
    user.mfa_recovery_hashes = None
    await db.commit()
    return MfaEnrollResponse(secret=secret, otpauth_uri=uri)


@router.post("/mfa/activate", response_model=MfaActivateResponse)
async def mfa_activate(body: MfaActivateRequest, user: CurrentUser, db: DbDep) -> MfaActivateResponse:
    if service.authenticator_enabled(user):
        raise HTTPException(status.HTTP_409_CONFLICT, "Authenticator already enabled")
    if not user.mfa_secret:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Start enrollment first")
    if not service.verify_totp(user, body.code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid code")
    codes, hashes = service.generate_recovery_codes()
    user.mfa_enabled = True
    user.mfa_recovery_hashes = hashes
    await db.commit()
    return MfaActivateResponse(recovery_codes=codes)


@router.post("/mfa/recovery-codes", response_model=MfaRecoveryCodesResponse)
async def regenerate_recovery_codes(user: CurrentUser, db: DbDep) -> MfaRecoveryCodesResponse:
    if not service.authenticator_enabled(user):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Authenticator is not enabled")
    codes, hashes = service.generate_recovery_codes()
    user.mfa_recovery_hashes = hashes
    await db.commit()
    return MfaRecoveryCodesResponse(recovery_codes=codes)


@router.post("/mfa/disable", status_code=status.HTTP_204_NO_CONTENT)
async def mfa_disable(body: MfaDisableRequest, user: CurrentUser, db: DbDep, request: Request) -> None:
    """Turn off login MFA (email + authenticator challenges)."""
    if not user.mfa_enabled:
        return
    if user.password_hash:
        if not body.password or not verify_password(body.password, user.password_hash):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Password required to disable MFA")
    user.mfa_enabled = False
    await db.commit()
    await record_security_event(
        db, event_type="mfa_disabled", user_id=user.id, request=request, commit=True
    )


@router.post("/mfa/enable", status_code=status.HTTP_204_NO_CONTENT)
async def mfa_enable(user: CurrentUser, db: DbDep, request: Request) -> None:
    """Turn on email MFA for sign-in (default for new accounts)."""
    if user.mfa_enabled:
        return
    user.mfa_enabled = True
    await db.commit()
    await record_security_event(
        db, event_type="mfa_enabled", user_id=user.id, request=request, commit=True
    )


@router.post("/password-reset/request", response_model=PasswordResetRequestResponse)
async def password_reset_request(
    body: PasswordResetRequest, db: DbDep, request: Request
) -> PasswordResetRequestResponse:
    check_rate_limit(request, bucket="auth-reset-request", limit=8, window_seconds=900)
    from app.auth.password_reset import request_password_reset

    return await request_password_reset(db, body.email, request)


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
async def password_reset_confirm(
    body: PasswordResetConfirmRequest, db: DbDep, request: Request
) -> None:
    check_rate_limit(request, bucket="auth-reset-confirm", limit=15, window_seconds=900)
    from app.auth.password_reset import confirm_password_reset

    await confirm_password_reset(db, body)


@router.get("/oauth/providers")
async def oauth_providers(request: Request):
    from app.auth.oauth import configured_providers, resolve_oauth_redirect_uri
    from app.core.config import get_settings

    settings = get_settings()
    redirect_uri = resolve_oauth_redirect_uri(settings, request)
    return {
        "providers": [
            {
                "id": p.id,
                "name": p.name,
                "enabled": p.enabled,
                "auth_url": p.auth_url,
            }
            for p in configured_providers(settings, redirect_uri)
        ]
    }


async def _oauth_upsert_and_issue(
    *,
    db: AsyncSession,
    request: Request,
    response: Response,
    provider: str,
    email: str,
    subject: str,
    display_name: str,
    intent: str = "login",
):
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(
            email=email,
            password_hash=None,
            display_name=display_name,
            oauth_provider=provider,
            oauth_subject=subject,
            mfa_enabled=True,
        )
        db.add(user)
        await db.flush()
        await create_personal_household(db, user)
    else:
        if intent == "signup":
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "An account with this email already exists. Sign in instead.",
            )
        user.oauth_provider = user.oauth_provider or provider
        user.oauth_subject = user.oauth_subject or subject
    await db.commit()
    await db.refresh(user)
    if user.mfa_enabled:
        return await service.issue_login_mfa_challenge(db, user)
    pair = await _issue_and_set_cookie(db, response, request, user.id)
    await record_security_event(
        db,
        event_type="oauth_login",
        user_id=user.id,
        request=request,
        meta={"provider": provider},
        commit=True,
    )
    return pair


@router.post("/oauth/{provider}/callback", response_model=TokenPair | MfaChallengeResponse)
async def oauth_provider_callback(
    provider: str,
    body: dict,
    db: DbDep,
    request: Request,
    response: Response,
):
    """Exchange an authorization code for a Woney session (google | apple | microsoft)."""
    check_rate_limit(request, bucket="auth-oauth", limit=30, window_seconds=900)
    from app.auth.oauth import exchange_apple_code, exchange_google_code, exchange_microsoft_code
    from app.core.config import get_settings

    provider = provider.strip().lower()
    exchangers = {
        "google": exchange_google_code,
        "apple": exchange_apple_code,
        "microsoft": exchange_microsoft_code,
    }
    if provider not in exchangers:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown OAuth provider: {provider}")

    code = body.get("code")
    if not code or not isinstance(code, str):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Missing code")
    settings = get_settings()
    from app.auth.oauth import (
        is_allowed_oauth_redirect,
        redirect_uri_from_state,
        resolve_oauth_redirect_uri,
    )

    # Prefer redirect_uri embedded in OAuth state (exact match with authorize request).
    state = body.get("state") if isinstance(body.get("state"), str) else None
    redirect_uri = redirect_uri_from_state(state)
    if not redirect_uri:
        redirect_uri = body.get("redirect_uri") or resolve_oauth_redirect_uri(settings, request)
    if not isinstance(redirect_uri, str) or not is_allowed_oauth_redirect(settings, redirect_uri):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid redirect_uri")
    try:
        profile = await exchangers[provider](settings, code, redirect_uri)
    except Exception as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"{provider.title()} OAuth failed: {exc}"
        ) from exc

    email = (profile.get("email") or "").lower()
    subject = profile.get("sub")
    if not email or not subject:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{provider.title()} profile incomplete")

    raw_intent = body.get("intent")
    intent = raw_intent.strip().lower() if isinstance(raw_intent, str) else "login"
    if intent not in ("login", "signup"):
        intent = "login"

    return await _oauth_upsert_and_issue(
        db=db,
        request=request,
        response=response,
        provider=provider,
        email=email,
        subject=str(subject),
        display_name=profile.get("name") or email.split("@")[0],
        intent=intent,
    )
