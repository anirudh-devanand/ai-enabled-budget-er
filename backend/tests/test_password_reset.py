import os

from app.core.config import get_settings
from tests.conftest import complete_mfa_if_needed, register_and_login


async def test_password_reset_roundtrip_dev_fallback(client, register_payload):
    await register_and_login(client, register_payload)

    # Ensure non-production so missing Resend returns a dev_reset_url.
    os.environ["WONEY_ENV"] = "development"
    get_settings.cache_clear()

    resp = await client.post(
        "/v1/auth/password-reset/request",
        json={"email": register_payload["email"]},
        headers={"Origin": "http://localhost:3000"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "account exists" in body["message"].lower() or "reset" in body["message"].lower()
    assert body.get("dev_reset_url")
    token = body["dev_reset_url"].split("token=")[-1]
    assert len(token) >= 16

    new_password = "Brand-New-Pass99"
    resp = await client.post(
        "/v1/auth/password-reset/confirm",
        json={"token": token, "password": new_password},
    )
    assert resp.status_code == 204, resp.text

    # Old password fails; new password works (through MFA when enabled).
    resp = await client.post(
        "/v1/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    )
    assert resp.status_code == 401

    resp = await client.post(
        "/v1/auth/login",
        json={"email": register_payload["email"], "password": new_password},
    )
    _, tokens = await complete_mfa_if_needed(client, resp)
    assert "access_token" in tokens

    # Token is single-use.
    resp = await client.post(
        "/v1/auth/password-reset/confirm",
        json={"token": token, "password": "Another-Strong1"},
    )
    assert resp.status_code == 400


async def test_password_reset_unknown_email_is_generic(client):
    resp = await client.post(
        "/v1/auth/password-reset/request",
        json={"email": "nobody-here@example.com"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("dev_reset_url") is None
    assert "message" in body


async def test_password_reset_rejects_weak_password(client, register_payload):
    await register_and_login(client, register_payload)
    os.environ["WONEY_ENV"] = "development"
    get_settings.cache_clear()

    resp = await client.post(
        "/v1/auth/password-reset/request",
        json={"email": register_payload["email"]},
    )
    token = resp.json()["dev_reset_url"].split("token=")[-1]
    resp = await client.post(
        "/v1/auth/password-reset/confirm",
        json={"token": token, "password": "short"},
    )
    assert resp.status_code in (400, 422)


async def test_password_reset_invalid_token(client):
    resp = await client.post(
        "/v1/auth/password-reset/confirm",
        json={"token": "definitely-not-a-real-token-value", "password": "Valid-Password99"},
    )
    assert resp.status_code == 400
    assert "invalid" in resp.json()["detail"].lower() or "used" in resp.json()["detail"].lower()


async def test_register_duplicate_message_is_clear(client, register_payload):
    assert (await client.post("/v1/auth/register", json=register_payload)).status_code == 201
    resp = await client.post("/v1/auth/register", json=register_payload)
    assert resp.status_code == 409
    detail = resp.json()["detail"].lower()
    assert "already exists" in detail
    assert "sign in" in detail or "reset" in detail


async def test_oauth_providers_use_request_origin(client):
    os.environ["WONEY_GOOGLE_OAUTH_CLIENT_ID"] = "test-client.apps.googleusercontent.com"
    os.environ["WONEY_GOOGLE_OAUTH_CLIENT_SECRET"] = "test-secret"
    get_settings.cache_clear()

    resp = await client.get(
        "/v1/auth/oauth/providers",
        headers={"Origin": "https://woneyai.vercel.app"},
    )
    assert resp.status_code == 200
    providers = resp.json()["providers"]
    google = next(p for p in providers if p["id"] == "google")
    assert google["enabled"] is True
    assert "woneyai.vercel.app" in (google["auth_url"] or "")

    # Cleanup so other tests stay isolated.
    os.environ.pop("WONEY_GOOGLE_OAUTH_CLIENT_ID", None)
    os.environ.pop("WONEY_GOOGLE_OAUTH_CLIENT_SECRET", None)
    get_settings.cache_clear()
