from datetime import date
from decimal import Decimal

from app.connections.provider import (
    ProviderAccount,
    ProviderError,
    ProviderSnapshot,
    ProviderTransaction,
)
from app.connections.router import get_provider
from app.main import app
from tests.conftest import enable_mfa, register_and_login


class FakeProvider:
    def __init__(self, snapshot: ProviderSnapshot | None = None, fail: bool = False):
        self.snapshot = snapshot
        self.fail = fail
        self.calls = 0

    async def fetch_snapshot(self, login_id: str) -> ProviderSnapshot:
        self.calls += 1
        if self.fail or self.snapshot is None:
            raise ProviderError("simulated aggregator failure")
        return self.snapshot


def _snapshot(extra_txn: bool = False) -> ProviderSnapshot:
    transactions = [
        ProviderTransaction(
            external_id="t1",
            date=date(2026, 7, 15),
            description="NEO FINANCIAL PURCHASE 8837261",
            amount=Decimal("-42.50"),
            currency="CAD",
            balance=Decimal("1023.11"),
        ),
        ProviderTransaction(
            external_id="t2",
            date=date(2026, 7, 16),
            description="PAYROLL DEPOSIT ACME LTD",
            amount=Decimal("2150.00"),
            currency="CAD",
        ),
    ]
    if extra_txn:
        transactions.append(
            ProviderTransaction(
                external_id="t3",
                date=date(2026, 7, 18),
                description="SQ *JOES COFFEE TORONTO",
                amount=Decimal("-6.75"),
                currency="CAD",
            )
        )
    return ProviderSnapshot(
        request_id="req-123",
        institution_name="Neo Financial",
        accounts=[
            ProviderAccount(
                external_id="acc-1",
                name="Neo Everyday",
                type="Operations",
                currency="CAD",
                balance=Decimal("1023.11"),
                masked_number="4523",
                transactions=transactions,
            ),
            ProviderAccount(
                external_id="acc-2",
                name="Neo High-Interest Savings",
                type="Savings",
                currency="CAD",
                balance=Decimal("8000.00"),
                transactions=[],
            ),
        ],
    )


async def _setup(client, payload, *, with_mfa: bool = True) -> tuple[dict, str]:
    tokens = await register_and_login(client, payload)
    if with_mfa:
        await enable_mfa(client, tokens)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    resp = await client.get("/v1/households/", headers=headers)
    return headers, resp.json()[0]["id"]


def _use_provider(provider: FakeProvider):
    app.dependency_overrides[get_provider] = lambda: provider


async def test_connect_syncs_accounts_and_transactions(client, register_payload):
    headers, household_id = await _setup(client, register_payload)
    _use_provider(FakeProvider(_snapshot()))

    resp = await client.post(
        "/v1/connections/",
        json={"household_id": household_id, "login_id": "flinks-login-abc123"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "active"
    assert body["institution_name"] == "Neo Financial"
    assert body["last_synced_at"] is not None

    resp = await client.get(
        f"/v1/connections/accounts?household_id={household_id}", headers=headers
    )
    accounts = resp.json()
    assert len(accounts) == 2
    everyday = next(a for a in accounts if a["name"] == "Neo Everyday")
    assert everyday["balance"] == "1023.11"
    assert everyday["masked_number"] == "4523"

    resp = await client.get(
        f"/v1/connections/transactions?household_id={household_id}", headers=headers
    )
    data = resp.json()
    assert data["total"] == 2
    # Newest first.
    assert data["items"][0]["raw_description"] == "PAYROLL DEPOSIT ACME LTD"
    assert data["items"][1]["amount"] == "-42.50"


async def test_resync_is_idempotent_and_picks_up_new_transactions(client, register_payload):
    headers, household_id = await _setup(client, register_payload)
    provider = FakeProvider(_snapshot())
    _use_provider(provider)

    resp = await client.post(
        "/v1/connections/",
        json={"household_id": household_id, "login_id": "flinks-login-abc123"},
        headers=headers,
    )
    connection_id = resp.json()["id"]

    # Same snapshot again: no duplicates.
    resp = await client.post(f"/v1/connections/{connection_id}/sync", headers=headers)
    assert resp.status_code == 200
    resp = await client.get(
        f"/v1/connections/transactions?household_id={household_id}", headers=headers
    )
    assert resp.json()["total"] == 2

    # New transaction appears at the provider: exactly one row added.
    provider.snapshot = _snapshot(extra_txn=True)
    await client.post(f"/v1/connections/{connection_id}/sync", headers=headers)
    resp = await client.get(
        f"/v1/connections/transactions?household_id={household_id}", headers=headers
    )
    data = resp.json()
    assert data["total"] == 3
    assert data["items"][0]["raw_description"] == "SQ *JOES COFFEE TORONTO"


async def test_sync_mine_syncs_user_connections(client, register_payload):
    headers, household_id = await _setup(client, register_payload)
    provider = FakeProvider(_snapshot())
    _use_provider(provider)

    resp = await client.post(
        "/v1/connections/",
        json={"household_id": household_id, "login_id": "flinks-login-abc123"},
        headers=headers,
    )
    assert resp.status_code == 201

    provider.snapshot = _snapshot(extra_txn=True)
    resp = await client.post("/v1/connections/sync-mine", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["synced"] == 1
    assert body["failed"] == 0
    assert body["skipped"] == 0

    resp = await client.get(
        f"/v1/connections/transactions?household_id={household_id}", headers=headers
    )
    assert resp.json()["total"] == 3


async def test_provider_failure_marks_connection_error(client, register_payload):
    headers, household_id = await _setup(client, register_payload)
    _use_provider(FakeProvider(fail=True))

    resp = await client.post(
        "/v1/connections/",
        json={"household_id": household_id, "login_id": "flinks-login-abc123"},
        headers=headers,
    )
    assert resp.status_code == 502

    resp = await client.get(
        f"/v1/connections/?household_id={household_id}", headers=headers
    )
    assert resp.json()[0]["status"] == "error"


async def test_connections_scoped_to_household_membership(client, register_payload):
    headers_a, household_a = await _setup(client, register_payload)
    _use_provider(FakeProvider(_snapshot()))
    await client.post(
        "/v1/connections/",
        json={"household_id": household_a, "login_id": "flinks-login-abc123"},
        headers=headers_a,
    )

    headers_b, _ = await _setup(
        client,
        {"email": "bob@example.com", "password": "another-long-pass", "display_name": "Bob"},
    )
    for path in (
        f"/v1/connections/?household_id={household_a}",
        f"/v1/connections/accounts?household_id={household_a}",
        f"/v1/connections/transactions?household_id={household_a}",
    ):
        resp = await client.get(path, headers=headers_b)
        assert resp.status_code == 404


async def test_live_bank_link_requires_mfa(client, register_payload):
    headers, household_id = await _setup(client, register_payload, with_mfa=False)
    _use_provider(FakeProvider(_snapshot()))

    resp = await client.post(
        "/v1/connections/plaid/link-token",
        json={"household_id": household_id},
        headers=headers,
    )
    assert resp.status_code == 403
    assert "multi-factor" in resp.json()["detail"].lower()

    resp = await client.post(
        "/v1/connections/",
        json={"household_id": household_id, "login_id": "flinks-login-abc123"},
        headers=headers,
    )
    assert resp.status_code == 403

    # Demo seed remains available without MFA.
    resp = await client.post(
        "/v1/connections/",
        json={"household_id": household_id, "login_id": "demo-seed:scotia:30"},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
