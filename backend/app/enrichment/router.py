import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connections.service import get_transaction_for_user
from app.core.database import get_db
from app.core.deps import get_current_user
from app.enrichment import service
from app.enrichment.models import Category
from app.enrichment.schemas import (
    CategoryResponse,
    TransactionCorrectionRequest,
    TransactionCorrectionResponse,
)
from app.users.models import User

categories_router = APIRouter(prefix="/v1/categories", tags=["categories"])
transactions_router = APIRouter(prefix="/v1/transactions", tags=["transactions"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@categories_router.get("/", response_model=list[CategoryResponse])
async def list_categories(_: CurrentUser, db: DbDep):
    await service.ensure_default_categories(db)
    await db.commit()
    result = await db.execute(select(Category).order_by(Category.name))
    return list(result.scalars().all())


@transactions_router.patch("/{transaction_id}/category", response_model=TransactionCorrectionResponse)
async def correct_transaction_category(
    transaction_id: uuid.UUID,
    body: TransactionCorrectionRequest,
    user: CurrentUser,
    db: DbDep,
):
    """User correction: fixes this transaction, creates a durable household
    rule for the descriptor, and re-applies it to matching history."""
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
