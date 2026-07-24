"""Optional transactional email via Resend (deletion OTPs, password reset)."""

from __future__ import annotations

import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def email_configured() -> bool:
    s = get_settings()
    return bool(s.resend_api_key and s.email_from)


async def _send_resend(to_email: str, subject: str, text: str) -> bool:
    settings = get_settings()
    if not settings.resend_api_key or not settings.email_from:
        return False

    payload = {
        "from": settings.email_from,
        "to": [to_email],
        "subject": subject,
        "text": text,
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {settings.resend_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        if resp.status_code >= 400:
            logger.warning("Resend email failed: %s %s", resp.status_code, resp.text)
            return False
        return True
    except Exception:
        logger.exception("Resend email request failed")
        return False


async def send_deletion_code(to_email: str, code: str) -> bool:
    """Send a one-time deletion code. Returns True if accepted by the provider."""
    return await _send_resend(
        to_email,
        "Your Woney account deletion code",
        (
            f"Your account deletion confirmation code is: {code}\n\n"
            "It expires in 10 minutes. If you did not request this, ignore this email "
            "and secure your account."
        ),
    )


async def send_password_reset_link(to_email: str, reset_url: str) -> bool:
    """Send a password reset link. Returns True if accepted by the provider."""
    return await _send_resend(
        to_email,
        "Reset your Woney password",
        (
            "We received a request to reset your Woney password.\n\n"
            f"Open this link to choose a new password (expires in 1 hour):\n{reset_url}\n\n"
            "If you did not request this, you can ignore this email — your password "
            "will stay the same."
        ),
    )
