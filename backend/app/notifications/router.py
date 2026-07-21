import secrets
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.connections.provider import BankProvider
from app.connections.router import get_provider
from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.notifications import service
from app.users.models import User

router = APIRouter(prefix="/v1/notifications", tags=["notifications"])
ops_router = APIRouter(prefix="/v1/ops", tags=["ops"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
ProviderDep = Annotated[BankProvider, Depends(get_provider)]


def require_ops_token(x_ops_token: Annotated[str | None, Header()] = None) -> None:
    settings = get_settings()
    expected = settings.ops_token
    if not expected:
        if settings.env == "production":
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Ops token not configured")
        return
    if not x_ops_token or not secrets.compare_digest(x_ops_token, expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid ops token")


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
async def sync_all(
    db: DbDep,
    provider: ProviderDep,
    _: Annotated[None, Depends(require_ops_token)],
):
    """Trigger a full pull sync. Cron should send header X-Ops-Token."""
    return await service.sync_all_connections(db, provider)


class SeedDemoBody(BaseModel):
    email: str
    days: int = 180
    replace_existing_demo: bool = True


@ops_router.post("/seed-demo-history")
async def seed_demo_history(
    body: SeedDemoBody,
    db: DbDep,
    _: Annotated[None, Depends(require_ops_token)],
):
    """Attach extensive fake Canadian bank history to a user for QA / demos."""
    from app.ops.seed_demo import SeedDemoRequest, seed_demo_history as run_seed

    try:
        return await run_seed(
            db,
            SeedDemoRequest(
                email=body.email,
                days=body.days,
                replace_existing_demo=body.replace_existing_demo,
            ),
        )
    except LookupError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
