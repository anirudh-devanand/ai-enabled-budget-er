"""Backend tools the assistant may call. Auth scope is enforced by the caller."""

from __future__ import annotations

import json
import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.budgets import service as budget_service
from app.metrics import service as metrics_service
from app.planner import service as planner_service
from app.planner.engine import simulate_scenario


TOOL_SPECS: list[dict[str, Any]] = [
    {
        "name": "get_net_worth",
        "description": "Get household net worth and account balances",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "get_spending_summary",
        "description": "Spending totals by category for recent days",
        "parameters": {
            "type": "object",
            "properties": {"days": {"type": "integer", "default": 30}},
        },
    },
    {
        "name": "get_budget_status",
        "description": "Current budget category targets vs actuals",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "get_goal_progress",
        "description": "List goals and latest plan summaries",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "simulate_scenario",
        "description": "See impact of income/expense changes on monthly surplus",
        "parameters": {
            "type": "object",
            "properties": {
                "income_delta": {"type": "number"},
                "expense_delta": {"type": "number"},
            },
        },
    },
]


def _json(data: Any) -> str:
    def default(o: Any) -> Any:
        if isinstance(o, Decimal):
            return str(o)
        if isinstance(o, uuid.UUID):
            return str(o)
        if hasattr(o, "isoformat"):
            return o.isoformat()
        raise TypeError(type(o))

    return json.dumps(data, default=default)


async def run_tool(
    db: AsyncSession, household_id: uuid.UUID, name: str, arguments: dict[str, Any]
) -> str:
    if name == "get_net_worth":
        return _json(await metrics_service.net_worth(db, household_id))
    if name == "get_spending_summary":
        days = int(arguments.get("days") or 30)
        return _json(await metrics_service.spending_by_category(db, household_id, days))
    if name == "get_budget_status":
        budgets = await budget_service.list_budgets(db, household_id)
        if not budgets:
            return _json({"budgets": []})
        status = await budget_service.budget_status(db, budgets[0])
        return _json({"budget_id": budgets[0].id, "categories": status})
    if name == "get_goal_progress":
        goals = await planner_service.list_goals(db, household_id)
        out = []
        for g in goals:
            plan = await planner_service.latest_plan(db, g.id)
            out.append(
                {
                    "id": g.id,
                    "name": g.name,
                    "target": g.target_amount,
                    "current": g.current_amount,
                    "plan_summary": plan.summary if plan else None,
                }
            )
        return _json(out)
    if name == "simulate_scenario":
        surplus = await planner_service.monthly_surplus(db, household_id)
        new = simulate_scenario(
            surplus,
            Decimal(str(arguments.get("income_delta") or 0)),
            Decimal(str(arguments.get("expense_delta") or 0)),
        )
        return _json({"current_surplus": surplus, "scenario_surplus": new})
    return _json({"error": f"Unknown tool {name}"})
