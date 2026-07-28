import json
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import pyotp
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import AuthSession, MfaLoginChallenge
from app.auth.schemas import MfaChallengeResponse, TokenPair
from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    create_mfa_challenge_token,
    decrypt_secret,
    encrypt_secret,
    generate_refresh_token,
    hash_refresh_token,
)
from app.users.models import User

RECOVERY_CODE_COUNT = 10
EMAIL_OTP_TTL_SECONDS = 600
EMAIL_OTP_MAX_ATTEMPTS = 5


def authenticator_enabled(user: User) -> bool:
    """True once TOTP has been activated (recovery codes issued)."""
    return bool(user.mfa_secret and user.mfa_recovery_hashes)


def _generate_email_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


async def issue_login_mfa_challenge(
    db: AsyncSession, user: User
) -> MfaChallengeResponse:
    """Create email OTP (primary) + JWT challenge. Authenticator is secondary if enrolled."""
    from app.account.email import email_configured, send_login_mfa_code

    now = datetime.now(UTC)
    existing = await db.execute(
        select(MfaLoginChallenge).where(
            MfaLoginChallenge.user_id == user.id,
            MfaLoginChallenge.consumed_at.is_(None),
        )
    )
    for row in existing.scalars().all():
        row.consumed_at = now

    plain = _generate_email_otp()
    db.add(
        MfaLoginChallenge(
            user_id=user.id,
            code_hash=hash_refresh_token(plain),
            expires_at=now + timedelta(seconds=EMAIL_OTP_TTL_SECONDS),
        )
    )
    await db.commit()

    emailed = False
    if email_configured():
        emailed = await send_login_mfa_code(user.email, plain)

    totp_ok = authenticator_enabled(user)
    settings = get_settings()
    dev_code: str | None = None
    if emailed:
        primary = "email"
        message = "We sent a 6-digit code to your email."
    elif totp_ok:
        primary = "totp"
        message = "Enter the code from your authenticator app (or a recovery code)."
    elif settings.env != "production":
        primary = "inline"
        message = "Email is not configured — use the one-time code shown below."
        dev_code = plain
    else:
        # Production without Resend and without authenticator — still issue challenge;
        # user must have enrolled authenticator or configure email.
        if totp_ok:
            primary = "totp"
            message = "Enter the code from your authenticator app."
        else:
            primary = "email"
            message = (
                "Sign-in email could not be sent. Add an authenticator in Account → Security, "
                "or contact support."
            )

    return MfaChallengeResponse(
        challenge_token=create_mfa_challenge_token(user.id),
        primary_method=primary,
        totp_available=totp_ok,
        message=message,
        dev_code=dev_code,
    )


async def verify_email_login_otp(db: AsyncSession, user_id: uuid.UUID, code: str) -> bool:
    cleaned = code.strip()
    if not cleaned.isdigit() or len(cleaned) != 6:
        return False
    now = datetime.now(UTC)
    result = await db.execute(
        select(MfaLoginChallenge)
        .where(
            MfaLoginChallenge.user_id == user_id,
            MfaLoginChallenge.consumed_at.is_(None),
        )
        .order_by(MfaLoginChallenge.created_at.desc())
        .limit(1)
    )
    challenge = result.scalar_one_or_none()
    if challenge is None:
        return False
    expires = challenge.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < now:
        return False
    if challenge.attempt_count >= EMAIL_OTP_MAX_ATTEMPTS:
        return False
    challenge.attempt_count += 1
    if challenge.code_hash != hash_refresh_token(cleaned):
        await db.commit()
        return False
    challenge.consumed_at = now
    await db.commit()
    return True


async def verify_login_mfa(
    db: AsyncSession, user: User, code: str
) -> bool:
    """Accept email OTP, TOTP, or recovery code."""
    if await verify_email_login_otp(db, user.id, code):
        return True
    if verify_mfa_code(user, code):
        await db.commit()
        return True
    return False



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
