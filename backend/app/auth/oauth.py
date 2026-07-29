"""OAuth / SSO helpers (Google, Apple, Microsoft when configured)."""

from __future__ import annotations

import base64
import secrets
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode, urlparse

import httpx
import jwt
from fastapi import Request

from app.core.config import Settings


def origin_from_request(request: Request) -> str | None:
    """Browser Origin header, or scheme+host from Referer."""
    origin = (request.headers.get("origin") or "").strip().rstrip("/")
    if origin:
        return origin
    referer = (request.headers.get("referer") or "").strip()
    if not referer:
        return None
    parsed = urlparse(referer)
    if not parsed.scheme or not parsed.netloc:
        return None
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def resolve_oauth_redirect_uri(settings: Settings, request: Request | None = None) -> str:
    """Prefer the caller's origin callback when that origin is CORS-allowed."""
    if request is not None:
        origin = origin_from_request(request)
        if origin and origin in settings.cors_origin_list():
            return f"{origin}/login/oauth/callback"
    return settings.oauth_redirect_uri


def is_allowed_oauth_redirect(settings: Settings, redirect_uri: str) -> bool:
    """True when redirect_uri is the configured default or a CORS origin callback."""
    cleaned = redirect_uri.strip()
    if cleaned == settings.oauth_redirect_uri:
        return True
    suffix = "/login/oauth/callback"
    if not cleaned.endswith(suffix):
        return False
    origin = cleaned[: -len(suffix)].rstrip("/")
    return origin in settings.cors_origin_list()


@dataclass
class OAuthProviderInfo:
    id: str
    name: str
    enabled: bool
    auth_url: str | None = None


def _b64url(raw: str) -> str:
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii").rstrip("=")


def _b64url_decode(raw: str) -> str | None:
    try:
        pad = "=" * (-len(raw) % 4)
        return base64.urlsafe_b64decode(raw + pad).decode("utf-8")
    except Exception:
        return None


def _state(provider: str, redirect_uri: str) -> str:
    """provider:nonce:b64(redirect_uri) — redirect must match token exchange exactly."""
    return f"{provider}:{secrets.token_urlsafe(16)}:{_b64url(redirect_uri)}"


def redirect_uri_from_state(state: str | None) -> str | None:
    """Extract the authorize redirect_uri embedded in OAuth state."""
    if not state or ":" not in state:
        return None
    parts = state.split(":", 2)
    if len(parts) < 3:
        return None
    return _b64url_decode(parts[2])


def configured_providers(settings: Settings, redirect_uri: str) -> list[OAuthProviderInfo]:
    providers: list[OAuthProviderInfo] = []

    google_enabled = settings.google_oauth_configured
    google_url = None
    if google_enabled:
        params = urlencode(
            {
                "client_id": settings.google_oauth_client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": "openid email profile",
                "access_type": "online",
                "prompt": "select_account",
                "state": _state("google", redirect_uri),
            }
        )
        google_url = f"https://accounts.google.com/o/oauth2/v2/auth?{params}"
    providers.append(
        OAuthProviderInfo(id="google", name="Google", enabled=google_enabled, auth_url=google_url)
    )

    apple_enabled = settings.apple_oauth_configured
    apple_url = None
    if apple_enabled:
        params = urlencode(
            {
                "client_id": settings.apple_oauth_client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "response_mode": "query",
                "scope": "name email",
                "state": _state("apple", redirect_uri),
            }
        )
        apple_url = f"https://appleid.apple.com/auth/authorize?{params}"
    providers.append(
        OAuthProviderInfo(id="apple", name="Apple", enabled=apple_enabled, auth_url=apple_url)
    )

    ms_enabled = settings.microsoft_oauth_configured
    ms_url = None
    if ms_enabled:
        params = urlencode(
            {
                "client_id": settings.microsoft_oauth_client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "response_mode": "query",
                "scope": "openid email profile User.Read",
                "state": _state("microsoft", redirect_uri),
            }
        )
        ms_url = f"https://login.microsoftonline.com/common/oauth2/v2.0/authorize?{params}"
    providers.append(
        OAuthProviderInfo(id="microsoft", name="Microsoft", enabled=ms_enabled, auth_url=ms_url)
    )
    return providers


def _oauth_http_error_message(provider: str, resp: httpx.Response) -> str:
    """Prefer provider error_description over opaque HTTP status text."""
    detail = ""
    try:
        payload = resp.json()
        if isinstance(payload, dict):
            detail = str(
                payload.get("error_description")
                or payload.get("error")
                or payload.get("message")
                or ""
            ).strip()
    except Exception:
        detail = (resp.text or "").strip()[:240]
    if detail:
        return f"{provider} OAuth failed ({resp.status_code}): {detail}"
    return f"{provider} OAuth failed ({resp.status_code})"


async def exchange_google_code(settings: Settings, code: str, redirect_uri: str) -> dict[str, Any]:
    if not settings.google_oauth_configured:
        raise RuntimeError("Google OAuth is not configured")
    async with httpx.AsyncClient(timeout=20) as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_oauth_client_id,
                "client_secret": settings.google_oauth_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code >= 400:
            raise RuntimeError(_oauth_http_error_message("Google", token_resp))
        tokens = token_resp.json()
        user_resp = await client.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        if user_resp.status_code >= 400:
            raise RuntimeError(_oauth_http_error_message("Google userinfo", user_resp))
        return user_resp.json()


def _apple_client_secret(settings: Settings) -> str:
    """Apple requires a short-lived ES256 JWT as the OAuth client_secret."""
    if not settings.apple_oauth_configured:
        raise RuntimeError("Apple OAuth is not configured")
    now = int(time.time())
    headers = {"kid": settings.apple_oauth_key_id, "alg": "ES256"}
    payload = {
        "iss": settings.apple_oauth_team_id,
        "iat": now,
        "exp": now + 60 * 50,
        "aud": "https://appleid.apple.com",
        "sub": settings.apple_oauth_client_id,
    }
    return jwt.encode(
        payload,
        settings.apple_oauth_private_key,
        algorithm="ES256",
        headers=headers,
    )


async def exchange_apple_code(settings: Settings, code: str, redirect_uri: str) -> dict[str, Any]:
    if not settings.apple_oauth_configured:
        raise RuntimeError("Apple OAuth is not configured")
    client_secret = _apple_client_secret(settings)
    async with httpx.AsyncClient(timeout=20) as client:
        token_resp = await client.post(
            "https://appleid.apple.com/auth/token",
            data={
                "code": code,
                "client_id": settings.apple_oauth_client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if token_resp.status_code >= 400:
            raise RuntimeError(_oauth_http_error_message("Apple", token_resp))
        tokens = token_resp.json()

    id_token = tokens.get("id_token")
    if not id_token:
        raise RuntimeError("Apple did not return an id_token")
    # Signature verification against Apple JWKS can be added later; we already
    # redeemed the one-time code with Apple's token endpoint.
    claims = jwt.decode(id_token, options={"verify_signature": False})
    email = (claims.get("email") or "").lower()
    subject = claims.get("sub")
    if not subject:
        raise RuntimeError("Apple profile incomplete (missing sub)")
    if not email:
        # Hide-my-email / first-login edge: use a stable synthetic mailbox.
        email = f"{subject}@privaterelay.appleid.com"
    return {
        "sub": subject,
        "email": email,
        "name": claims.get("name") or email.split("@")[0],
    }


async def exchange_microsoft_code(settings: Settings, code: str, redirect_uri: str) -> dict[str, Any]:
    if not settings.microsoft_oauth_configured:
        raise RuntimeError("Microsoft OAuth is not configured")
    async with httpx.AsyncClient(timeout=20) as client:
        token_resp = await client.post(
            "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            data={
                "code": code,
                "client_id": settings.microsoft_oauth_client_id,
                "client_secret": settings.microsoft_oauth_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code >= 400:
            raise RuntimeError(_oauth_http_error_message("Microsoft", token_resp))
        tokens = token_resp.json()
        access = tokens.get("access_token")
        if not access:
            raise RuntimeError("Microsoft did not return an access_token")

        # Prefer Graph profile; fall back to id_token claims.
        email = ""
        subject = ""
        name = ""
        try:
            user_resp = await client.get(
                "https://graph.microsoft.com/v1.0/me",
                headers={"Authorization": f"Bearer {access}"},
            )
            if user_resp.status_code < 400:
                profile = user_resp.json()
                email = (
                    profile.get("mail")
                    or profile.get("userPrincipalName")
                    or ""
                ).lower()
                subject = str(profile.get("id") or "")
                name = profile.get("displayName") or ""
        except httpx.HTTPError:
            pass

        if not subject or not email:
            id_token = tokens.get("id_token")
            if id_token:
                claims = jwt.decode(id_token, options={"verify_signature": False})
                subject = subject or str(claims.get("oid") or claims.get("sub") or "")
                email = email or (claims.get("email") or claims.get("preferred_username") or "").lower()
                name = name or claims.get("name") or ""

        if not subject or not email:
            raise RuntimeError("Microsoft profile incomplete")
        return {"sub": subject, "email": email, "name": name or email.split("@")[0]}
