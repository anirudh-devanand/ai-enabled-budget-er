"""Security headers, auth rate limits, ops fail-closed."""

from __future__ import annotations

from app.core.rate_limit import reset_rate_limits_for_tests
from tests.conftest import register_and_login


async def test_healthz_sets_security_headers(client):
    resp = await client.get("/healthz")
    assert resp.status_code == 200
    assert resp.headers.get("x-content-type-options") == "nosniff"
    assert resp.headers.get("x-frame-options") == "DENY"
    assert resp.headers.get("referrer-policy") == "no-referrer"
    assert "frame-ancestors" in (resp.headers.get("content-security-policy") or "")


async def test_login_rate_limited(client, register_payload):
    reset_rate_limits_for_tests()
    await register_and_login(client, register_payload)
    # Burn remaining attempts with wrong passwords from same IP
    last = None
    for _ in range(25):
        last = await client.post(
            "/v1/auth/login",
            json={"email": register_payload["email"], "password": "wrong-password-here"},
        )
        if last.status_code == 429:
            break
    assert last is not None
    assert last.status_code == 429


async def test_ops_requires_token(client):
    resp = await client.post("/v1/ops/sync-all")
    assert resp.status_code == 401
    ok = await client.post(
        "/v1/ops/sync-all",
        headers={"X-Ops-Token": "test-ops-token"},
    )
    # May 200 or fail downstream, but must not be 503 "not configured"
    assert ok.status_code != 503
    assert ok.status_code != 401
