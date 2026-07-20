import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connections.models import Account, BankConnection, Transaction
from app.connections.service import user_in_household
from app.enrichment.models import Category, TransactionEnrichment
from app.enrichment.service import ensure_default_categories
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
    return Decimal(result.scalar_one())


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


async def create_goal(
    db: AsyncSession,
    household_id: uuid.UUID,
    name: str,
    goal_type: str,
    target_amount: Decimal,
    target_date: date | None,
    current_amount: Decimal = Decimal("0"),
) -> Goal:
    goal = Goal(
        household_id=household_id,
        name=name,
        type=goal_type,
        target_amount=target_amount,
        current_amount=current_amount,
        target_date=target_date,
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return goal


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
    summary = (
        f"Need ${projection.monthly_needed}/month. "
        + (
            "On track with current surplus."
            if projection.on_track
            else f"Shortfall of ${projection.gap}/month - suggested cuts below."
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
                rationale=f"Set aside ${projection.monthly_needed} each month toward {goal.name}",
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
