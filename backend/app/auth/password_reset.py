"""Forgot-password request + confirm (hashed single-use tokens)."""

from __future__ import annotations

import logging
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.account.email import email_configured, send_password_reset_link
from app.auth.models import PasswordResetToken
from app.auth.oauth import origin_from_request
from app.auth.schemas import PasswordResetConfirmRequest, PasswordResetRequestResponse
from app.auth.security_events import record_security_event
from app.auth.service import revoke_all_sessions
from app.core.config import get_settings
from app.core.security import assert_password_strength, hash_password, hash_refresh_token
from app.users.models import User

logger = logging.getLogger(__name__)

RESET_TTL = timedelta(hours=1)
REQUEST_WINDOW = timedelta(minutes=15)
REQUEST_MAX_PER_EMAIL = 5
GENERIC_MESSAGE = (
    "If an account exists for that email, you will receive a password reset link shortly."
)


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _public_base_url(request: Request | None) -> str:
    settings = get_settings()
    if request is not None:
        origin = origin_from_request(request)
        if origin and origin in settings.cors_origin_list():
            return origin
    return settings.resolved_public_app_url()


async def _recent_request_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    since = _utcnow() - REQUEST_WINDOW
    result = await db.execute(
        select(func.count())
        .select_from(PasswordResetToken)
        .where(
            PasswordResetToken.user_id == user_id,
            PasswordResetToken.created_at >= since,
        )
    )
    return int(result.scalar_one())


async def request_password_reset(
    db: AsyncSession,
    email: str,
    request: Request | None = None,
) -> PasswordResetRequestResponse:
    """Always return a generic success response (no email enumeration)."""
    normalized = email.strip().lower()
    result = await db.execute(select(User).where(User.email == normalized))
    user = result.scalar_one_or_none()

    # Unknown email / OAuth-only accounts: still succeed silently.
    if user is None or not user.password_hash:
        await record_security_event(
            db,
            event_type="password_reset_request",
            request=request,
            meta={"outcome": "no_account"},
            commit=True,
        )
        return PasswordResetRequestResponse(message=GENERIC_MESSAGE, delivery="none")

    if await _recent_request_count(db, user.id) >= REQUEST_MAX_PER_EMAIL:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many password reset requests. Try again in a few minutes.",
        )

    now = _utcnow()
    existing = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.consumed_at.is_(None),
        )
    )
    for row in existing.scalars().all():
        row.consumed_at = now

    plain = secrets.token_urlsafe(32)
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_refresh_token(plain),
            expires_at=now + RESET_TTL,
        )
    )
    await db.commit()

    await record_security_event(
        db,
        event_type="password_reset_request",
        user_id=user.id,
        request=request,
        meta={"outcome": "token_created"},
        commit=True,
    )

    base = _public_base_url(request)
    reset_url = f"{base}/reset-password?token={plain}"
    settings = get_settings()

    if email_configured():
        sent = await send_password_reset_link(user.email, reset_url)
        if sent:
            return PasswordResetRequestResponse(message=GENERIC_MESSAGE, delivery="email")
        logger.warning("Password reset email failed to send for user_id=%s", user.id)

    if settings.env != "production":
        logger.warning(
            "Password reset (dev fallback — email not configured): %s",
            reset_url,
        )
        return PasswordResetRequestResponse(
            message=GENERIC_MESSAGE,
            delivery="dev_log",
            dev_reset_url=reset_url,
        )

    logger.error(
        "Password reset requested but email is not configured in production "
        "(set WONEY_RESEND_API_KEY and WONEY_EMAIL_FROM)."
    )
    return PasswordResetRequestResponse(message=GENERIC_MESSAGE, delivery="none")


async def confirm_password_reset(
    db: AsyncSession,
    body: PasswordResetConfirmRequest,
) -> None:
    assert_password_strength(body.password)
    token_hash = hash_refresh_token(body.token.strip())
    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == token_hash)
    )
    row = result.scalar_one_or_none()
    if row is None or row.consumed_at is not None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This reset link is invalid or has already been used.",
        )
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if expires < _utcnow():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This reset link has expired. Request a new one from the sign-in page.",
        )

    user = await db.get(User, row.user_id)
    if user is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This reset link is invalid or has already been used.",
        )

    user.password_hash = hash_password(body.password)
    row.consumed_at = _utcnow()
    await db.flush()
    await revoke_all_sessions(db, user.id)
    await db.commit()
