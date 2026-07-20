import uuid

from pydantic import BaseModel, ConfigDict, Field


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    parent_id: uuid.UUID | None


class TransactionCorrectionRequest(BaseModel):
    category_id: uuid.UUID
    merchant_name: str | None = Field(default=None, min_length=1, max_length=120)


class TransactionCorrectionResponse(BaseModel):
    transaction_id: uuid.UUID
    category_id: uuid.UUID
    merchant_name: str | None
    # How many other transactions with the same descriptor were fixed too.
    reapplied_count: int
