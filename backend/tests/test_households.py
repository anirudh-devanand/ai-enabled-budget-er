from tests.conftest import register_and_login


async def _auth_headers(client, payload) -> dict:
    tokens = await register_and_login(client, payload)
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def test_create_and_get_household(client, register_payload):
    headers = await _auth_headers(client, register_payload)

    resp = await client.post("/v1/households/", json={"name": "Trip fund"}, headers=headers)
    assert resp.status_code == 201
    household_id = resp.json()["id"]

    resp = await client.get(f"/v1/households/{household_id}", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Trip fund"
    assert len(body["members"]) == 1
    assert body["members"][0]["role"] == "owner"


async def test_household_not_visible_to_non_member(client, register_payload):
    headers_a = await _auth_headers(client, register_payload)
    resp = await client.post("/v1/households/", json={"name": "Private"}, headers=headers_a)
    household_id = resp.json()["id"]

    headers_b = await _auth_headers(
        client,
        {"email": "bob@example.com", "password": "another-long-pass", "display_name": "Bob"},
    )
    resp = await client.get(f"/v1/households/{household_id}", headers=headers_b)
    assert resp.status_code == 404
