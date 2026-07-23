import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.connections import service
from app.connections.demo_seed import DemoSeedProvider
from app.connections.flinks import FlinksProvider
from app.connections.models import BankConnection
from app.connections.provider import BankProvider, ProviderError, ProviderSnapshot
from app.connections.schemas import (
    AccountDetailResponse,
    AccountResponse,
    AccountUpdateRequest,
    ConnectionCreateRequest,
    ConnectionResponse,
    TransactionListResponse,
    TransactionResponse,
)
from app.core.database import get_db
from app.core.deps import get_current_user
from app.enrichment.normalize import prettify_descriptor
from app.enrichment.service import enrichment_maps
from app.users.models import User

router = APIRouter(prefix="/v1/connections", tags=["connections"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


class CompositeBankProvider:
    def __init__(self) -> None:
        self._flinks = FlinksProvider()
        self._demo = DemoSeedProvider()

    async def fetch_snapshot(self, login_id: str) -> ProviderSnapshot:
        if login_id.startswith("demo-seed:"):
            return await self._demo.fetch_snapshot(login_id)
        return await self._flinks.fetch_snapshot(login_id)


def get_provider() -> BankProvider:
    return CompositeBankProvider()


ProviderDep = Annotated[BankProvider, Depends(get_provider)]


async def _require_membership(db: AsyncSession, user: User, household_id: uuid.UUID) -> None:
    if not await service.user_in_household(db, user.id, household_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Household not found")


def _tx_responses(items, enrichments, merchants, categories) -> list[TransactionResponse]:
    responses: list[TransactionResponse] = []
    for t in items:
        enrichment = enrichments.get(t.id)
        merchant = merchants.get(enrichment.merchant_id) if enrichment else None
        category = categories.get(enrichment.category_id) if enrichment else None
        responses.append(
            TransactionResponse(
                id=t.id,
                account_id=t.account_id,
                date=t.date,
                raw_description=t.raw_description,
                amount=t.amount,
                currency=t.currency,
                display_name=merchant.name if merchant else prettify_descriptor(t.raw_description),
                merchant_name=merchant.name if merchant else None,
                category_id=category.id if category else None,
                category_name=category.name if category else None,
                needs_review=enrichment.needs_review if enrichment else True,
            )
        )
    return responses


@router.post("/", response_model=ConnectionResponse, status_code=status.HTTP_201_CREATED)
async def create_connection(
    body: ConnectionCreateRequest, user: CurrentUser, db: DbDep, provider: ProviderDep
):
    await _require_membership(db, user, body.household_id)
    connection = await service.create_connection(db, body.household_id, body.login_id)
    try:
        connection = await service.sync_connection(db, connection, provider)
    except ProviderError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Bank sync failed: {exc}") from exc
    return connection


@router.post("/{connection_id}/sync", response_model=ConnectionResponse)
async def resync_connection(
    connection_id: uuid.UUID, user: CurrentUser, db: DbDep, provider: ProviderDep
):
    connection = await service.get_connection_for_user(db, connection_id, user.id)
    if connection is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Connection not found")
    try:
        return await service.sync_connection(db, connection, provider)
    except ProviderError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Bank sync failed: {exc}") from exc


@router.get("/", response_model=list[ConnectionResponse])
async def list_connections(household_id: uuid.UUID, user: CurrentUser, db: DbDep):
    await _require_membership(db, user, household_id)
    return await service.list_connections(db, household_id)


@router.get("/accounts", response_model=list[AccountResponse])
async def list_accounts(
    household_id: uuid.UUID,
    user: CurrentUser,
    db: DbDep,
    include_hidden: bool = False,
):
    await _require_membership(db, user, household_id)
    accounts = await service.list_accounts(db, household_id)
    connections = {c.id: c for c in await service.list_connections(db, household_id)}
    out: list[AccountResponse] = []
    for a in accounts:
        if a.hidden and not include_hidden:
            continue
        conn = connections.get(a.connection_id)
        out.append(
            AccountResponse(
                **service.account_to_response(a, conn.institution_name if conn else None)
            )
        )
    return out


@router.get("/accounts/{account_id}", response_model=AccountDetailResponse)
async def get_account(account_id: uuid.UUID, user: CurrentUser, db: DbDep):
    account = await service.get_account_for_user(db, account_id, user.id)
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    bank = await db.get(BankConnection, account.connection_id)
    if bank is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    items, _ = await service.list_transactions(
        db, bank.household_id, 30, 0, account_id=account_id
    )
    enrichments, merchants, categories = await enrichment_maps(db, [t.id for t in items])
    base = service.account_to_response(account, bank.institution_name)
    return AccountDetailResponse(
        **base,
        recent_transactions=_tx_responses(items, enrichments, merchants, categories),
    )


@router.patch("/accounts/{account_id}", response_model=AccountResponse)
async def patch_account(
    account_id: uuid.UUID, body: AccountUpdateRequest, user: CurrentUser, db: DbDep
):
    account = await service.get_account_for_user(db, account_id, user.id)
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    account = await service.update_account(
        db,
        account,
        nickname=body.nickname,
        notes=body.notes,
        hidden=body.hidden,
    )
    bank = await db.get(BankConnection, account.connection_id)
    return AccountResponse(
        **service.account_to_response(account, bank.institution_name if bank else None)
    )


@router.get("/transactions", response_model=TransactionListResponse)
async def list_transactions(
    household_id: uuid.UUID,
    user: CurrentUser,
    db: DbDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    needs_review: bool | None = None,
    account_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    q: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    min_amount: Decimal | None = None,
    max_amount: Decimal | None = None,
):
    await _require_membership(db, user, household_id)
    items, total = await service.list_transactions(
        db,
        household_id,
        limit,
        offset,
        needs_review,
        account_id=account_id,
        category_id=category_id,
        q=q,
        date_from=date_from,
        date_to=date_to,
        min_amount=min_amount,
        max_amount=max_amount,
    )
    enrichments, merchants, categories = await enrichment_maps(db, [t.id for t in items])
    return TransactionListResponse(
        items=_tx_responses(items, enrichments, merchants, categories), total=total
    )
