from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.deps import get_current_user
from app.users.models import User
from app.users.schemas import UserResponse

router = APIRouter(prefix="/v1/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
async def me(user: Annotated[User, Depends(get_current_user)]) -> User:
    return user
