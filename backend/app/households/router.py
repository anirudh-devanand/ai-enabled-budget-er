import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.households import service
from app.households.schemas import (
    HouseholdCreateRequest,
    HouseholdDetailResponse,
    HouseholdInviteRequest,
    HouseholdMemberResponse,
    HouseholdResponse,
)
from app.users.models import User

router = APIRouter(prefix="/v1/households", tags=["households"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.post("/", response_model=HouseholdResponse, status_code=status.HTTP_201_CREATED)
async def create_household(body: HouseholdCreateRequest, user: CurrentUser, db: DbDep):
    return await service.create_household(db, user, body.name)


@router.get("/", response_model=list[HouseholdResponse])
async def list_households(user: CurrentUser, db: DbDep):
    return await service.list_user_households(db, user.id)


@router.get("/{household_id}", response_model=HouseholdDetailResponse)
async def get_household(household_id: uuid.UUID, user: CurrentUser, db: DbDep):
    found = await service.get_household_for_user(db, household_id, user.id)
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Household not found")
    household, members = found
    return HouseholdDetailResponse(
        id=household.id,
        name=household.name,
        created_at=household.created_at,
        members=[HouseholdMemberResponse.model_validate(m) for m in members],
    )


@router.post(
    "/{household_id}/invite",
    response_model=HouseholdMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
async def invite_member(
    household_id: uuid.UUID,
    body: HouseholdInviteRequest,
    user: CurrentUser,
    db: DbDep,
):
    try:
        return await service.invite_member(db, household_id, user.id, body.email)
    except PermissionError:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Owner role required") from None
    except LookupError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found") from None
    except ValueError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from None
