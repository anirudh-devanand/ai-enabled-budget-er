"""Account deletion: OTP challenges, cascade wipe, rate limits."""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.account.email import email_configured, send_deletion_code
from app.account.models import AccountDeletionChallenge
from app.account.schemas import DeleteRequestResponse
from app.auth.service import verify_mfa_code, verify_totp
from app.core.security import hash_refresh_token, verify_password
from app.households.models import Household, HouseholdMember
from app.users.models import User

OTP_TTL_SECONDS = 600
OTP_REQUEST_WINDOW = timedelta(minutes=15)
OTP_REQUEST_MAX = 5
OTP_CONFIRM_MAX_ATTEMPTS = 5
CONFIRM_PHRASE = "DELETE"


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


async def _recent_request_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    since = _utcnow() - OTP_REQUEST_WINDOW
    result = await db.execute(
        select(func.count())
        .select_from(AccountDeletionChallenge)
        .where(
            AccountDeletionChallenge.user_id == user_id,
            AccountDeletionChallenge.created_at >= since,
        )
    )
    return int(result.scalar_one())


async def request_deletion(db: AsyncSession, user: User) -> DeleteRequestResponse:
    if await _recent_request_count(db, user.id) >= OTP_REQUEST_MAX:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many deletion code requests. Try again in a few minutes.",
        )

    # Invalidate prior unused challenges.
    existing = await db.execute(
        select(AccountDeletionChallenge).where(
            AccountDeletionChallenge.user_id == user.id,
            AccountDeletionChallenge.consumed_at.is_(None),
        )
    )
    now = _utcnow()
    for row in existing.scalars().all():
        row.consumed_at = now

    plain = _generate_otp()
    challenge = AccountDeletionChallenge(
        user_id=user.id,
        code_hash=hash_refresh_token(plain),
        expires_at=now + timedelta(seconds=OTP_TTL_SECONDS),
    )
    db.add(challenge)
    await db.commit()

    requires_password = bool(user.password_hash)
    emailed = False
    if email_configured():
        emailed = await send_deletion_code(user.email, plain)

    if emailed:
        return DeleteRequestResponse(
            delivery="email",
            expires_in_seconds=OTP_TTL_SECONDS,
            requires_password=requires_password,
            message="A confirmation code was sent to your email.",
            code=None,
        )

    if user.mfa_enabled:
        return DeleteRequestResponse(
            delivery="totp",
            expires_in_seconds=OTP_TTL_SECONDS,
            requires_password=requires_password,
            message=(
                "Enter the 6-digit code from your authenticator app "
                "(or a recovery code) to confirm deletion."
            ),
            code=None,
        )

    # No email provider and no MFA — return the OTP once (hashed at rest).
    return DeleteRequestResponse(
        delivery="inline",
        expires_in_seconds=OTP_TTL_SECONDS,
        requires_password=requires_password,
        message=(
            "Enter this one-time code to confirm deletion. "
            "It expires in 10 minutes and is shown only once."
        ),
        code=plain,
    )


async def _active_challenge(
    db: AsyncSession, user_id: uuid.UUID
) -> AccountDeletionChallenge | None:
    result = await db.execute(
        select(AccountDeletionChallenge)
        .where(
            AccountDeletionChallenge.user_id == user_id,
            AccountDeletionChallenge.consumed_at.is_(None),
        )
        .order_by(AccountDeletionChallenge.created_at.desc())
        .limit(1)
    )
    challenge = result.scalar_one_or_none()
    if challenge is None:
        return None
    expires = challenge.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < _utcnow():
        return None
    if challenge.attempt_count >= OTP_CONFIRM_MAX_ATTEMPTS:
        return None
    return challenge


def _code_matches_challenge(challenge: AccountDeletionChallenge, code: str) -> bool:
    cleaned = code.strip().replace(" ", "").replace("-", "")
    if cleaned.isdigit() and len(cleaned) == 6:
        return challenge.code_hash == hash_refresh_token(cleaned)
    return False


async def confirm_deletion(
    db: AsyncSession,
    user: User,
    *,
    code: str,
    confirm: str,
    password: str | None,
    email_confirm: str | None,
) -> None:
    if confirm.strip() != CONFIRM_PHRASE:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f'Confirmation phrase must be exactly "{CONFIRM_PHRASE}"',
        )

    if user.password_hash:
        if not password or not verify_password(password, user.password_hash):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Password is incorrect")
    else:
        # OAuth-only: require re-typing the account email.
        if not email_confirm or email_confirm.strip().lower() != user.email.lower():
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Re-enter your account email to confirm deletion",
            )

    challenge = await _active_challenge(db, user.id)
    if challenge is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "No active deletion code. Request a new code first.",
        )

    challenge.attempt_count += 1
    await db.flush()

    otp_ok = _code_matches_challenge(challenge, code)
    mfa_ok = False
    if user.mfa_enabled and not otp_ok:
        # Prefer TOTP for MFA users; recovery codes also accepted via verify_mfa_code.
        cleaned = code.strip()
        if len(cleaned) <= 8 and cleaned.isdigit():
            mfa_ok = verify_totp(user, cleaned)
        else:
            mfa_ok = verify_mfa_code(user, cleaned)

    if not otp_ok and not mfa_ok:
        await db.commit()
        remaining = OTP_CONFIRM_MAX_ATTEMPTS - challenge.attempt_count
        if remaining <= 0:
            challenge.consumed_at = _utcnow()
            await db.commit()
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Too many incorrect codes. Request a new deletion code.",
            )
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid confirmation code")

    challenge.consumed_at = _utcnow()
    await db.flush()
    await wipe_user(db, user)


async def wipe_user(db: AsyncSession, user: User) -> None:
    """Hard-delete the user and sole-owned household data (PII)."""
    user_id = user.id

    memberships = (
        await db.execute(select(HouseholdMember).where(HouseholdMember.user_id == user_id))
    ).scalars().all()

    for membership in memberships:
        others = (
            await db.execute(
                select(HouseholdMember).where(
                    HouseholdMember.household_id == membership.household_id,
                    HouseholdMember.user_id != user_id,
                )
            )
        ).scalars().all()

        if not others:
            household = await db.get(Household, membership.household_id)
            if household is not None:
                await db.delete(household)
            continue

        if membership.role == "owner":
            # Transfer ownership so the shared household stays usable.
            others[0].role = "owner"
        await db.delete(membership)

    # Sessions / notifications / user-scoped conversations CASCADE from users.
    fresh = await db.get(User, user_id)
    if fresh is not None:
        await db.delete(fresh)
    await db.commit()
