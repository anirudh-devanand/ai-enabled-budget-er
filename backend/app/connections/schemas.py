import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ConnectionCreateRequest(BaseModel):
    household_id: uuid.UUID
    # Flinks loginId or demo-seed:… token (legacy / QA path).
    login_id: str = Field(min_length=8, max_length=128)


class PlaidLinkTokenRequest(BaseModel):
    household_id: uuid.UUID
    # When set, creates an update-mode Link token for that connection (ITEM_LOGIN_REQUIRED).
    connection_id: uuid.UUID | None = None


class PlaidLinkTokenResponse(BaseModel):
    link_token: str
    update_mode: bool = False


class PlaidExchangeRequest(BaseModel):
    household_id: uuid.UUID
    public_token: str = Field(min_length=10, max_length=256)


class ConnectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    household_id: uuid.UUID
    provider: str
    institution_name: str | None
    status: str
    last_synced_at: datetime | None
    created_at: datetime


class SyncMineResponse(BaseModel):
    synced: int
    failed: int
    skipped: int = 0


class CsvImportResponse(BaseModel):
    connection: ConnectionResponse
    imported_transactions: int


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    account_id: uuid.UUID
    date: date
    raw_description: str
    amount: Decimal
    currency: str
    display_name: str
    merchant_name: str | None = None
    category_id: uuid.UUID | None = None
    category_name: str | None = None
    needs_review: bool = True


class TransactionListResponse(BaseModel):
    items: list[TransactionResponse]
    total: int


class AccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    connection_id: uuid.UUID
    name: str
    type: str
    currency: str
    balance: Decimal
    masked_number: str | None
    nickname: str | None = None
    notes: str | None = None
    hidden: bool = False
    display_name: str | None = None
    institution_name: str | None = None


class AccountUpdateRequest(BaseModel):
    nickname: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=500)
    hidden: bool | None = None


class AccountDetailResponse(AccountResponse):
    recent_transactions: list[TransactionResponse] = []
