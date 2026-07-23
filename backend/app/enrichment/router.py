import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connections.service import get_transaction_for_user, user_in_household
from app.core.database import get_db
from app.core.deps import get_current_user
from app.enrichment import prefs_service, service
from app.enrichment.models import Category
from app.enrichment.schemas import (
    CHIP_COLORS,
    ICON_KEYS,
    CategoryPreferenceUpdate,
    CategoryResponse,
    TransactionCorrectionRequest,
    TransactionCorrectionResponse,
)
from app.users.models import User

categories_router = APIRouter(prefix="/v1/categories", tags=["categories"])
transactions_router = APIRouter(prefix="/v1/transactions", tags=["transactions"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@categories_router.get("/icons")
async def list_icon_options(_: CurrentUser):
    return {"icons": ICON_KEYS, "colors": CHIP_COLORS}


@categories_router.get("/", response_model=list[CategoryResponse])
async def list_categories(
    _: CurrentUser,
    db: DbDep,
    household_id: uuid.UUID | None = Query(default=None),
):
    await service.ensure_default_categories(db)
    await db.commit()
    result = await db.execute(select(Category).order_by(Category.name))
    categories = list(result.scalars().all())
    prefs = {}
    if household_id is not None:
        prefs = await prefs_service.list_prefs(db, household_id)
    out: list[CategoryResponse] = []
    for c in categories:
        pref = prefs.get(c.id)
        out.append(
            CategoryResponse(
                id=c.id,
                slug=c.slug,
                name=c.name,
                parent_id=c.parent_id,
                icon_key=pref.icon_key if pref else prefs_service.default_icon_for_slug(c.slug),
                color=pref.color if pref else prefs_service.default_color_for_slug(c.slug),
            )
        )
    return out


@categories_router.put("/{category_id}/preference", response_model=CategoryResponse)
async def update_category_preference(
    category_id: uuid.UUID,
    body: CategoryPreferenceUpdate,
    household_id: uuid.UUID,
    user: CurrentUser,
    db: DbDep,
):
    if not await user_in_household(db, user.id, household_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Household not found")
    category = await db.get(Category, category_id)
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    try:
        pref = await prefs_service.upsert_pref(
            db, household_id, category_id, body.icon_key, body.color
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    return CategoryResponse(
        id=category.id,
        slug=category.slug,
        name=category.name,
        parent_id=category.parent_id,
        icon_key=pref.icon_key,
        color=pref.color,
    )


@transactions_router.patch("/{transaction_id}/category", response_model=TransactionCorrectionResponse)
async def correct_transaction_category(
    transaction_id: uuid.UUID,
    body: TransactionCorrectionRequest,
    user: CurrentUser,
    db: DbDep,
):
    found = await get_transaction_for_user(db, transaction_id, user.id)
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Transaction not found")
    transaction, household_id = found

    category = await db.get(Category, body.category_id)
    if category is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown category")

    _, reapplied = await service.correct_transaction(
        db,
        transaction,
        household_id,
        user.id,
        body.category_id,
        body.merchant_name,
    )
    return TransactionCorrectionResponse(
        transaction_id=transaction.id,
        category_id=body.category_id,
        merchant_name=body.merchant_name,
        reapplied_count=reapplied,
    )
