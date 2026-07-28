"""HttpOnly cookie refresh + MFA bank gate + field encryption helpers."""

from __future__ import annotations

import pyotp

from app.core.security import decrypt_field, encrypt_field
from tests.conftest import enable_mfa, register_and_login


async def test_refresh_via_http_only_cookie(client, register_payload):
    await client.post("/v1/auth/register", json=register_payload)
    login = await client.post(
        "/v1/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
        headers={"X-Woney-Session": "cookie"},
    )
    assert login.status_code == 200
    body = login.json()
    assert body["access_token"]
    assert body["refresh_token"] == ""
    assert "woney_refresh" in login.cookies

    refreshed = await client.post(
        "/v1/auth/refresh",
        json={},
        headers={"X-Woney-Session": "cookie"},
    )
    assert refreshed.status_code == 200, refreshed.text
    assert refreshed.json()["refresh_token"] == ""
    assert refreshed.json()["access_token"]


async def test_refresh_still_accepts_body_token(client, register_payload):
    tokens = await register_and_login(client, register_payload)
    resp = await client.post("/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert resp.status_code == 200
    assert resp.json()["refresh_token"]
    assert resp.json()["refresh_token"] != tokens["refresh_token"]


async def test_logout_clears_refresh_cookie(client, register_payload):
    await client.post("/v1/auth/register", json=register_payload)
    login = await client.post(
        "/v1/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
        headers={"X-Woney-Session": "cookie"},
    )
    assert "woney_refresh" in login.cookies
    out = await client.post("/v1/auth/logout", json={}, headers={"X-Woney-Session": "cookie"})
    assert out.status_code == 204
    # Cookie cleared — refresh without body must fail
    bad = await client.post("/v1/auth/refresh", json={}, headers={"X-Woney-Session": "cookie"})
    assert bad.status_code == 401


async def test_plaid_link_requires_mfa(client, register_payload):
    tokens = await register_and_login(client, register_payload)
    auth = {"Authorization": f"Bearer {tokens['access_token']}"}
    households = (await client.get("/v1/households/", headers=auth)).json()
    hid = households[0]["id"]
    resp = await client.post(
        "/v1/connections/plaid/link-token",
        json={"household_id": hid},
        headers=auth,
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "mfa_required"

    await enable_mfa(client, tokens)
    # After MFA, may be 503 if Plaid unset — but not 403 mfa_required
    resp2 = await client.post(
        "/v1/connections/plaid/link-token",
        json={"household_id": hid},
        headers=auth,
    )
    assert resp2.status_code != 403


async def test_sync_mine_requires_mfa(client, register_payload):
    tokens = await register_and_login(client, register_payload)
    auth = {"Authorization": f"Bearer {tokens['access_token']}"}
    resp = await client.post("/v1/connections/sync-mine", headers=auth)
    assert resp.status_code == 403
    assert resp.json()["detail"] == "mfa_required"


async def test_encrypt_field_roundtrip():
    cipher = encrypt_field("TIM HORTONS #123")
    assert cipher and cipher.startswith("enc:v1:")
    assert decrypt_field(cipher) == "TIM HORTONS #123"
    assert decrypt_field("legacy plaintext") == "legacy plaintext"
    assert decrypt_field(None) is None
