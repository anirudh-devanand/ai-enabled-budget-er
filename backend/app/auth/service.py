import json
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import pyotp
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import AuthSession
from app.auth.schemas import TokenPair
from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    decrypt_secret,
    encrypt_secret,
    generate_refresh_token,
    hash_refresh_token,
)
from app.users.models import User

RECOVERY_CODE_COUNT = 10


async def issue_token_pair(
    db: AsyncSession, user_id: uuid.UUID, user_agent: str | None = None
) -> TokenPair:
    settings = get_settings()
    refresh_token = generate_refresh_token()
    session = AuthSession(
        user_id=user_id,
        refresh_token_hash=hash_refresh_token(refresh_token),
        user_agent=user_agent,
        expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_days),
    )
    db.add(session)
    await db.commit()
    return TokenPair(access_token=create_access_token(user_id), refresh_token=refresh_token)


async def _find_active_session(db: AsyncSession, refresh_token: str) -> AuthSession | None:
    result = await db.execute(
        select(AuthSession).where(
            AuthSession.refresh_token_hash == hash_refresh_token(refresh_token)
        )
    )
    session = result.scalar_one_or_none()
    if session is None or session.revoked_at is not None:
        return None
    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at < datetime.now(UTC):
        return None
    return session


async def rotate_refresh_token(
    db: AsyncSession, refresh_token: str, user_agent: str | None = None
) -> TokenPair | None:
    session = await _find_active_session(db, refresh_token)
    if session is None:
        return None
    session.revoked_at = datetime.now(UTC)
    await db.flush()
    return await issue_token_pair(db, session.user_id, user_agent)


async def active_session_user_id(
    db: AsyncSession, refresh_token: str
) -> uuid.UUID | None:
    session = await _find_active_session(db, refresh_token)
    return session.user_id if session else None


async def revoke_session(db: AsyncSession, refresh_token: str) -> bool:
    session = await _find_active_session(db, refresh_token)
    if session is None:
        return False
    session.revoked_at = datetime.now(UTC)
    await db.commit()
    return True


async def revoke_all_sessions(db: AsyncSession, user_id: uuid.UUID) -> int:
    result = await db.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    await db.commit()
    return result.rowcount or 0


def build_mfa_enrollment(user: User) -> tuple[str, str, str]:
    """Returns (plain_secret, encrypted_secret, otpauth_uri)."""
    secret = pyotp.random_base32()
    uri = pyotp.totp.TOTP(secret).provisioning_uri(name=user.email, issuer_name="Woney")
    return secret, encrypt_secret(secret), uri


def verify_totp(user: User, code: str) -> bool:
    if not user.mfa_secret:
        return False
    secret = decrypt_secret(user.mfa_secret)
    return pyotp.TOTP(secret).verify(code, valid_window=1)


def _normalize_recovery_code(code: str) -> str:
    return code.strip().upper().replace("-", "").replace(" ", "")


def generate_recovery_codes() -> tuple[list[str], str]:
    """Returns (plain codes shown once, JSON list of sha256 hashes)."""
    codes = [
        f"{secrets.token_hex(4).upper()}-{secrets.token_hex(4).upper()}"
        for _ in range(RECOVERY_CODE_COUNT)
    ]
    hashes = [hash_refresh_token(_normalize_recovery_code(c)) for c in codes]
    return codes, json.dumps(hashes)


def consume_recovery_code(user: User, code: str) -> bool:
    """Validate a one-time recovery code and remove its hash. Mutates user."""
    if not user.mfa_recovery_hashes:
        return False
    try:
        hashes: list[str] = json.loads(user.mfa_recovery_hashes)
    except json.JSONDecodeError:
        return False
    digest = hash_refresh_token(_normalize_recovery_code(code))
    if digest not in hashes:
        return False
    hashes.remove(digest)
    user.mfa_recovery_hashes = json.dumps(hashes)
    return True


def verify_mfa_code(user: User, code: str) -> bool:
    """Accept TOTP or a one-time recovery code (recovery mutates user)."""
    cleaned = code.strip()
    if len(cleaned) <= 8 and cleaned.isdigit():
        return verify_totp(user, cleaned)
    return consume_recovery_code(user, cleaned)
