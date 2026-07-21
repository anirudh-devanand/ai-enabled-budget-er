"""Seed extensive demo bank history for a user (ops / local script)."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connections import service as connections_service
from app.connections.demo_seed import DemoSeedProvider
from app.connections.models import BankConnection
from app.households.models import HouseholdMember
from app.users.models import User


class SeedDemoRequest(BaseModel):
    email: EmailStr
    days: int = 180
    replace_existing_demo: bool = True


class SeedDemoResponse(BaseModel):
    user_id: uuid.UUID
    household_id: uuid.UUID
    connection_id: uuid.UUID
    institution_name: str | None
    accounts: int
    transactions: int


async def seed_demo_history(db: AsyncSession, body: SeedDemoRequest) -> SeedDemoResponse:
    result = await db.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()
    if user is None:
        raise LookupError(f"No user with email {body.email}")

    member = (
        await db.execute(
            select(HouseholdMember)
            .where(HouseholdMember.user_id == user.id)
            .order_by(HouseholdMember.created_at.asc())
        )
    ).scalars().first()
    if member is None:
        raise LookupError("User has no household")

    household_id = member.household_id
    login_id = f"demo-seed:scotia:{body.days}"

    if body.replace_existing_demo:
        existing = (
            await db.execute(
                select(BankConnection).where(
                    BankConnection.household_id == household_id,
                    BankConnection.institution_name.ilike("%Demo%"),
                )
            )
        ).scalars().all()
        for conn in existing:
            await db.delete(conn)
        await db.commit()

    provider = DemoSeedProvider()
    connection = await connections_service.create_connection(db, household_id, login_id)
    connection = await connections_service.sync_connection(db, connection, provider)

    from app.connections.models import Account, Transaction

    accounts = (
        await db.execute(select(Account).where(Account.connection_id == connection.id))
    ).scalars().all()
    txn_count = 0
    for account in accounts:
        txn_count += len(
            (
                await db.execute(select(Transaction.id).where(Transaction.account_id == account.id))
            ).scalars().all()
        )

    return SeedDemoResponse(
        user_id=user.id,
        household_id=household_id,
        connection_id=connection.id,
        institution_name=connection.institution_name,
        accounts=len(accounts),
        transactions=txn_count,
    )
