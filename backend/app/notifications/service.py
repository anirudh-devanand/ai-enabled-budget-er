import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connections.models import BankConnection
from app.connections.provider import BankProvider
from app.connections.service import sync_connection
from app.households.models import HouseholdMember
from app.notifications.models import Notification


async def create_notification(
    db: AsyncSession, user_id: uuid.UUID, kind: str, title: str, body: str
) -> Notification:
    note = Notification(user_id=user_id, kind=kind, title=title, body=body)
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


async def list_notifications(
    db: AsyncSession, user_id: uuid.UUID, unread_only: bool = False
) -> list[Notification]:
    q = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        q = q.where(Notification.read.is_(False))
    result = await db.execute(q.order_by(Notification.created_at.desc()).limit(100))
    return list(result.scalars().all())


async def mark_read(db: AsyncSession, user_id: uuid.UUID, note_id: uuid.UUID) -> bool:
    note = await db.get(Notification, note_id)
    if note is None or note.user_id != user_id:
        return False
    note.read = True
    await db.commit()
    return True


async def sync_all_connections(
    db: AsyncSession, provider: BankProvider
) -> dict[str, int]:
    """Pull-based nightly sync for every active bank connection."""
    result = await db.execute(
        select(BankConnection).where(BankConnection.status.in_(["active", "error"]))
    )
    ok = fail = 0
    for connection in result.scalars():
        try:
            await sync_connection(db, connection, provider)
            ok += 1
            members = (
                await db.execute(
                    select(HouseholdMember).where(
                        HouseholdMember.household_id == connection.household_id
                    )
                )
            ).scalars().all()
            for m in members:
                db.add(
                    Notification(
                        user_id=m.user_id,
                        kind="sync_complete",
                        title="Accounts synced",
                        body=f"{connection.institution_name or 'Bank'} updated successfully.",
                    )
                )
            await db.commit()
        except Exception:
            fail += 1
            await db.rollback()
            connection = await db.get(BankConnection, connection.id)
            if connection:
                connection.status = "error"
                await db.commit()
    return {"synced": ok, "failed": fail}
