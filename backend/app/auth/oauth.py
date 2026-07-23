"""OAuth / SSO helpers (Google first; Apple & Microsoft when configured)."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx

from app.core.config import Settings


@dataclass
class OAuthProviderInfo:
    id: str
    name: str
    enabled: bool
    auth_url: str | None = None


def configured_providers(settings: Settings, redirect_uri: str) -> list[OAuthProviderInfo]:
    providers: list[OAuthProviderInfo] = []
    google_enabled = bool(settings.google_oauth_client_id and settings.google_oauth_client_secret)
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
                "state": secrets.token_urlsafe(16),
            }
        )
        google_url = f"https://accounts.google.com/o/oauth2/v2/auth?{params}"
    providers.append(
        OAuthProviderInfo(id="google", name="Google", enabled=google_enabled, auth_url=google_url)
    )
    apple_enabled = bool(settings.apple_oauth_client_id and settings.apple_oauth_team_id)
    providers.append(
        OAuthProviderInfo(id="apple", name="Apple", enabled=apple_enabled, auth_url=None)
    )
    ms_enabled = bool(settings.microsoft_oauth_client_id and settings.microsoft_oauth_client_secret)
    providers.append(
        OAuthProviderInfo(id="microsoft", name="Microsoft", enabled=ms_enabled, auth_url=None)
    )
    return providers


async def exchange_google_code(settings: Settings, code: str, redirect_uri: str) -> dict[str, Any]:
    if not settings.google_oauth_client_id or not settings.google_oauth_client_secret:
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
        token_resp.raise_for_status()
        tokens = token_resp.json()
        user_resp = await client.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        user_resp.raise_for_status()
        return user_resp.json()
