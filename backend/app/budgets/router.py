import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.budgets import service
from app.budgets.schemas import (
    BudgetCategoryStatus,
    BudgetCategoryTargetRequest,
    BudgetCreateRequest,
    BudgetDetailResponse,
    BudgetResponse,
)
from app.connections.service import user_in_household
from app.core.database import get_db
from app.core.deps import get_current_user
from app.users.models import User

router = APIRouter(prefix="/v1/budgets", tags=["budgets"])
DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.post("/", response_model=BudgetResponse, status_code=status.HTTP_201_CREATED)
async def create_budget(body: BudgetCreateRequest, user: CurrentUser, db: DbDep):
    if not await user_in_household(db, user.id, body.household_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Household not found")
    if body.propose_from_history:
        return await service.propose_budget_from_history(db, body.household_id, body.name)
    return await service.create_budget(db, body.household_id, body.name, body.mode)


@router.get("/", response_model=list[BudgetResponse])
async def list_budgets(household_id: uuid.UUID, user: CurrentUser, db: DbDep):
    if not await user_in_household(db, user.id, household_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Household not found")
    return await service.list_budgets(db, household_id)


@router.get("/{budget_id}", response_model=BudgetDetailResponse)
async def get_budget(budget_id: uuid.UUID, user: CurrentUser, db: DbDep):
    budget = await service.get_budget_for_user(db, budget_id, user.id)
    if budget is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Budget not found")
    period = await service._current_period(db, budget.id)
    statuses = await service.budget_status(db, budget)
    return BudgetDetailResponse(
        id=budget.id,
        household_id=budget.household_id,
        name=budget.name,
        mode=budget.mode,
        currency=budget.currency,
        period_start=period.start_date if period else None,
        period_end=period.end_date if period else None,
        categories=[BudgetCategoryStatus(**s) for s in statuses],
    )


@router.put("/{budget_id}/categories", response_model=BudgetCategoryStatus)
async def set_target(
    budget_id: uuid.UUID, body: BudgetCategoryTargetRequest, user: CurrentUser, db: DbDep
):
    budget = await service.get_budget_for_user(db, budget_id, user.id)
    if budget is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Budget not found")
    bc = await service.set_category_target(
        db, budget.id, body.category_id, body.target, body.rollover
    )
    statuses = await service.budget_status(db, budget)
    match = next(s for s in statuses if s["category_id"] == bc.category_id)
    return BudgetCategoryStatus(**match)
