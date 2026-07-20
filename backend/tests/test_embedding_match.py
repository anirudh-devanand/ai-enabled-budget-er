from datetime import date
from decimal import Decimal

from app.connections.provider import ProviderAccount, ProviderSnapshot, ProviderTransaction
from app.connections.router import get_provider
from app.main import app
from tests.conftest import register_and_login
from tests.test_connections import FakeProvider


def _txn(eid: str, desc: str, amount: str, day: int) -> ProviderTransaction:
    return ProviderTransaction(
        external_id=eid,
        date=date(2026, 7, day),
        description=desc,
        amount=Decimal(amount),
        currency="CAD",
    )


def _snapshot(txns: list[ProviderTransaction]) -> ProviderSnapshot:
    return ProviderSnapshot(
        request_id="req-emb",
        institution_name="Neo Financial",
        accounts=[
            ProviderAccount(
                external_id="acc-1",
                name="Neo Everyday",
                type="Operations",
                currency="CAD",
                balance=Decimal("100"),
                transactions=txns,
            )
        ],
    )


async def test_embedding_stage_matches_similar_descriptor_after_correction(
    client, register_payload
):
    """Correct one messy descriptor; a later similar-but-not-identical one
    should resolve via embedding rather than staying unresolved."""
    tokens = await register_and_login(client, register_payload)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    household_id = (await client.get("/v1/households/", headers=headers)).json()[0]["id"]

    provider = FakeProvider(
        _snapshot([_txn("t1", "BLUE BOTTLE ROASTERS #441 VAN", "-8.50", 1)])
    )
    app.dependency_overrides[get_provider] = lambda: provider
    await client.post(
        "/v1/connections/",
        json={"household_id": household_id, "login_id": "login-emb-1"},
        headers=headers,
    )

    items = (
        await client.get(
            f"/v1/connections/transactions?household_id={household_id}", headers=headers
        )
    ).json()["items"]
    assert items[0]["needs_review"] is True

    categories = (await client.get("/v1/categories/", headers=headers)).json()
    dining = next(c for c in categories if c["slug"] == "dining")
    await client.patch(
        f"/v1/transactions/{items[0]['id']}/category",
        json={"category_id": dining["id"], "merchant_name": "Blue Bottle Coffee"},
        headers=headers,
    )

    # New sync with a variant descriptor that global rules don't know.
    provider.snapshot = _snapshot(
        [
            _txn("t1", "BLUE BOTTLE ROASTERS #441 VAN", "-8.50", 1),
            _txn("t2", "BLUE BOTTLE COFFEE TORONTO ON", "-9.25", 10),
        ]
    )
    conn_id = (
        await client.get(f"/v1/connections/?household_id={household_id}", headers=headers)
    ).json()[0]["id"]
    await client.post(f"/v1/connections/{conn_id}/sync", headers=headers)

    items = (
        await client.get(
            f"/v1/connections/transactions?household_id={household_id}", headers=headers
        )
    ).json()["items"]
    by_desc = {t["raw_description"]: t for t in items}
    matched = by_desc["BLUE BOTTLE COFFEE TORONTO ON"]
    assert matched["needs_review"] is False
    assert matched["display_name"] == "Blue Bottle Coffee"
    assert matched["category_name"] == "Dining & Takeout"
