import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connections.models import Account, BankConnection, Transaction
from app.connections.service import user_in_household
from app.enrichment.models import Category, TransactionEnrichment
from app.enrichment.service import ensure_default_categories
from app.core.money import format_money, quantize_money
from app.planner.engine import project_goal, recommend_cuts, simulate_scenario
from app.planner.models import Goal, Plan, PlanItem


async def monthly_surplus(db: AsyncSession, household_id: uuid.UUID) -> Decimal:
    start = date.today().replace(day=1)
    result = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0))
        .join(Account, Account.id == Transaction.account_id)
        .join(BankConnection, BankConnection.id == Account.connection_id)
        .where(BankConnection.household_id == household_id, Transaction.date >= start)
    )
    return quantize_money(Decimal(result.scalar_one()))


async def category_spend_map(
    db: AsyncSession, household_id: uuid.UUID
) -> dict[str, Decimal]:
    await ensure_default_categories(db)
    start = date.today() - timedelta(days=30)
    result = await db.execute(
        select(Category.slug, func.sum(Transaction.amount))
        .join(TransactionEnrichment, TransactionEnrichment.category_id == Category.id)
        .join(Transaction, Transaction.id == TransactionEnrichment.transaction_id)
        .join(Account, Account.id == Transaction.account_id)
        .join(BankConnection, BankConnection.id == Account.connection_id)
        .where(
            BankConnection.household_id == household_id,
            Transaction.date >= start,
            Transaction.amount < 0,
        )
        .group_by(Category.slug)
    )
    return {slug: abs(Decimal(total or 0)) for slug, total in result.all()}


def goal_progress_fields(goal: Goal, monthly_surplus: Decimal | None = None) -> dict:
    """Computed progress fields for API responses."""
    target = quantize_money(goal.target_amount)
    current = quantize_money(goal.current_amount)
    remaining = quantize_money(max(Decimal("0"), target - current))
    progress_pct = float(
        min(Decimal("100"), (current / target * Decimal("100")) if target > 0 else Decimal("0"))
    )
    today = date.today()
    days_left: int | None = None
    if goal.target_date:
        days_left = (goal.target_date - today).days

    surplus = monthly_surplus if monthly_surplus is not None else Decimal("0")
    projection = project_goal(target, current, goal.target_date, surplus, today)
    return {
        "progress_pct": round(progress_pct, 1),
        "remaining": remaining,
        "days_left": days_left,
        "monthly_needed": projection.monthly_needed,
        "on_track": projection.on_track if remaining > 0 else True,
    }


async def create_goal(
    db: AsyncSession,
    household_id: uuid.UUID,
    name: str,
    goal_type: str,
    target_amount: Decimal,
    target_date: date | None,
    current_amount: Decimal = Decimal("0"),
    *,
    start_date: date | None = None,
    notes: str | None = None,
    priority: str = "medium",
    currency: str = "CAD",
) -> Goal:
    goal = Goal(
        household_id=household_id,
        name=name,
        type=goal_type,
        target_amount=quantize_money(target_amount),
        current_amount=quantize_money(current_amount),
        target_date=target_date,
        start_date=start_date or date.today(),
        notes=notes,
        priority=priority,
        currency=currency or "CAD",
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return goal


async def update_goal(
    db: AsyncSession,
    goal: Goal,
    *,
    name: str | None = None,
    goal_type: str | None = None,
    target_amount: Decimal | None = None,
    current_amount: Decimal | None = None,
    target_date: date | None | object = ...,
    start_date: date | None | object = ...,
    notes: str | None | object = ...,
    priority: str | None = None,
    status: str | None = None,
    currency: str | None = None,
) -> Goal:
    if name is not None:
        goal.name = name
    if goal_type is not None:
        goal.type = goal_type
    if target_amount is not None:
        goal.target_amount = quantize_money(target_amount)
    if current_amount is not None:
        goal.current_amount = quantize_money(current_amount)
    if target_date is not ...:
        goal.target_date = target_date  # type: ignore[assignment]
    if start_date is not ...:
        goal.start_date = start_date  # type: ignore[assignment]
    if notes is not ...:
        goal.notes = notes  # type: ignore[assignment]
    if priority is not None:
        goal.priority = priority
    if status is not None:
        goal.status = status
    if currency is not None:
        goal.currency = currency
    if goal.current_amount >= goal.target_amount and goal.status == "active":
        goal.status = "completed"
        goal.current_amount = goal.target_amount
    await db.commit()
    await db.refresh(goal)
    return goal


async def contribute_to_goal(
    db: AsyncSession, goal: Goal, amount: Decimal
) -> Goal:
    amount = quantize_money(amount)
    if amount <= 0:
        raise ValueError("Contribution must be positive")
    new_current = quantize_money(goal.current_amount + amount)
    if new_current >= goal.target_amount:
        goal.current_amount = goal.target_amount
        goal.status = "completed"
    else:
        goal.current_amount = new_current
    await db.commit()
    await db.refresh(goal)
    return goal


async def delete_goal(db: AsyncSession, goal: Goal) -> None:
    await db.delete(goal)
    await db.commit()


async def generate_plan(db: AsyncSession, goal: Goal) -> Plan:
    surplus = await monthly_surplus(db, goal.household_id)
    projection = project_goal(
        goal.target_amount, goal.current_amount, goal.target_date, surplus
    )
    spend = await category_spend_map(db, goal.household_id)
    cuts = recommend_cuts(spend, projection.gap) if projection.gap > 0 else []

    categories = {
        c.slug: c for c in (await db.execute(select(Category))).scalars()
    }
    needed = format_money(projection.monthly_needed)
    summary = (
        f"Need {needed}/month. "
        + (
            "On track with current surplus."
            if projection.on_track
            else f"Shortfall of {format_money(projection.gap)}/month - suggested cuts below."
        )
    )
    plan = Plan(
        goal_id=goal.id,
        summary=summary,
        monthly_surplus_needed=projection.monthly_needed,
        projected_completion=projection.projected_completion,
    )
    db.add(plan)
    await db.flush()
    for slug, amount, rationale in cuts:
        cat = categories.get(slug)
        db.add(
            PlanItem(
                plan_id=plan.id,
                category_id=cat.id if cat else None,
                action="cut",
                amount=amount,
                rationale=rationale,
            )
        )
    if projection.monthly_needed > 0:
        db.add(
            PlanItem(
                plan_id=plan.id,
                action="save",
                amount=projection.monthly_needed,
                rationale=f"Set aside {needed} each month toward {goal.name}",
            )
        )
    await db.commit()
    await db.refresh(plan)
    return plan


async def run_scenario(
    db: AsyncSession,
    household_id: uuid.UUID,
    goal: Goal,
    income_delta: Decimal,
    expense_delta: Decimal,
) -> dict:
    surplus = await monthly_surplus(db, household_id)
    new_surplus = simulate_scenario(surplus, income_delta, expense_delta)
    projection = project_goal(
        goal.target_amount, goal.current_amount, goal.target_date, new_surplus
    )
    return {
        "current_surplus": surplus,
        "scenario_surplus": new_surplus,
        "monthly_needed": projection.monthly_needed,
        "projected_completion": projection.projected_completion,
        "on_track": projection.on_track,
        "gap": projection.gap,
    }


async def list_goals(db: AsyncSession, household_id: uuid.UUID) -> list[Goal]:
    result = await db.execute(
        select(Goal).where(Goal.household_id == household_id).order_by(Goal.created_at)
    )
    return list(result.scalars().all())


async def get_goal_for_user(
    db: AsyncSession, goal_id: uuid.UUID, user_id: uuid.UUID
) -> Goal | None:
    goal = await db.get(Goal, goal_id)
    if goal is None:
        return None
    if not await user_in_household(db, user_id, goal.household_id):
        return None
    return goal


async def list_plan_items(db: AsyncSession, plan_id: uuid.UUID) -> list[PlanItem]:
    result = await db.execute(
        select(PlanItem).where(PlanItem.plan_id == plan_id).order_by(PlanItem.created_at)
    )
    return list(result.scalars().all())


async def latest_plan(db: AsyncSession, goal_id: uuid.UUID) -> Plan | None:
    result = await db.execute(
        select(Plan).where(Plan.goal_id == goal_id).order_by(Plan.created_at.desc())
    )
    return result.scalars().first()
