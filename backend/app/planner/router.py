import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated, Any

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
    start_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)
    priority: str = Field(default="medium", pattern="^(low|medium|high)$")
    currency: str = Field(default="CAD", min_length=3, max_length=3)


class GoalUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    type: str | None = Field(default=None, pattern="^(save|debt_payoff|emergency_fund|custom)$")
    target_amount: Decimal | None = Field(default=None, gt=0)
    current_amount: Decimal | None = Field(default=None, ge=0)
    target_date: date | None = None
    start_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)
    priority: str | None = Field(default=None, pattern="^(low|medium|high)$")
    status: str | None = Field(default=None, pattern="^(active|paused|completed)$")
    currency: str | None = Field(default=None, min_length=3, max_length=3)


class GoalContributeRequest(BaseModel):
    amount: Decimal = Field(gt=0)


class GoalResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    household_id: uuid.UUID
    name: str
    type: str
    target_amount: Decimal
    current_amount: Decimal
    target_date: date | None
    start_date: date | None = None
    notes: str | None = None
    priority: str = "medium"
    currency: str = "CAD"
    status: str
    progress_pct: float = 0
    remaining: Decimal = Decimal("0")
    days_left: int | None = None
    monthly_needed: Decimal = Decimal("0")
    on_track: bool | None = None


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


async def _enrich(db: AsyncSession, goal: Any) -> GoalResponse:
    surplus = await service.monthly_surplus(db, goal.household_id)
    extra = service.goal_progress_fields(goal, surplus)
    base = GoalResponse.model_validate(goal)
    return base.model_copy(update=extra)


@router.post("/", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
async def create_goal(body: GoalCreateRequest, user: CurrentUser, db: DbDep):
    if not await user_in_household(db, user.id, body.household_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Household not found")
    goal = await service.create_goal(
        db,
        body.household_id,
        body.name,
        body.type,
        body.target_amount,
        body.target_date,
        body.current_amount,
        start_date=body.start_date,
        notes=body.notes,
        priority=body.priority,
        currency=body.currency.upper(),
    )
    return await _enrich(db, goal)


@router.get("/", response_model=list[GoalResponse])
async def list_goals(household_id: uuid.UUID, user: CurrentUser, db: DbDep):
    if not await user_in_household(db, user.id, household_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Household not found")
    goals = await service.list_goals(db, household_id)
    return [await _enrich(db, g) for g in goals]


@router.patch("/{goal_id}", response_model=GoalResponse)
async def update_goal(goal_id: uuid.UUID, body: GoalUpdateRequest, user: CurrentUser, db: DbDep):
    goal = await service.get_goal_for_user(db, goal_id, user.id)
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Goal not found")
    fields = body.model_dump(exclude_unset=True)
    kwargs: dict[str, Any] = {}
    if "name" in fields:
        kwargs["name"] = fields["name"]
    if "type" in fields:
        kwargs["goal_type"] = fields["type"]
    if "target_amount" in fields:
        kwargs["target_amount"] = fields["target_amount"]
    if "current_amount" in fields:
        kwargs["current_amount"] = fields["current_amount"]
    if "priority" in fields:
        kwargs["priority"] = fields["priority"]
    if "status" in fields:
        kwargs["status"] = fields["status"]
    if "currency" in fields and fields["currency"]:
        kwargs["currency"] = str(fields["currency"]).upper()
    for key in ("target_date", "start_date", "notes"):
        if key in fields:
            kwargs[key] = fields[key]
    goal = await service.update_goal(db, goal, **kwargs)
    return await _enrich(db, goal)


@router.post("/{goal_id}/contribute", response_model=GoalResponse)
async def contribute(
    goal_id: uuid.UUID, body: GoalContributeRequest, user: CurrentUser, db: DbDep
):
    goal = await service.get_goal_for_user(db, goal_id, user.id)
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Goal not found")
    try:
        goal = await service.contribute_to_goal(db, goal, body.amount)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return await _enrich(db, goal)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(goal_id: uuid.UUID, user: CurrentUser, db: DbDep):
    goal = await service.get_goal_for_user(db, goal_id, user.id)
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Goal not found")
    await service.delete_goal(db, goal)


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
