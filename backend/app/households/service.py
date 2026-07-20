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


async def invite_member(
    db: AsyncSession, household_id: uuid.UUID, owner_id: uuid.UUID, email: str
) -> HouseholdMember:
    """Add an existing user by email. Owner-only."""
    membership = await db.execute(
        select(HouseholdMember).where(
            HouseholdMember.household_id == household_id,
            HouseholdMember.user_id == owner_id,
            HouseholdMember.role == "owner",
        )
    )
    if membership.scalar_one_or_none() is None:
        raise PermissionError("owner required")

    invitee = (
        await db.execute(select(User).where(User.email == email.lower()))
    ).scalar_one_or_none()
    if invitee is None:
        raise LookupError("user not found")

    existing = await db.execute(
        select(HouseholdMember).where(
            HouseholdMember.household_id == household_id,
            HouseholdMember.user_id == invitee.id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise ValueError("already a member")

    member = HouseholdMember(
        household_id=household_id, user_id=invitee.id, role="member"
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member
