from datetime import date
from decimal import Decimal

from app.connections.provider import ProviderAccount, ProviderSnapshot, ProviderTransaction
from app.connections.router import get_provider
from app.main import app
from tests.conftest import register_and_login
from tests.test_connections import FakeProvider


def _snapshot() -> ProviderSnapshot:
    return ProviderSnapshot(
        request_id="req-b",
        institution_name="Neo",
        accounts=[
            ProviderAccount(
                external_id="a1",
                name="Chequing",
                type="Operations",
                currency="CAD",
                balance=Decimal("2500"),
                transactions=[
                    ProviderTransaction(
                        external_id="t1",
                        date=date.today().replace(day=min(15, date.today().day)),
                        description="TIM HORTONS #1",
                        amount=Decimal("-12.00"),
                        currency="CAD",
                    ),
                    ProviderTransaction(
                        external_id="t2",
                        date=date.today().replace(day=min(10, date.today().day)),
                        description="PAYROLL DEPOSIT ACME",
                        amount=Decimal("3000.00"),
                        currency="CAD",
                    ),
                ],
            )
        ],
    )


async def _setup(client, payload):
    tokens = await register_and_login(client, payload)
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    household_id = (await client.get("/v1/households/", headers=headers)).json()[0]["id"]
    app.dependency_overrides[get_provider] = lambda: FakeProvider(_snapshot())
    await client.post(
        "/v1/connections/",
        json={"household_id": household_id, "login_id": "login-budget"},
        headers=headers,
    )
    return headers, household_id


async def test_budget_propose_and_status(client, register_payload):
    headers, household_id = await _setup(client, register_payload)
    resp = await client.post(
        "/v1/budgets/",
        json={
            "household_id": household_id,
            "name": "July",
            "propose_from_history": True,
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    budget_id = resp.json()["id"]

    categories = (await client.get("/v1/categories/", headers=headers)).json()
    dining = next(c for c in categories if c["slug"] == "dining")
    resp = await client.put(
        f"/v1/budgets/{budget_id}/categories",
        json={"category_id": dining["id"], "target": "100.00"},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    assert Decimal(resp.json()["target"]) == Decimal("100.00")
    assert Decimal(resp.json()["actual"]) >= Decimal("0")

    detail = await client.get(f"/v1/budgets/{budget_id}", headers=headers)
    assert detail.status_code == 200
    assert any(c["category_id"] == dining["id"] for c in detail.json()["categories"])


async def test_metrics_net_worth_and_spending(client, register_payload):
    headers, household_id = await _setup(client, register_payload)
    nw = await client.get(f"/v1/metrics/net-worth?household_id={household_id}", headers=headers)
    assert nw.status_code == 200
    assert Decimal(nw.json()["total"]) == Decimal("2500")

    cats = await client.get(
        f"/v1/metrics/spending-by-category?household_id={household_id}", headers=headers
    )
    assert cats.status_code == 200
    assert any(c["name"] == "Dining & Takeout" for c in cats.json())

    sankey = await client.get(f"/v1/metrics/sankey?household_id={household_id}", headers=headers)
    assert sankey.status_code == 200
    assert "nodes" in sankey.json()


async def test_goal_plan_and_scenario(client, register_payload):
    headers, household_id = await _setup(client, register_payload)
    resp = await client.post(
        "/v1/goals/",
        json={
            "household_id": household_id,
            "name": "Emergency fund",
            "type": "emergency_fund",
            "target_amount": "6000",
            "current_amount": "500",
            "target_date": "2026-12-31",
        },
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    goal_id = resp.json()["id"]

    plan = await client.post(f"/v1/goals/{goal_id}/plan", headers=headers)
    assert plan.status_code == 200, plan.text
    assert "items" in plan.json()
    assert Decimal(plan.json()["monthly_surplus_needed"]) > 0

    scenario = await client.post(
        f"/v1/goals/{goal_id}/scenario",
        json={"income_delta": "200", "expense_delta": "50"},
        headers=headers,
    )
    assert scenario.status_code == 200
    assert "scenario_surplus" in scenario.json()


async def test_assistant_offline_chat(client, register_payload):
    headers, household_id = await _setup(client, register_payload)
    convo = await client.post(
        "/v1/assistant/conversations",
        json={"household_id": household_id},
        headers=headers,
    )
    assert convo.status_code == 201
    cid = convo.json()["id"]
    msg = await client.post(
        f"/v1/assistant/conversations/{cid}/messages",
        json={"message": "How am I doing this month?"},
        headers=headers,
    )
    assert msg.status_code == 200, msg.text
    assert msg.json()["role"] == "assistant"
    content = msg.json()["content"]
    assert "net worth" in content.lower() or "spending" in content.lower()
    assert "{" not in content  # no raw JSON dump


async def test_assistant_llm_failure_falls_back(client, register_payload, monkeypatch):
    """Broken LLM key/provider must still return 200 via offline reply."""
    from app.assistant import service as assistant_service

    class BoomLlm:
        async def complete(self, messages, tools=None, temperature=0.2):
            raise RuntimeError("anthropic 401 invalid x-api-key")

    monkeypatch.setattr(assistant_service, "get_llm_client", lambda: BoomLlm())

    headers, household_id = await _setup(client, register_payload)
    convo = await client.post(
        "/v1/assistant/conversations",
        json={"household_id": household_id},
        headers=headers,
    )
    assert convo.status_code == 201
    cid = convo.json()["id"]
    msg = await client.post(
        f"/v1/assistant/conversations/{cid}/messages",
        json={"message": "How much did I spend on dining lately?"},
        headers=headers,
    )
    assert msg.status_code == 200, msg.text
    assert msg.json()["role"] == "assistant"
    assert len(msg.json()["content"]) > 0
