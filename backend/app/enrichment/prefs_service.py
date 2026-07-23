"""Category preference helpers."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.enrichment.prefs import CategoryPreference
from app.enrichment.schemas import CHIP_COLORS, ICON_KEYS


def default_icon_for_slug(slug: str) -> str:
    key = slug.replace("-", "_").split("_")[0]
    if key in ICON_KEYS:
        return key
    for candidate in ICON_KEYS:
        if candidate in slug:
            return candidate
    return "other"


def default_color_for_slug(slug: str) -> str:
    idx = sum(ord(c) for c in slug) % len(CHIP_COLORS)
    return CHIP_COLORS[idx]


async def list_prefs(db: AsyncSession, household_id: uuid.UUID) -> dict[uuid.UUID, CategoryPreference]:
    result = await db.execute(
        select(CategoryPreference).where(CategoryPreference.household_id == household_id)
    )
    return {p.category_id: p for p in result.scalars().all()}


async def upsert_pref(
    db: AsyncSession,
    household_id: uuid.UUID,
    category_id: uuid.UUID,
    icon_key: str,
    color: str,
) -> CategoryPreference:
    if icon_key not in ICON_KEYS:
        raise ValueError("Unknown icon_key")
    if not color.startswith("#"):
        color = f"#{color}"
    result = await db.execute(
        select(CategoryPreference).where(
            CategoryPreference.household_id == household_id,
            CategoryPreference.category_id == category_id,
        )
    )
    pref = result.scalar_one_or_none()
    if pref is None:
        pref = CategoryPreference(
            household_id=household_id,
            category_id=category_id,
            icon_key=icon_key,
            color=color,
        )
        db.add(pref)
    else:
        pref.icon_key = icon_key
        pref.color = color
    await db.commit()
    await db.refresh(pref)
    return pref
