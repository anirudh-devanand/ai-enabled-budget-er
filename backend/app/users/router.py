from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.service import authenticator_enabled
from app.core.database import get_db
from app.core.deps import get_current_user
from app.users.models import User
from app.users.schemas import UserResponse

router = APIRouter(prefix="/v1/users", tags=["users"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


class UserUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        mfa_enabled=user.mfa_enabled,
        authenticator_enabled=authenticator_enabled(user),
        created_at=user.created_at,
    )


@router.get("/me", response_model=UserResponse)
async def me(user: CurrentUser) -> UserResponse:
    return _user_response(user)


@router.patch("/me", response_model=UserResponse)
async def update_me(body: UserUpdateRequest, user: CurrentUser, db: DbDep) -> UserResponse:
    if body.display_name is not None:
        user.display_name = body.display_name.strip()
    await db.commit()
    await db.refresh(user)
    return _user_response(user)
