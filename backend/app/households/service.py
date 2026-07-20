import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.households.models import Household, HouseholdMember
from app.users.models import User


async def create_personal_household(db: AsyncSession, user: User) -> Household:
    household = Household(name=f"{user.display_name}'s household")
    db.add(household)
    await db.flush()
    db.add(HouseholdMember(household_id=household.id, user_id=user.id, role="owner"))
    await db.flush()
    return household


async def create_household(db: AsyncSession, user: User, name: str) -> Household:
    household = Household(name=name)
    db.add(household)
    await db.flush()
    db.add(HouseholdMember(household_id=household.id, user_id=user.id, role="owner"))
    await db.commit()
    await db.refresh(household)
    return household


async def list_user_households(db: AsyncSession, user_id: uuid.UUID) -> list[Household]:
    result = await db.execute(
        select(Household)
        .join(HouseholdMember, HouseholdMember.household_id == Household.id)
        .where(HouseholdMember.user_id == user_id)
        .order_by(Household.created_at)
    )
    return list(result.scalars().all())


async def get_household_for_user(
    db: AsyncSession, household_id: uuid.UUID, user_id: uuid.UUID
) -> tuple[Household, list[HouseholdMember]] | None:
    membership = await db.execute(
        select(HouseholdMember).where(
            HouseholdMember.household_id == household_id,
            HouseholdMember.user_id == user_id,
        )
    )
    if membership.scalar_one_or_none() is None:
        return None
    household = await db.get(Household, household_id)
    if household is None:
        return None
    members = await db.execute(
        select(HouseholdMember)
        .where(HouseholdMember.household_id == household_id)
        .order_by(HouseholdMember.created_at)
    )
    return household, list(members.scalars().all())
