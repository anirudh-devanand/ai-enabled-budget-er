import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class BudgetCreateRequest(BaseModel):
    household_id: uuid.UUID
    name: str = Field(default="Monthly budget", min_length=1, max_length=120)
    mode: str = Field(default="flexible", pattern="^(flexible|zero_based)$")
    propose_from_history: bool = False


class BudgetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    household_id: uuid.UUID
    name: str
    mode: str
    currency: str


class BudgetCategoryTargetRequest(BaseModel):
    category_id: uuid.UUID
    target: Decimal = Field(ge=0)
    rollover: bool = True


class BudgetCategoryStatus(BaseModel):
    category_id: uuid.UUID
    target: Decimal
    actual: Decimal
    remaining: Decimal
    rollover: bool


class BudgetDetailResponse(BudgetResponse):
    period_start: date | None = None
    period_end: date | None = None
    categories: list[BudgetCategoryStatus] = []
