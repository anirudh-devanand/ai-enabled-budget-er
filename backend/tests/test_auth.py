import pyotp

from tests.conftest import login_complete, register_and_login


async def test_register_creates_user_and_personal_household(client, register_payload):
    resp = await client.post("/v1/auth/register", json=register_payload)
    assert resp.status_code == 201
    body = resp.json()
    assert body["email"] == "ada@example.com"
    assert body["mfa_enabled"] is True
    assert "password" not in resp.text

    tokens = await register_and_login(
        client, {**register_payload, "email": "ada2@example.com"}
    )
    resp = await client.get(
        "/v1/households/", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert resp.status_code == 200
    households = resp.json()
    assert len(households) == 1
    assert households[0]["name"] == "Ada's household"


async def test_register_duplicate_email_conflicts(client, register_payload):
    assert (await client.post("/v1/auth/register", json=register_payload)).status_code == 201
    assert (await client.post("/v1/auth/register", json=register_payload)).status_code == 409


async def test_login_wrong_password_rejected(client, register_payload):
    await client.post("/v1/auth/register", json=register_payload)
    resp = await client.post(
        "/v1/auth/login", json={"email": register_payload["email"], "password": "wrong-password-x"}
    )
    assert resp.status_code == 401


async def test_me_requires_and_accepts_token(client, register_payload):
    assert (await client.get("/v1/users/me")).status_code == 401

    tokens = await register_and_login(client, register_payload)
    resp = await client.get(
        "/v1/users/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert resp.status_code == 200
    assert resp.json()["email"] == register_payload["email"]


async def test_refresh_rotates_and_old_token_dies(client, register_payload):
    tokens = await register_and_login(client, register_payload)

    resp = await client.post("/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert resp.status_code == 200
    new_tokens = resp.json()
    assert new_tokens["refresh_token"] != tokens["refresh_token"]

    # Reusing the rotated-out token must fail.
    resp = await client.post("/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert resp.status_code == 401

    # The new one still works.
    resp = await client.post(
        "/v1/auth/refresh", json={"refresh_token": new_tokens["refresh_token"]}
    )
    assert resp.status_code == 200


async def test_logout_revokes_session(client, register_payload):
    tokens = await register_and_login(client, register_payload)
    resp = await client.post("/v1/auth/logout", json={"refresh_token": tokens["refresh_token"]})
    assert resp.status_code == 204
    resp = await client.post("/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert resp.status_code == 401


async def test_logout_all_revokes_every_session(client, register_payload):
    tokens_a = await register_and_login(client, register_payload)
    _, tokens_b = await login_complete(
        client, register_payload["email"], register_payload["password"]
    )

    resp = await client.post(
        "/v1/auth/logout-all", headers={"Authorization": f"Bearer {tokens_a['access_token']}"}
    )
    assert resp.status_code == 204

    for tokens in (tokens_a, tokens_b):
        resp = await client.post(
            "/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
        )
        assert resp.status_code == 401


async def test_mfa_enroll_activate_and_login_flow(client, register_payload):
    tokens = await register_and_login(client, register_payload)
    auth = {"Authorization": f"Bearer {tokens['access_token']}"}

    resp = await client.post("/v1/auth/mfa/enroll", headers=auth)
    assert resp.status_code == 200
    secret = resp.json()["secret"]
    assert "otpauth://" in resp.json()["otpauth_uri"]

    # Wrong code rejected, correct code activates.
    resp = await client.post("/v1/auth/mfa/activate", json={"code": "000000"}, headers=auth)
    assert resp.status_code == 400
    code = pyotp.TOTP(secret).now()
    resp = await client.post("/v1/auth/mfa/activate", json={"code": code}, headers=auth)
    assert resp.status_code == 200
    recovery = resp.json()["recovery_codes"]
    assert len(recovery) == 10

    # Login now returns a challenge instead of tokens.
    resp = await client.post(
        "/v1/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("mfa_required") is True
    assert "access_token" not in body

    # Completing the challenge with a TOTP code yields tokens.
    code = pyotp.TOTP(secret).now()
    resp = await client.post(
        "/v1/auth/mfa/verify",
        json={"challenge_token": body["challenge_token"], "code": code},
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()

    # Recovery code also works once, then is consumed.
    resp = await client.post(
        "/v1/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    )
    challenge = resp.json()["challenge_token"]
    resp = await client.post(
        "/v1/auth/mfa/verify",
        json={"challenge_token": challenge, "code": recovery[0]},
    )
    assert resp.status_code == 200
    resp = await client.post(
        "/v1/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    )
    challenge = resp.json()["challenge_token"]
    resp = await client.post(
        "/v1/auth/mfa/verify",
        json={"challenge_token": challenge, "code": recovery[0]},
    )
    assert resp.status_code == 401


async def test_refresh_and_logout_via_httponly_cookie(client, register_payload):
    await register_and_login(client, register_payload)
    login_resp, _ = await login_complete(
        client, register_payload["email"], register_payload["password"]
    )
    assert "woney_refresh" in login_resp.cookies
    cookie_val = login_resp.cookies["woney_refresh"]
    set_cookie = login_resp.headers.get("set-cookie", "")
    assert "woney_refresh=" in set_cookie
    assert "HttpOnly" in set_cookie or "httponly" in set_cookie.lower()

    client.cookies.set("woney_refresh", cookie_val)
    resp = await client.post("/v1/auth/refresh", json={})
    assert resp.status_code == 200, resp.text
    new_tokens = resp.json()
    assert new_tokens["refresh_token"] != cookie_val
    assert "woney_refresh" in resp.cookies

    # Body path still works (mobile SecureStore).
    resp = await client.post(
        "/v1/auth/refresh", json={"refresh_token": new_tokens["refresh_token"]}
    )
    assert resp.status_code == 200
    latest = resp.cookies.get("woney_refresh") or resp.json()["refresh_token"]
    client.cookies.set("woney_refresh", latest)

    resp = await client.post("/v1/auth/logout", json={})
    assert resp.status_code == 204

    resp = await client.post("/v1/auth/refresh", json={})
    assert resp.status_code == 401


async def test_refresh_accepts_body_without_cookie(client, register_payload):
    tokens = await register_and_login(client, register_payload)
    client.cookies.clear()
    resp = await client.post(
        "/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()
