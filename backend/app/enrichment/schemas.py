import uuid

from pydantic import BaseModel, ConfigDict, Field


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    parent_id: uuid.UUID | None
    icon_key: str | None = None
    color: str | None = None


class CategoryPreferenceUpdate(BaseModel):
    icon_key: str = Field(min_length=2, max_length=40)
    color: str = Field(min_length=4, max_length=16, pattern=r"^#?[0-9A-Fa-f]{3,8}$")


ICON_KEYS = [
    "income",
    "transfers",
    "groceries",
    "dining",
    "transport",
    "housing",
    "utilities",
    "subscriptions",
    "shopping",
    "health",
    "entertainment",
    "travel",
    "fees",
    "other",
]


CHIP_COLORS = [
    "#f3ead5",
    "#eeeae3",
    "#efe9dc",
    "#f2ebe0",
    "#ebe8e1",
    "#f0e8dc",
    "#efe9d8",
    "#ebe6df",
    "#f1e8e4",
    "#e8efe9",
    "#f0e6ea",
    "#e6ecf2",
    "#f3e4e4",
    "#e8f4ff",
    "#fff0e6",
    "#eaf6e4",
]


class TransactionCorrectionRequest(BaseModel):
    category_id: uuid.UUID
    merchant_name: str | None = Field(default=None, min_length=1, max_length=120)


class TransactionCorrectionResponse(BaseModel):
    transaction_id: uuid.UUID
    category_id: uuid.UUID
    merchant_name: str | None
    # How many other transactions with the same descriptor were fixed too.
    reapplied_count: int
