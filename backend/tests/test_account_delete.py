from tests.conftest import register_and_login


async def test_account_delete_requires_challenge_and_password(client, register_payload):
    tokens = await register_and_login(client, register_payload)
    auth = {"Authorization": f"Bearer {tokens['access_token']}"}

    # Confirm without request fails.
    resp = await client.post(
        "/v1/account/delete/confirm",
        headers=auth,
        json={"code": "000000", "confirm": "DELETE", "password": register_payload["password"]},
    )
    assert resp.status_code == 400

    resp = await client.post("/v1/account/delete/request", headers=auth)
    assert resp.status_code == 200
    body = resp.json()
    assert body["delivery"] == "inline"
    assert body["requires_password"] is True
    assert body["code"] and len(body["code"]) == 6

    # Wrong confirm phrase.
    resp = await client.post(
        "/v1/account/delete/confirm",
        headers=auth,
        json={
            "code": body["code"],
            "confirm": "please",
            "password": register_payload["password"],
        },
    )
    assert resp.status_code == 400

    # Wrong password.
    resp = await client.post(
        "/v1/account/delete/confirm",
        headers=auth,
        json={"code": body["code"], "confirm": "DELETE", "password": "wrong-password-xx"},
    )
    assert resp.status_code == 401

    # Success.
    resp = await client.post(
        "/v1/account/delete/confirm",
        headers=auth,
        json={
            "code": body["code"],
            "confirm": "DELETE",
            "password": register_payload["password"],
        },
    )
    assert resp.status_code == 200
    assert resp.json()["deleted"] is True

    # Session / user gone.
    resp = await client.get("/v1/users/me", headers=auth)
    assert resp.status_code == 401

    resp = await client.post(
        "/v1/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    )
    assert resp.status_code == 401


async def test_account_delete_rejects_bad_otp(client, register_payload):
    tokens = await register_and_login(client, {**register_payload, "email": "otp@example.com"})
    auth = {"Authorization": f"Bearer {tokens['access_token']}"}

    resp = await client.post("/v1/account/delete/request", headers=auth)
    assert resp.status_code == 200

    resp = await client.post(
        "/v1/account/delete/confirm",
        headers=auth,
        json={
            "code": "999999",
            "confirm": "DELETE",
            "password": register_payload["password"],
        },
    )
    assert resp.status_code == 401


async def test_account_delete_rate_limits_requests(client, register_payload):
    tokens = await register_and_login(client, {**register_payload, "email": "rate@example.com"})
    auth = {"Authorization": f"Bearer {tokens['access_token']}"}

    for _ in range(5):
        assert (await client.post("/v1/account/delete/request", headers=auth)).status_code == 200

    resp = await client.post("/v1/account/delete/request", headers=auth)
    assert resp.status_code == 429
