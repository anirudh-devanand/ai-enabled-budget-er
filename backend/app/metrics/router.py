import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.connections.service import user_in_household
from app.core.database import get_db
from app.core.deps import get_current_user
from app.metrics import service
from app.users.models import User

router = APIRouter(prefix="/v1/metrics", tags=["metrics"])
DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


class NetWorthResponse(BaseModel):
    total: Decimal
    currency: str
    accounts: list[dict]


class CashFlowPoint(BaseModel):
    date: date
    income: Decimal
    spending: Decimal
    net: Decimal


class NamedAmount(BaseModel):
    name: str
    amount: Decimal
    category_id: uuid.UUID | None = None
    merchant_id: uuid.UUID | None = None


class PeriodSummaryResponse(BaseModel):
    days: int
    income_total: Decimal
    spending_total: Decimal
    net: Decimal
    currency: str


async def _guard(db: AsyncSession, user: User, household_id: uuid.UUID) -> None:
    if not await user_in_household(db, user.id, household_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Household not found")


@router.get("/net-worth", response_model=NetWorthResponse)
async def get_net_worth(household_id: uuid.UUID, user: CurrentUser, db: DbDep):
    await _guard(db, user, household_id)
    data = await service.net_worth(db, household_id)
    return NetWorthResponse(**data)


@router.get("/cash-flow", response_model=list[CashFlowPoint])
async def get_cash_flow(
    household_id: uuid.UUID,
    user: CurrentUser,
    db: DbDep,
    days: Annotated[int, Query(ge=7, le=365)] = 90,
):
    await _guard(db, user, household_id)
    return await service.cash_flow(db, household_id, days)


@router.get("/period-summary", response_model=PeriodSummaryResponse)
async def get_period_summary(
    household_id: uuid.UUID,
    user: CurrentUser,
    db: DbDep,
    days: Annotated[int, Query(ge=7, le=365)] = 30,
):
    await _guard(db, user, household_id)
    return PeriodSummaryResponse(**await service.period_summary(db, household_id, days))


@router.get("/spending-by-category")
async def get_spending_by_category(
    household_id: uuid.UUID,
    user: CurrentUser,
    db: DbDep,
    days: Annotated[int, Query(ge=7, le=365)] = 30,
):
    await _guard(db, user, household_id)
    return await service.spending_by_category(db, household_id, days)


@router.get("/income-by-category")
async def get_income_by_category(
    household_id: uuid.UUID,
    user: CurrentUser,
    db: DbDep,
    days: Annotated[int, Query(ge=7, le=365)] = 30,
):
    await _guard(db, user, household_id)
    return await service.income_by_category(db, household_id, days)


@router.get("/spending-by-merchant")
async def get_spending_by_merchant(
    household_id: uuid.UUID,
    user: CurrentUser,
    db: DbDep,
    days: Annotated[int, Query(ge=7, le=365)] = 30,
):
    await _guard(db, user, household_id)
    return await service.spending_by_merchant(db, household_id, days)


@router.get("/sankey")
async def get_sankey(
    household_id: uuid.UUID,
    user: CurrentUser,
    db: DbDep,
    days: Annotated[int, Query(ge=7, le=365)] = 30,
):
    await _guard(db, user, household_id)
    return await service.sankey_flow(db, household_id, days)
