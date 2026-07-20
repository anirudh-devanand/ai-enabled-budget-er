import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connections.models import Account, BankConnection, Transaction
from app.connections.provider import BankProvider, ProviderSnapshot
from app.core.security import decrypt_secret, encrypt_secret
from app.enrichment.service import enrich_transactions
from app.households.models import HouseholdMember


async def user_in_household(
    db: AsyncSession, user_id: uuid.UUID, household_id: uuid.UUID
) -> bool:
    result = await db.execute(
        select(HouseholdMember.id).where(
            HouseholdMember.household_id == household_id,
            HouseholdMember.user_id == user_id,
        )
    )
    return result.scalar_one_or_none() is not None


async def create_connection(
    db: AsyncSession, household_id: uuid.UUID, login_id: str
) -> BankConnection:
    connection = BankConnection(
        household_id=household_id,
        login_id_encrypted=encrypt_secret(login_id),
    )
    db.add(connection)
    await db.commit()
    await db.refresh(connection)
    return connection


async def sync_connection(
    db: AsyncSession, connection: BankConnection, provider: BankProvider
) -> BankConnection:
    try:
        snapshot = await provider.fetch_snapshot(decrypt_secret(connection.login_id_encrypted))
    except Exception:
        connection.status = "error"
        await db.commit()
        raise
    new_transactions = await _apply_snapshot(db, connection, snapshot)
    await enrich_transactions(db, connection.household_id, new_transactions)
    connection.institution_name = snapshot.institution_name
    connection.status = "active"
    connection.last_synced_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(connection)
    return connection


async def _apply_snapshot(
    db: AsyncSession, connection: BankConnection, snapshot: ProviderSnapshot
) -> list[Transaction]:
    new_transactions: list[Transaction] = []
    existing_accounts = {
        a.external_id: a
        for a in (
            await db.execute(select(Account).where(Account.connection_id == connection.id))
        ).scalars()
    }
    for provider_account in snapshot.accounts:
        account = existing_accounts.get(provider_account.external_id)
        if account is None:
            account = Account(
                connection_id=connection.id,
                external_id=provider_account.external_id,
                name=provider_account.name,
                type=provider_account.type,
                currency=provider_account.currency,
                balance=provider_account.balance,
                masked_number=provider_account.masked_number,
            )
            db.add(account)
            await db.flush()
        else:
            account.name = provider_account.name
            account.balance = provider_account.balance

        existing_ids = {
            row
            for row in (
                await db.execute(
                    select(Transaction.external_id).where(Transaction.account_id == account.id)
                )
            ).scalars()
        }
        for txn in provider_account.transactions:
            if txn.external_id in existing_ids:
                continue
            row = Transaction(
                account_id=account.id,
                external_id=txn.external_id,
                date=txn.date,
                raw_description=txn.description,
                amount=txn.amount,
                currency=txn.currency,
                balance_after=txn.balance,
            )
            db.add(row)
            new_transactions.append(row)
    await db.flush()
    return new_transactions


async def get_connection_for_user(
    db: AsyncSession, connection_id: uuid.UUID, user_id: uuid.UUID
) -> BankConnection | None:
    connection = await db.get(BankConnection, connection_id)
    if connection is None:
        return None
    if not await user_in_household(db, user_id, connection.household_id):
        return None
    return connection


async def get_transaction_for_user(
    db: AsyncSession, transaction_id: uuid.UUID, user_id: uuid.UUID
) -> tuple[Transaction, uuid.UUID] | None:
    """Returns (transaction, household_id) if the user can access it."""
    result = await db.execute(
        select(Transaction, BankConnection.household_id)
        .join(Account, Account.id == Transaction.account_id)
        .join(BankConnection, BankConnection.id == Account.connection_id)
        .where(Transaction.id == transaction_id)
    )
    row = result.first()
    if row is None:
        return None
    transaction, household_id = row
    if not await user_in_household(db, user_id, household_id):
        return None
    return transaction, household_id


async def list_connections(db: AsyncSession, household_id: uuid.UUID) -> list[BankConnection]:
    result = await db.execute(
        select(BankConnection)
        .where(BankConnection.household_id == household_id)
        .order_by(BankConnection.created_at)
    )
    return list(result.scalars().all())


async def list_accounts(db: AsyncSession, household_id: uuid.UUID) -> list[Account]:
    result = await db.execute(
        select(Account)
        .join(BankConnection, BankConnection.id == Account.connection_id)
        .where(BankConnection.household_id == household_id)
        .order_by(Account.created_at)
    )
    return list(result.scalars().all())


async def list_transactions(
    db: AsyncSession,
    household_id: uuid.UUID,
    limit: int,
    offset: int,
    needs_review: bool | None = None,
) -> tuple[list[Transaction], int]:
    from app.enrichment.models import TransactionEnrichment

    base = (
        select(Transaction)
        .join(Account, Account.id == Transaction.account_id)
        .join(BankConnection, BankConnection.id == Account.connection_id)
        .where(BankConnection.household_id == household_id)
    )
    if needs_review is not None:
        base = base.join(
            TransactionEnrichment, TransactionEnrichment.transaction_id == Transaction.id
        ).where(TransactionEnrichment.needs_review.is_(needs_review))
    total = (
        await db.execute(select(func.count()).select_from(base.subquery()))
    ).scalar_one()
    result = await db.execute(
        base.order_by(Transaction.date.desc(), Transaction.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all()), total
