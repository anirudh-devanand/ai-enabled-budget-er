from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.account import service
from app.account.schemas import (
    DeleteConfirmRequest,
    DeleteConfirmResponse,
    DeleteRequestResponse,
)
from app.core.database import get_db
from app.core.deps import get_current_user
from app.users.models import User

router = APIRouter(prefix="/v1/account", tags=["account"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.post("/delete/request", response_model=DeleteRequestResponse)
async def request_account_deletion(user: CurrentUser, db: DbDep) -> DeleteRequestResponse:
    """Start deletion: create a time-limited OTP (emailed when Resend is configured)."""
    return await service.request_deletion(db, user)


@router.post("/delete/confirm", response_model=DeleteConfirmResponse)
async def confirm_account_deletion(
    body: DeleteConfirmRequest, user: CurrentUser, db: DbDep
) -> DeleteConfirmResponse:
    """Confirm deletion with password (or email re-type), OTP/TOTP, and phrase DELETE."""
    await service.confirm_deletion(
        db,
        user,
        code=body.code,
        confirm=body.confirm,
        password=body.password,
        email_confirm=body.email_confirm,
    )
    return DeleteConfirmResponse(deleted=True)
