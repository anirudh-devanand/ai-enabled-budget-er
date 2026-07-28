"""HttpOnly refresh-token cookie helpers.

Web (Vercel) and API (Render) are different sites, so production cookies use
SameSite=None; Secure with CORS credentials. Mobile keeps JSON body refresh.
"""

from __future__ import annotations

from fastapi import Request, Response

from app.core.config import get_settings

REFRESH_COOKIE_NAME = "woney_refresh"


def _cookie_flags(request: Request | None = None) -> tuple[bool, str]:
    """Return (secure, samesite) for the refresh cookie."""
    settings = get_settings()
    forwarded = ""
    if request is not None:
        forwarded = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip().lower()
        scheme = (request.url.scheme or "").lower()
    else:
        scheme = ""
    https = scheme == "https" or forwarded == "https"
    if settings.env == "production":
        # Cross-site Vercel → Render requires None + Secure.
        return True, "none"
    if https:
        return True, "lax"
    return False, "lax"


def refresh_cookie_max_age() -> int:
    return get_settings().refresh_token_days * 24 * 60 * 60


def set_refresh_cookie(response: Response, token: str, request: Request | None = None) -> None:
    secure, samesite = _cookie_flags(request)
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        max_age=refresh_cookie_max_age(),
        path="/",
        httponly=True,
        secure=secure,
        samesite=samesite,
    )


def clear_refresh_cookie(response: Response, request: Request | None = None) -> None:
    secure, samesite = _cookie_flags(request)
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=secure,
        samesite=samesite,
    )


def read_refresh_token(request: Request, body_token: str | None) -> str | None:
    """Prefer explicit JSON body (mobile); fall back to HttpOnly cookie (web)."""
    if body_token and body_token.strip():
        return body_token.strip()
    cookie = request.cookies.get(REFRESH_COOKIE_NAME)
    if cookie and cookie.strip():
        return cookie.strip()
    return None
