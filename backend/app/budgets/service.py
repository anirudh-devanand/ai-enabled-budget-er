import calendar
import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.budgets.models import Budget, BudgetCategory, BudgetPeriod
from app.connections.models import Account, BankConnection, Transaction
from app.connections.service import user_in_household
from app.enrichment.models import TransactionEnrichment
from app.enrichment.service import ensure_default_categories


def month_bounds(ref: date | None = None) -> tuple[date, date]:
    ref = ref or date.today()
    start = ref.replace(day=1)
    last = calendar.monthrange(ref.year, ref.month)[1]
    end = ref.replace(day=last)
    return start, end


async def create_budget(
    db: AsyncSession, household_id: uuid.UUID, name: str, mode: str
) -> Budget:
    budget = Budget(household_id=household_id, name=name, mode=mode)
    db.add(budget)
    await db.flush()
    start, end = month_bounds()
    period = BudgetPeriod(budget_id=budget.id, start_date=start, end_date=end)
    db.add(period)
    await db.commit()
    await db.refresh(budget)
    return budget


async def propose_budget_from_history(
    db: AsyncSession, household_id: uuid.UUID, name: str = "Suggested budget"
) -> Budget:
    """Create a flexible budget with category targets from last 90 days of spend."""
    await ensure_default_categories(db)
    start_hist = date.today().replace(day=1)
    # Look back ~3 months by using a wide window on transaction dates.
    result = await db.execute(
        select(
            TransactionEnrichment.category_id,
            func.sum(Transaction.amount),
        )
        .join(Transaction, Transaction.id == TransactionEnrichment.transaction_id)
        .join(Account, Account.id == Transaction.account_id)
        .join(BankConnection, BankConnection.id == Account.connection_id)
        .where(
            BankConnection.household_id == household_id,
            TransactionEnrichment.category_id.is_not(None),
            Transaction.amount < 0,
            Transaction.date >= start_hist.replace(month=max(1, start_hist.month - 2))
            if start_hist.month > 2
            else start_hist.replace(year=start_hist.year - 1, month=start_hist.month + 10),
        )
        .group_by(TransactionEnrichment.category_id)
    )
    spends = {cat_id: abs(total or Decimal("0")) for cat_id, total in result.all()}

    budget = Budget(household_id=household_id, name=name, mode="flexible")
    db.add(budget)
    await db.flush()
    start, end = month_bounds()
    period = BudgetPeriod(budget_id=budget.id, start_date=start, end_date=end)
    db.add(period)
    await db.flush()

    # Average monthly = total / 3 as a rough proposal.
    for category_id, total in spends.items():
        monthly = (total / Decimal("3")).quantize(Decimal("0.01"))
        if monthly <= 0:
            continue
        db.add(
            BudgetCategory(
                period_id=period.id,
                category_id=category_id,
                target=monthly,
                rollover=True,
            )
        )
    await db.commit()
    await db.refresh(budget)
    return budget


async def set_category_target(
    db: AsyncSession,
    budget_id: uuid.UUID,
    category_id: uuid.UUID,
    target: Decimal,
    rollover: bool = True,
) -> BudgetCategory:
    period = await _current_period(db, budget_id)
    if period is None:
        start, end = month_bounds()
        period = BudgetPeriod(budget_id=budget_id, start_date=start, end_date=end)
        db.add(period)
        await db.flush()
    existing = (
        await db.execute(
            select(BudgetCategory).where(
                BudgetCategory.period_id == period.id,
                BudgetCategory.category_id == category_id,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        existing = BudgetCategory(
            period_id=period.id, category_id=category_id, target=target, rollover=rollover
        )
        db.add(existing)
    else:
        existing.target = target
        existing.rollover = rollover
    await db.commit()
    await db.refresh(existing)
    return existing


async def _current_period(db: AsyncSession, budget_id: uuid.UUID) -> BudgetPeriod | None:
    today = date.today()
    result = await db.execute(
        select(BudgetPeriod).where(
            BudgetPeriod.budget_id == budget_id,
            BudgetPeriod.start_date <= today,
            BudgetPeriod.end_date >= today,
        )
    )
    return result.scalar_one_or_none()


async def list_budgets(db: AsyncSession, household_id: uuid.UUID) -> list[Budget]:
    result = await db.execute(
        select(Budget).where(Budget.household_id == household_id).order_by(Budget.created_at)
    )
    return list(result.scalars().all())


async def get_budget_for_user(
    db: AsyncSession, budget_id: uuid.UUID, user_id: uuid.UUID
) -> Budget | None:
    budget = await db.get(Budget, budget_id)
    if budget is None:
        return None
    if not await user_in_household(db, user_id, budget.household_id):
        return None
    return budget


async def budget_status(db: AsyncSession, budget: Budget) -> list[dict]:
    """Per-category target vs actual for the current period."""
    period = await _current_period(db, budget.id)
    if period is None:
        return []
    cats = (
        await db.execute(
            select(BudgetCategory).where(BudgetCategory.period_id == period.id)
        )
    ).scalars().all()
    rows = []
    for bc in cats:
        spent = (
            await db.execute(
                select(func.coalesce(func.sum(Transaction.amount), 0))
                .join(TransactionEnrichment, TransactionEnrichment.transaction_id == Transaction.id)
                .join(Account, Account.id == Transaction.account_id)
                .join(BankConnection, BankConnection.id == Account.connection_id)
                .where(
                    BankConnection.household_id == budget.household_id,
                    TransactionEnrichment.category_id == bc.category_id,
                    Transaction.date >= period.start_date,
                    Transaction.date <= period.end_date,
                    Transaction.amount < 0,
                )
            )
        ).scalar_one()
        actual = abs(Decimal(spent))
        rows.append(
            {
                "category_id": bc.category_id,
                "target": bc.target,
                "actual": actual,
                "remaining": bc.target - actual,
                "rollover": bc.rollover,
            }
        )
    return rows
