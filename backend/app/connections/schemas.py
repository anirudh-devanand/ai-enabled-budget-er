import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ConnectionCreateRequest(BaseModel):
    household_id: uuid.UUID
    # loginId captured from the Flinks Connect widget REDIRECT event.
    login_id: str = Field(min_length=8, max_length=64)


class ConnectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    household_id: uuid.UUID
    provider: str
    institution_name: str | None
    status: str
    last_synced_at: datetime | None
    created_at: datetime


class AccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    connection_id: uuid.UUID
    name: str
    type: str
    currency: str
    balance: Decimal
    masked_number: str | None


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    account_id: uuid.UUID
    date: date
    raw_description: str
    amount: Decimal
    currency: str
    # Enrichment: what the UI should actually show.
    display_name: str
    merchant_name: str | None = None
    category_id: uuid.UUID | None = None
    category_name: str | None = None
    needs_review: bool = True


class TransactionListResponse(BaseModel):
    items: list[TransactionResponse]
    total: int
