import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.security_events import record_security_event
from app.connections import service
from app.connections.csv_import import parse_bank_csv
from app.connections.demo_seed import DemoSeedProvider
from app.connections.flinks import FlinksProvider
from app.connections.models import BankConnection
from app.connections.plaid import PlaidProvider
from app.connections.provider import BankProvider, ProviderError, ProviderSnapshot
from app.connections.schemas import (
    AccountDetailResponse,
    AccountResponse,
    AccountUpdateRequest,
    ConnectionCreateRequest,
    ConnectionResponse,
    CsvImportResponse,
    PlaidExchangeRequest,
    PlaidLinkTokenRequest,
    PlaidLinkTokenResponse,
    SyncMineResponse,
    TransactionListResponse,
    TransactionResponse,
)
from app.core.database import get_db
from app.core.deps import get_current_user
from app.enrichment.normalize import prettify_descriptor
from app.enrichment.service import enrichment_maps, enrich_transactions
from app.users.models import User

router = APIRouter(prefix="/v1/connections", tags=["connections"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


class CompositeBankProvider:
    def __init__(self) -> None:
        self._flinks = FlinksProvider()
        self._demo = DemoSeedProvider()
        self._plaid = PlaidProvider()

    async def fetch_snapshot(self, login_id: str) -> ProviderSnapshot:
        if login_id.startswith("demo-seed:"):
            return await self._demo.fetch_snapshot(login_id)
        if login_id.startswith("access-") or login_id.startswith("plaid:"):
            token = login_id.removeprefix("plaid:")
            return await self._plaid.fetch_snapshot(token)
        if login_id.startswith("csv:"):
            raise ProviderError("CSV imports cannot be re-synced from the aggregator")
        return await self._flinks.fetch_snapshot(login_id)


def get_provider() -> BankProvider:
    return CompositeBankProvider()


ProviderDep = Annotated[BankProvider, Depends(get_provider)]


async def _require_membership(db: AsyncSession, user: User, household_id: uuid.UUID) -> None:
    if not await service.user_in_household(db, user.id, household_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Household not found")



async def _require_mfa_enabled(
    user: User, db: AsyncSession, request: Request | None = None
) -> None:
    """Bank connect/sync/import require MFA (stable detail for clients)."""
    if not user.mfa_enabled:
        await record_security_event(
            db,
            event_type="mfa_gate_denied",
            user_id=user.id,
            request=request,
            commit=True,
        )
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="mfa_required",
        )


async def _require_owner(db: AsyncSession, user: User, household_id: uuid.UUID) -> None:
    if not await service.user_is_household_owner(db, user.id, household_id):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Only household owners can link or sync banks",
        )


def _tx_responses(items, enrichments, merchants, categories) -> list[TransactionResponse]:
    responses: list[TransactionResponse] = []
    for t in items:
        enrichment = enrichments.get(t.id)
        merchant = merchants.get(enrichment.merchant_id) if enrichment else None
        category = categories.get(enrichment.category_id) if enrichment else None
        plain = service.transaction_plaintext_description(t)
        responses.append(
            TransactionResponse(
                id=t.id,
                account_id=t.account_id,
                date=t.date,
                raw_description=plain,
                amount=t.amount,
                currency=t.currency,
                display_name=merchant.name if merchant else prettify_descriptor(plain),
                merchant_name=merchant.name if merchant else None,
                category_id=category.id if category else None,
                category_name=category.name if category else None,
                needs_review=enrichment.needs_review if enrichment else True,
            )
        )
    return responses


@router.post("/plaid/link-token", response_model=PlaidLinkTokenResponse)
async def create_plaid_link_token(
    body: PlaidLinkTokenRequest, user: CurrentUser, db: DbDep, request: Request
):
    await _require_mfa_enabled(user, db, request)
    await _require_membership(db, user, body.household_id)
    await _require_owner(db, user, body.household_id)
    access_token: str | None = None
    update_mode = False
    if body.connection_id is not None:
        connection = await service.get_connection_for_user(db, body.connection_id, user.id)
        if connection is None or connection.household_id != body.household_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Connection not found")
        if connection.provider != "plaid":
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Only Plaid connections can be reconnected with Link update mode",
            )
        from app.core.security import decrypt_secret

        access_token = decrypt_secret(connection.login_id_encrypted)
        update_mode = True
    try:
        token = await PlaidProvider().create_link_token(
            client_user_id=str(user.id),
            access_token=access_token,
        )
    except ProviderError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    await record_security_event(
        db,
        event_type="plaid_link_token",
        user_id=user.id,
        request=request,
        meta={
            "household_id": str(body.household_id),
            "update_mode": update_mode,
            "connection_id": str(body.connection_id) if body.connection_id else None,
        },
        commit=True,
    )
    return PlaidLinkTokenResponse(link_token=token, update_mode=update_mode)


@router.post("/plaid/{connection_id}/reauth-complete", response_model=ConnectionResponse)
async def complete_plaid_reauth(
    connection_id: uuid.UUID,
    user: CurrentUser,
    db: DbDep,
    provider: ProviderDep,
    request: Request,
):
    """After Plaid Link update mode succeeds, pull a fresh snapshot."""
    await _require_mfa_enabled(user, db, request)
    connection = await service.get_connection_for_user(db, connection_id, user.id)
    if connection is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Connection not found")
    await _require_owner(db, user, connection.household_id)
    if connection.provider != "plaid":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Not a Plaid connection")
    try:
        connection = await service.sync_connection(db, connection, provider)
    except ProviderError as exc:
        code = getattr(exc, "code", None)
        if code == "ITEM_LOGIN_REQUIRED":
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Bank login is still required. Finish Plaid Link update mode and try again.",
            ) from exc
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Bank sync failed: {exc}") from exc
    await record_security_event(
        db,
        event_type="plaid_reauth_complete",
        user_id=user.id,
        request=request,
        meta={"connection_id": str(connection_id)},
        commit=True,
    )
    return connection


@router.post("/plaid", response_model=ConnectionResponse, status_code=status.HTTP_201_CREATED)
async def create_plaid_connection(
    body: PlaidExchangeRequest,
    user: CurrentUser,
    db: DbDep,
    provider: ProviderDep,
    request: Request,
):
    await _require_mfa_enabled(user, db, request)
    await _require_membership(db, user, body.household_id)
    await _require_owner(db, user, body.household_id)
    plaid = PlaidProvider()
    try:
        access_token = await plaid.exchange_public_token(body.public_token)
    except ProviderError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Plaid exchange failed: {exc}") from exc
    connection = await service.create_connection(
        db, body.household_id, access_token, provider="plaid"
    )
    try:
        connection = await service.sync_connection(db, connection, provider)
    except ProviderError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Bank sync failed: {exc}") from exc
    await record_security_event(
        db,
        event_type="plaid_connection_created",
        user_id=user.id,
        request=request,
        meta={"connection_id": str(connection.id), "provider": "plaid"},
        commit=True,
    )
    return connection


@router.post("/import", response_model=CsvImportResponse, status_code=status.HTTP_201_CREATED)
async def import_csv_statement(
    user: CurrentUser,
    db: DbDep,
    request: Request,
    household_id: Annotated[uuid.UUID, Form()],
    account_name: Annotated[str, Form()],
    file: UploadFile = File(...),
    account_type: Annotated[str, Form()] = "chequing",
    currency: Annotated[str, Form()] = "CAD",
    institution_name: Annotated[str | None, Form()] = None,
):
    await _require_mfa_enabled(user, db, request)
    await _require_membership(db, user, household_id)
    await _require_owner(db, user, household_id)
    raw = await file.read()
    if not raw:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty file")
    if len(raw) > 5_000_000:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File too large (max 5 MB)")
    try:
        snapshot = parse_bank_csv(
            raw,
            account_name=account_name.strip() or "Imported account",
            account_type=account_type.strip() or "chequing",
            currency=currency.strip() or "CAD",
            institution_name=(institution_name or "").strip() or file.filename or "CSV import",
        )
    except ProviderError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    login_id = f"csv:{uuid.uuid4()}"
    connection = await service.create_connection(
        db,
        household_id,
        login_id,
        provider="csv",
        institution_name=snapshot.institution_name,
    )
    new_transactions = await service._apply_snapshot(db, connection, snapshot)
    await enrich_transactions(db, connection.household_id, new_transactions)
    connection.institution_name = snapshot.institution_name
    connection.status = "active"
    connection.last_synced_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(connection)
    await record_security_event(
        db,
        event_type="csv_import",
        user_id=user.id,
        request=request,
        meta={"connection_id": str(connection.id), "imported": len(new_transactions)},
        commit=True,
    )
    return CsvImportResponse(
        connection=ConnectionResponse.model_validate(connection),
        imported_transactions=len(new_transactions),
    )


@router.post("/", response_model=ConnectionResponse, status_code=status.HTTP_201_CREATED)
async def create_connection(
    body: ConnectionCreateRequest,
    user: CurrentUser,
    db: DbDep,
    provider: ProviderDep,
    request: Request,
):
    await _require_mfa_enabled(user, db, request)
    await _require_membership(db, user, body.household_id)
    await _require_owner(db, user, body.household_id)
    is_demo = body.login_id.startswith("demo-seed:")
    provider_name = "demo" if is_demo else "flinks"
    connection = await service.create_connection(
        db, body.household_id, body.login_id, provider=provider_name
    )
    try:
        connection = await service.sync_connection(db, connection, provider)
    except ProviderError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Bank sync failed: {exc}") from exc
    if not is_demo:
        await record_security_event(
            db,
            event_type="flinks_connection_created",
            user_id=user.id,
            request=request,
            meta={"connection_id": str(connection.id), "provider": "flinks"},
            commit=True,
        )
    else:
        await record_security_event(
            db,
            event_type="demo_connection_created",
            user_id=user.id,
            request=request,
            meta={"connection_id": str(connection.id)},
            commit=True,
        )
    return connection


@router.post("/sync-mine", response_model=SyncMineResponse)
async def sync_mine(user: CurrentUser, db: DbDep, provider: ProviderDep, request: Request):
    """Sync all non-CSV bank connections for the current user's households."""
    await _require_mfa_enabled(user, db, request)
    result = await service.sync_user_connections(db, user.id, provider)
    await record_security_event(
        db,
        event_type="sync_mine",
        user_id=user.id,
        request=request,
        meta={
            "synced": result["synced"],
            "failed": result["failed"],
            "skipped": result["skipped"],
        },
        commit=True,
    )
    return result


@router.post("/{connection_id}/sync", response_model=ConnectionResponse)
async def resync_connection(
    connection_id: uuid.UUID,
    user: CurrentUser,
    db: DbDep,
    provider: ProviderDep,
    request: Request,
):
    await _require_mfa_enabled(user, db, request)
    connection = await service.get_connection_for_user(db, connection_id, user.id)
    if connection is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Connection not found")
    await _require_owner(db, user, connection.household_id)
    if connection.provider == "csv":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "CSV imports cannot be re-synced — upload a new statement instead",
        )
    try:
        return await service.sync_connection(db, connection, provider)
    except ProviderError as exc:
        await record_security_event(
            db,
            event_type="sync_failed",
            user_id=user.id,
            request=request,
            meta={"connection_id": str(connection_id)},
            commit=True,
        )
        if getattr(exc, "code", None) == "ITEM_LOGIN_REQUIRED":
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "ITEM_LOGIN_REQUIRED: Your bank needs you to sign in again. "
                f"Open /connect?household={connection.household_id}&reconnect={connection.id}",
            ) from exc
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Bank sync failed: {exc}") from exc


@router.patch("/accounts/{account_id}", response_model=AccountResponse)
async def patch_account(
    account_id: uuid.UUID, body: AccountUpdateRequest, user: CurrentUser, db: DbDep
):
    account = await service.get_account_for_user(db, account_id, user.id)
    if account is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    bank = await db.get(BankConnection, account.connection_id)
    if bank is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found")
    await _require_owner(db, user, bank.household_id)
    account = await service.update_account(
        db,
        account,
        nickname=body.nickname,
        notes=body.notes,
        hidden=body.hidden,
    )
    return AccountResponse(
        **service.account_to_response(account, bank.institution_name if bank else None)
    )


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
