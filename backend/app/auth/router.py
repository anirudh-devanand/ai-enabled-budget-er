from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import service
from app.auth.schemas import (
    LoginRequest,
    LogoutRequest,
    MfaActivateRequest,
    MfaChallengeResponse,
    MfaEnrollResponse,
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
    if user is None or not verify_password(body.password, user.password_hash):
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
    if user is None or not service.verify_totp(user, body.code):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid code")
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


@router.post("/mfa/activate", status_code=status.HTTP_204_NO_CONTENT)
async def mfa_activate(body: MfaActivateRequest, user: CurrentUser, db: DbDep) -> None:
    if user.mfa_enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, "MFA already enabled")
    if not service.verify_totp(user, body.code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid code")
    user.mfa_enabled = True
    await db.commit()
