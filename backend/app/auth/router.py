from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import service
from app.auth.schemas import (
    LoginRequest,
    LogoutRequest,
    MfaActivateRequest,
    MfaActivateResponse,
    MfaChallengeResponse,
    MfaEnrollResponse,
    MfaRecoveryCodesResponse,
    MfaVerifyRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
)
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import (
    MFA_CHALLENGE_TOKEN,
    create_mfa_challenge_token,
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


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: DbDep) -> User:
    existing = await db.execute(select(User).where(User.email == body.email.lower()))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(
        email=body.email.lower(),
        password_hash=hash_password(body.password),
        display_name=body.display_name,
    )
    db.add(user)
    await db.flush()
    await create_personal_household(db, user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/login", response_model=TokenPair | MfaChallengeResponse)
async def login(body: LoginRequest, db: DbDep, request: Request):
    result = await db.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()
    if user is None or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if user.mfa_enabled:
        return MfaChallengeResponse(challenge_token=create_mfa_challenge_token(user.id))
    return await service.issue_token_pair(db, user.id, request.headers.get("user-agent"))


@router.post("/mfa/verify", response_model=TokenPair)
async def mfa_verify(body: MfaVerifyRequest, db: DbDep, request: Request) -> TokenPair:
    user_id = decode_token(body.challenge_token, MFA_CHALLENGE_TOKEN)
    if user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired challenge")
    user = await db.get(User, user_id)
    if user is None or not service.verify_mfa_code(user, body.code):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid code")
    await db.commit()
    return await service.issue_token_pair(db, user.id, request.headers.get("user-agent"))


@router.post("/refresh", response_model=TokenPair)
async def refresh(body: RefreshRequest, db: DbDep, request: Request) -> TokenPair:
    pair = await service.rotate_refresh_token(
        db, body.refresh_token, request.headers.get("user-agent")
    )
    if pair is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    return pair


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(body: LogoutRequest, db: DbDep) -> None:
    if not await service.revoke_session(db, body.refresh_token):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(user: CurrentUser, db: DbDep) -> None:
    await service.revoke_all_sessions(db, user.id)


@router.post("/mfa/enroll", response_model=MfaEnrollResponse)
async def mfa_enroll(user: CurrentUser, db: DbDep) -> MfaEnrollResponse:
    if user.mfa_enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, "MFA already enabled")
    secret, encrypted, uri = service.build_mfa_enrollment(user)
    user.mfa_secret = encrypted
    await db.commit()
    return MfaEnrollResponse(secret=secret, otpauth_uri=uri)


@router.post("/mfa/activate", response_model=MfaActivateResponse)
async def mfa_activate(body: MfaActivateRequest, user: CurrentUser, db: DbDep) -> MfaActivateResponse:
    if user.mfa_enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, "MFA already enabled")
    if not service.verify_totp(user, body.code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid code")
    codes, hashes = service.generate_recovery_codes()
    user.mfa_enabled = True
    user.mfa_recovery_hashes = hashes
    await db.commit()
    return MfaActivateResponse(recovery_codes=codes)


@router.post("/mfa/recovery-codes", response_model=MfaRecoveryCodesResponse)
async def regenerate_recovery_codes(user: CurrentUser, db: DbDep) -> MfaRecoveryCodesResponse:
    if not user.mfa_enabled:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "MFA is not enabled")
    codes, hashes = service.generate_recovery_codes()
    user.mfa_recovery_hashes = hashes
    await db.commit()
    return MfaRecoveryCodesResponse(recovery_codes=codes)


@router.get("/oauth/providers")
async def oauth_providers():
    from app.auth.oauth import configured_providers
    from app.core.config import get_settings

    settings = get_settings()
    return {
        "providers": [
            {
                "id": p.id,
                "name": p.name,
                "enabled": p.enabled,
                "auth_url": p.auth_url,
            }
            for p in configured_providers(settings, settings.oauth_redirect_uri)
        ]
    }


@router.post("/oauth/google/callback", response_model=TokenPair | MfaChallengeResponse)
async def oauth_google_callback(
    body: dict,
    db: DbDep,
    request: Request,
):
    """Exchange Google authorization code for a Woney session."""
    from app.auth.oauth import exchange_google_code
    from app.core.config import get_settings

    code = body.get("code")
    if not code or not isinstance(code, str):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Missing code")
    settings = get_settings()
    redirect_uri = body.get("redirect_uri") or settings.oauth_redirect_uri
    try:
        profile = await exchange_google_code(settings, code, redirect_uri)
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Google OAuth failed: {exc}") from exc

    email = (profile.get("email") or "").lower()
    subject = profile.get("sub")
    if not email or not subject:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Google profile incomplete")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(
            email=email,
            password_hash=None,
            display_name=profile.get("name") or email.split("@")[0],
            oauth_provider="google",
            oauth_subject=subject,
        )
        db.add(user)
        await db.flush()
        await create_personal_household(db, user)
    else:
        user.oauth_provider = user.oauth_provider or "google"
        user.oauth_subject = user.oauth_subject or subject
    await db.commit()
    await db.refresh(user)
    if user.mfa_enabled:
        return MfaChallengeResponse(challenge_token=create_mfa_challenge_token(user.id))
    return await service.issue_token_pair(db, user.id, request.headers.get("user-agent"))

