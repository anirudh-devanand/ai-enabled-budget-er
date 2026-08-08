"""SnapTrade login encoding + holdings upsert (mocked provider)."""

from datetime import date
from decimal import Decimal

import pytest

from app.connections.provider import (
    ProviderAccount,
    ProviderHolding,
    ProviderSnapshot,
    ProviderTransaction,
)
from app.connections.snaptrade import encode_login_id, parse_login_id
from tests.conftest import enable_mfa, register_and_login
from tests.test_connections import FakeProvider


def test_encode_parse_login_id():
    login = encode_login_id("auth-1", "user-1", "secret-1")
    assert login.startswith("snaptrade:")
    auth, uid, secret = parse_login_id(login)
    assert auth == "auth-1"
    assert uid == "user-1"
    assert secret == "secret-1"


@pytest.mark.asyncio
async def test_holdings_upsert_on_sync(client, register_payload):
    tokens = await register_and_login(client, register_payload)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    await enable_mfa(client, tokens)
    hh = (await client.get("/v1/households/", headers=headers)).json()[0]["id"]

    snapshot = ProviderSnapshot(
        request_id="st-1",
        institution_name="Wealthsimple",
        accounts=[
            ProviderAccount(
                external_id="inv-1",
                name="TFSA",
                type="investment",
                currency="CAD",
                balance=Decimal("1500.00"),
                transactions=[
                    ProviderTransaction(
                        external_id="act-1",
                        date=date(2026, 8, 1),
                        description="DIVIDEND VFV",
                        amount=Decimal("12.50"),
                        currency="CAD",
                    )
                ],
                holdings=[
                    ProviderHolding(
                        external_id="sec-vfv",
                        symbol="VFV",
                        name="Vanguard S&P 500",
                        quantity=Decimal("10"),
                        price=Decimal("140.00"),
                        market_value=Decimal("1400.00"),
                        currency="CAD",
                    ),
                    ProviderHolding(
                        external_id="sec-cash",
                        symbol="CAD",
                        name="Cash",
                        quantity=Decimal("100"),
                        price=Decimal("1"),
                        market_value=Decimal("100.00"),
                        currency="CAD",
                    ),
                ],
            )
        ],
    )
    fake = FakeProvider(snapshot=snapshot)
    from app.main import app
    from app.connections.router import get_provider

    app.dependency_overrides[get_provider] = lambda: fake
    try:
        # Create via legacy demo path then replace — use create_connection + sync
        # through API with a snaptrade-shaped login via internal service would need DB.
        # Instead hit sync after creating a connection with FakeProvider via override
        # and a plaid-like create using demo seed then... simpler: POST demo then
        # manually can't inject holdings. Use createConnection with demo and sync
        # won't use our snapshot. Override alone isn't enough without matching login.

        # Direct service-level path through HTTP: create connection with login that
        # FakeProvider accepts (any login when snapshot set).
        resp = await client.post(
            "/v1/connections/",
            headers=headers,
            json={"household_id": hh, "login_id": "demo-seed:scotia:30"},
        )
        # Demo login id; FakeProvider override supplies investment snapshot on create sync.
        assert resp.status_code == 201, resp.text

        accounts = (
            await client.get(f"/v1/connections/accounts?household_id={hh}", headers=headers)
        ).json()
        inv = next(a for a in accounts if a["type"] == "investment")
        holds = (
            await client.get(
                f"/v1/connections/accounts/{inv['id']}/holdings", headers=headers
            )
        ).json()
        assert len(holds["items"]) == 2
        symbols = {h["symbol"] for h in holds["items"]}
        assert "VFV" in symbols

        household_holds = (
            await client.get(
                f"/v1/connections/holdings?household_id={hh}", headers=headers
            )
        ).json()
        assert len(household_holds["items"]) == 2
    finally:
        app.dependency_overrides.pop(get_provider, None)


@pytest.mark.asyncio
async def test_snaptrade_portal_requires_config(client, register_payload):
    tokens = await register_and_login(client, register_payload)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    await enable_mfa(client, tokens)
    hh = (await client.get("/v1/households/", headers=headers)).json()[0]["id"]
    resp = await client.post(
        "/v1/connections/snaptrade/portal",
        headers=headers,
        json={"household_id": hh, "broker": "wealthsimple"},
    )
    # Without SnapTrade env, expect 503
    assert resp.status_code == 503
