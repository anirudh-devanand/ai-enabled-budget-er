from datetime import date
from decimal import Decimal

from app.connections.provider import ProviderAccount, ProviderSnapshot, ProviderTransaction
from app.connections.router import get_provider
from app.main import app
from tests.conftest import register_and_login
from tests.test_connections import FakeProvider


def _txn(external_id: str, description: str, amount: str, day: int) -> ProviderTransaction:
    return ProviderTransaction(
        external_id=external_id,
        date=date(2026, 7, day),
        description=description,
        amount=Decimal(amount),
        currency="CAD",
    )


def _snapshot(transactions: list[ProviderTransaction]) -> ProviderSnapshot:
    return ProviderSnapshot(
        request_id="req-1",
        institution_name="Neo Financial",
        accounts=[
            ProviderAccount(
                external_id="acc-1",
                name="Neo Everyday",
                type="Operations",
                currency="CAD",
                balance=Decimal("500.00"),
                transactions=transactions,
            )
        ],
    )


async def _setup_with_snapshot(client, payload, snapshot) -> tuple[dict, str, FakeProvider]:
    tokens = await register_and_login(client, payload)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    household_id = (await client.get("/v1/households/", headers=headers)).json()[0]["id"]
    provider = FakeProvider(snapshot)
    app.dependency_overrides[get_provider] = lambda: provider
    resp = await client.post(
        "/v1/connections/",
        json={"household_id": household_id, "login_id": "flinks-login-abc123"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return headers, household_id, provider


async def _transactions(client, headers, household_id, extra="") -> dict:
    resp = await client.get(
        f"/v1/connections/transactions?household_id={household_id}{extra}", headers=headers
    )
    assert resp.status_code == 200
    return resp.json()


async def test_sync_enriches_known_merchants_and_flags_unknowns(client, register_payload):
    snapshot = _snapshot(
        [
            _txn("t1", "POS DEBIT TIM HORTONS #1234", "-4.25", 10),
            _txn("t2", "PAYROLL DEPOSIT ACME LTD", "2150.00", 11),
            _txn("t3", "ZZQ HOLDINGS 8837261", "-99.00", 12),
        ]
    )
    headers, household_id, _ = await _setup_with_snapshot(client, register_payload, snapshot)

    data = await _transactions(client, headers, household_id)
    by_desc = {t["raw_description"]: t for t in data["items"]}

    tims = by_desc["POS DEBIT TIM HORTONS #1234"]
    assert tims["display_name"] == "Tim Hortons"
    assert tims["category_name"] == "Dining & Takeout"
    assert tims["needs_review"] is False

    payroll = by_desc["PAYROLL DEPOSIT ACME LTD"]
    assert payroll["category_name"] == "Income"
    assert payroll["merchant_name"] is None
    # No merchant, but the UI still gets a clean display name.
    assert payroll["display_name"] == "Payroll Deposit Acme Ltd"

    unknown = by_desc["ZZQ HOLDINGS 8837261"]
    assert unknown["needs_review"] is True
    assert unknown["category_name"] is None
    assert unknown["display_name"] == "Zzq Holdings"

    review = await _transactions(client, headers, household_id, "&needs_review=true")
    assert review["total"] == 1
    assert review["items"][0]["raw_description"] == "ZZQ HOLDINGS 8837261"


async def test_correction_creates_rule_and_fixes_history_and_future(client, register_payload):
    snapshot = _snapshot(
        [
            _txn("t1", "ZZQ HOLDINGS 8837261", "-99.00", 5),
            _txn("t2", "ZZQ HOLDINGS 1112223", "-45.00", 8),
        ]
    )
    headers, household_id, provider = await _setup_with_snapshot(
        client, register_payload, snapshot
    )

    categories = (await client.get("/v1/categories/", headers=headers)).json()
    shopping = next(c for c in categories if c["slug"] == "shopping")

    review = await _transactions(client, headers, household_id, "&needs_review=true")
    assert review["total"] == 2
    target_id = review["items"][0]["id"]

    # Correct one: the sibling with the same normalized descriptor fixes too.
    resp = await client.patch(
        f"/v1/transactions/{target_id}/category",
        json={"category_id": shopping["id"], "merchant_name": "ZZQ Holdings"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["reapplied_count"] == 1

    data = await _transactions(client, headers, household_id)
    for item in data["items"]:
        assert item["display_name"] == "ZZQ Holdings"
        assert item["category_name"] == "Shopping"
        assert item["needs_review"] is False

    # Future syncs hit the household rule before anything else.
    provider.snapshot = _snapshot(
        [
            _txn("t1", "ZZQ HOLDINGS 8837261", "-99.00", 5),
            _txn("t2", "ZZQ HOLDINGS 1112223", "-45.00", 8),
            _txn("t3", "ZZQ HOLDINGS 9990001", "-12.00", 15),
        ]
    )
    connections = (
        await client.get(f"/v1/connections/?household_id={household_id}", headers=headers)
    ).json()
    await client.post(f"/v1/connections/{connections[0]['id']}/sync", headers=headers)

    data = await _transactions(client, headers, household_id)
    assert data["total"] == 3
    newest = data["items"][0]
    assert newest["raw_description"] == "ZZQ HOLDINGS 9990001"
    assert newest["display_name"] == "ZZQ Holdings"
    assert newest["category_name"] == "Shopping"
    assert newest["needs_review"] is False


async def test_correction_scoped_to_household(client, register_payload):
    snapshot = _snapshot([_txn("t1", "ZZQ HOLDINGS 8837261", "-99.00", 5)])
    headers_a, household_a, _ = await _setup_with_snapshot(client, register_payload, snapshot)
    txn_id = (await _transactions(client, headers_a, household_a))["items"][0]["id"]

    tokens_b = await register_and_login(
        client,
        {"email": "bob@example.com", "password": "another-long-pass", "display_name": "Bob"},
    )
    headers_b = {"Authorization": f"Bearer {tokens_b['access_token']}"}
    categories = (await client.get("/v1/categories/", headers=headers_b)).json()

    resp = await client.patch(
        f"/v1/transactions/{txn_id}/category",
        json={"category_id": categories[0]["id"], "merchant_name": "Nope"},
        headers=headers_b,
    )
    assert resp.status_code == 404
