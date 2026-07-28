"""SIEM-lite security event recording. Never log tokens, passwords, or secrets."""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import SecurityEvent

_logger = logging.getLogger("woney.security")

# Keys that must never appear in meta (defense in depth).
_SECRET_KEYS = frozenset(
    {
        "password",
        "token",
        "refresh_token",
        "access_token",
        "challenge_token",
        "secret",
        "code",
        "authorization",
        "plaid_secret",
        "public_token",
        "access_token_encrypted",
        "login_id",
        "login_id_encrypted",
        "mfa_secret",
        "cookie",
    }
)


def _client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    if request.client:
        return request.client.host[:64]
    return None


def _user_agent(request: Request | None) -> str | None:
    if request is None:
        return None
    ua = request.headers.get("user-agent")
    if not ua:
        return None
    return ua[:255]


def _sanitize_meta(meta: dict[str, Any] | None) -> dict[str, Any] | None:
    if not meta:
        return None
    clean: dict[str, Any] = {}
    for key, value in meta.items():
        lowered = str(key).lower()
        if lowered in _SECRET_KEYS or any(s in lowered for s in ("password", "secret", "token")):
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            clean[str(key)[:64]] = value if not isinstance(value, str) else value[:200]
        else:
            clean[str(key)[:64]] = str(value)[:200]
    return clean or None


async def record_security_event(
    db: AsyncSession,
    *,
    event_type: str,
    user_id: uuid.UUID | None = None,
    request: Request | None = None,
    meta: dict[str, Any] | None = None,
    commit: bool = False,
) -> SecurityEvent:
    """Append a security_events row. Caller commits unless commit=True."""
    event = SecurityEvent(
        user_id=user_id,
        event_type=event_type[:64],
        ip=_client_ip(request),
        user_agent=_user_agent(request),
        meta=_sanitize_meta(meta),
    )
    db.add(event)
    if commit:
        await db.commit()
    else:
        await db.flush()
    _logger.info(
        json.dumps(
            {
                "event": "security_event",
                "event_type": event.event_type,
                "user_id": str(user_id) if user_id else None,
                "ip": event.ip,
                "meta": event.meta,
            },
            default=str,
        )
    )
    return event
