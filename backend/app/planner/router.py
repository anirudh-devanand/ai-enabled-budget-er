import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.connections.service import user_in_household
from app.core.database import get_db
from app.core.deps import get_current_user
from app.planner import service
from app.users.models import User

router = APIRouter(prefix="/v1/goals", tags=["goals"])
DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


class GoalCreateRequest(BaseModel):
    household_id: uuid.UUID
    name: str = Field(min_length=1, max_length=120)
    type: str = Field(default="save", pattern="^(save|debt_payoff|emergency_fund|custom)$")
    target_amount: Decimal = Field(gt=0)
    current_amount: Decimal = Field(default=Decimal("0"), ge=0)
    target_date: date | None = None


class GoalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    household_id: uuid.UUID
    name: str
    type: str
    target_amount: Decimal
    current_amount: Decimal
    target_date: date | None
    status: str


class PlanItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    action: str
    amount: Decimal
    rationale: str
    category_id: uuid.UUID | None


class PlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    goal_id: uuid.UUID
    summary: str
    monthly_surplus_needed: Decimal
    projected_completion: date | None
    items: list[PlanItemResponse] = []


class ScenarioRequest(BaseModel):
    income_delta: Decimal = Decimal("0")
    expense_delta: Decimal = Decimal("0")


@router.post("/", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
async def create_goal(body: GoalCreateRequest, user: CurrentUser, db: DbDep):
    if not await user_in_household(db, user.id, body.household_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Household not found")
    return await service.create_goal(
        db,
        body.household_id,
        body.name,
        body.type,
        body.target_amount,
        body.target_date,
        body.current_amount,
    )


@router.get("/", response_model=list[GoalResponse])
async def list_goals(household_id: uuid.UUID, user: CurrentUser, db: DbDep):
    if not await user_in_household(db, user.id, household_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Household not found")
    return await service.list_goals(db, household_id)


@router.post("/{goal_id}/plan", response_model=PlanResponse)
async def build_plan(goal_id: uuid.UUID, user: CurrentUser, db: DbDep):
    goal = await service.get_goal_for_user(db, goal_id, user.id)
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Goal not found")
    plan = await service.generate_plan(db, goal)
    items = await service.list_plan_items(db, plan.id)
    return PlanResponse(
        id=plan.id,
        goal_id=plan.goal_id,
        summary=plan.summary,
        monthly_surplus_needed=plan.monthly_surplus_needed,
        projected_completion=plan.projected_completion,
        items=[PlanItemResponse.model_validate(i) for i in items],
    )


@router.get("/{goal_id}/plan", response_model=PlanResponse)
async def get_plan(goal_id: uuid.UUID, user: CurrentUser, db: DbDep):
    goal = await service.get_goal_for_user(db, goal_id, user.id)
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Goal not found")
    plan = await service.latest_plan(db, goal.id)
    if plan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No plan yet")
    items = await service.list_plan_items(db, plan.id)
    return PlanResponse(
        id=plan.id,
        goal_id=plan.goal_id,
        summary=plan.summary,
        monthly_surplus_needed=plan.monthly_surplus_needed,
        projected_completion=plan.projected_completion,
        items=[PlanItemResponse.model_validate(i) for i in items],
    )


@router.post("/{goal_id}/scenario")
async def scenario(
    goal_id: uuid.UUID, body: ScenarioRequest, user: CurrentUser, db: DbDep
):
    goal = await service.get_goal_for_user(db, goal_id, user.id)
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Goal not found")
    return await service.run_scenario(
        db, goal.household_id, goal, body.income_delta, body.expense_delta
    )
