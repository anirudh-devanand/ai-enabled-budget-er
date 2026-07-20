import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connections.models import Account, BankConnection, Transaction
from app.enrichment.models import Category, Merchant, TransactionEnrichment


async def net_worth(db: AsyncSession, household_id: uuid.UUID) -> dict:
    result = await db.execute(
        select(func.coalesce(func.sum(Account.balance), 0))
        .join(BankConnection, BankConnection.id == Account.connection_id)
        .where(BankConnection.household_id == household_id)
    )
    total = Decimal(result.scalar_one())
    accounts = (
        await db.execute(
            select(Account)
            .join(BankConnection, BankConnection.id == Account.connection_id)
            .where(BankConnection.household_id == household_id)
        )
    ).scalars().all()
    return {
        "total": total,
        "currency": accounts[0].currency if accounts else "CAD",
        "accounts": [
            {"id": a.id, "name": a.name, "balance": a.balance, "type": a.type} for a in accounts
        ],
    }


async def cash_flow(
    db: AsyncSession, household_id: uuid.UUID, days: int = 90
) -> list[dict]:
    start = date.today() - timedelta(days=days)
    result = await db.execute(
        select(
            Transaction.date,
            func.sum(Transaction.amount).filter(Transaction.amount > 0),
            func.sum(Transaction.amount).filter(Transaction.amount < 0),
        )
        .join(Account, Account.id == Transaction.account_id)
        .join(BankConnection, BankConnection.id == Account.connection_id)
        .where(BankConnection.household_id == household_id, Transaction.date >= start)
        .group_by(Transaction.date)
        .order_by(Transaction.date)
    )
    rows = []
    for day, income, spend in result.all():
        income = Decimal(income or 0)
        spend = Decimal(spend or 0)
        rows.append(
            {
                "date": day,
                "income": income,
                "spending": abs(spend),
                "net": income + spend,
            }
        )
    return rows


async def spending_by_category(
    db: AsyncSession, household_id: uuid.UUID, days: int = 30
) -> list[dict]:
    start = date.today() - timedelta(days=days)
    result = await db.execute(
        select(Category.id, Category.name, func.sum(Transaction.amount))
        .join(TransactionEnrichment, TransactionEnrichment.category_id == Category.id)
        .join(Transaction, Transaction.id == TransactionEnrichment.transaction_id)
        .join(Account, Account.id == Transaction.account_id)
        .join(BankConnection, BankConnection.id == Account.connection_id)
        .where(
            BankConnection.household_id == household_id,
            Transaction.date >= start,
            Transaction.amount < 0,
        )
        .group_by(Category.id, Category.name)
        .order_by(func.sum(Transaction.amount))
    )
    return [
        {"category_id": cid, "name": name, "amount": abs(Decimal(total or 0))}
        for cid, name, total in result.all()
    ]


async def spending_by_merchant(
    db: AsyncSession, household_id: uuid.UUID, days: int = 30, limit: int = 20
) -> list[dict]:
    start = date.today() - timedelta(days=days)
    result = await db.execute(
        select(Merchant.id, Merchant.name, func.sum(Transaction.amount))
        .join(TransactionEnrichment, TransactionEnrichment.merchant_id == Merchant.id)
        .join(Transaction, Transaction.id == TransactionEnrichment.transaction_id)
        .join(Account, Account.id == Transaction.account_id)
        .join(BankConnection, BankConnection.id == Account.connection_id)
        .where(
            BankConnection.household_id == household_id,
            Transaction.date >= start,
            Transaction.amount < 0,
        )
        .group_by(Merchant.id, Merchant.name)
        .order_by(func.sum(Transaction.amount))
        .limit(limit)
    )
    return [
        {"merchant_id": mid, "name": name, "amount": abs(Decimal(total or 0))}
        for mid, name, total in result.all()
    ]


async def sankey_flow(
    db: AsyncSession, household_id: uuid.UUID, days: int = 30
) -> dict:
    """Income sources -> categories -> top merchants as nodes/links."""
    start = date.today() - timedelta(days=days)
    income_total = (
        await db.execute(
            select(func.coalesce(func.sum(Transaction.amount), 0))
            .join(Account, Account.id == Transaction.account_id)
            .join(BankConnection, BankConnection.id == Account.connection_id)
            .where(
                BankConnection.household_id == household_id,
                Transaction.date >= start,
                Transaction.amount > 0,
            )
        )
    ).scalar_one()
    income_total = Decimal(income_total)

    cats = await spending_by_category(db, household_id, days)
    merchants = await spending_by_merchant(db, household_id, days, limit=10)

    nodes = [{"id": "income", "label": "Income"}]
    links = []
    for c in cats:
        node_id = f"cat:{c['category_id']}"
        nodes.append({"id": node_id, "label": c["name"]})
        links.append({"source": "income", "target": node_id, "value": float(c["amount"])})

    for m in merchants:
        node_id = f"merch:{m['merchant_id']}"
        nodes.append({"id": node_id, "label": m["name"]})
        # Link from a generic "spending" bucket is simplified: attach to largest category.
        if cats:
            links.append(
                {
                    "source": f"cat:{cats[0]['category_id']}",
                    "target": node_id,
                    "value": float(m["amount"]),
                }
            )

    return {
        "income_total": income_total,
        "nodes": nodes,
        "links": links,
    }
