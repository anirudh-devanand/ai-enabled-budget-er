import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.connections.provider import BankProvider
from app.connections.router import get_provider
from app.core.database import get_db
from app.core.deps import get_current_user
from app.notifications import service
from app.users.models import User

router = APIRouter(prefix="/v1/notifications", tags=["notifications"])
ops_router = APIRouter(prefix="/v1/ops", tags=["ops"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
ProviderDep = Annotated[BankProvider, Depends(get_provider)]


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: str
    title: str
    body: str
    read: bool


@router.get("/", response_model=list[NotificationResponse])
async def list_notifications(
    user: CurrentUser, db: DbDep, unread_only: bool = False
):
    return await service.list_notifications(db, user.id, unread_only)


@router.post("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(notification_id: uuid.UUID, user: CurrentUser, db: DbDep):
    if not await service.mark_read(db, user.id, notification_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")


@ops_router.post("/sync-all")
async def sync_all(user: CurrentUser, db: DbDep, provider: ProviderDep):
    """Trigger a full pull sync (cron can hit this with a service account later)."""
    return await service.sync_all_connections(db, provider)
