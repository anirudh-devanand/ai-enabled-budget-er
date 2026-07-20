import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connections.models import Account, BankConnection, Transaction
from app.enrichment.models import Category, CategoryRule, Merchant, TransactionEnrichment
from app.enrichment.normalize import normalize_descriptor
from app.enrichment.rules import DEFAULT_CATEGORIES, match_global_rule


async def ensure_default_categories(db: AsyncSession) -> dict[str, Category]:
    """Idempotently seed the global taxonomy; returns slug -> Category."""
    existing = {
        c.slug: c for c in (await db.execute(select(Category))).scalars()
    }
    created = False
    for slug, name in DEFAULT_CATEGORIES:
        if slug not in existing:
            category = Category(slug=slug, name=name)
            db.add(category)
            existing[slug] = category
            created = True
    if created:
        await db.flush()
    return existing


async def get_or_create_merchant(db: AsyncSession, name: str) -> Merchant:
    result = await db.execute(select(Merchant).where(Merchant.name == name))
    merchant = result.scalar_one_or_none()
    if merchant is None:
        merchant = Merchant(name=name)
        db.add(merchant)
        await db.flush()
    return merchant


async def _household_rules(
    db: AsyncSession, household_id: uuid.UUID
) -> dict[str, CategoryRule]:
    result = await db.execute(
        select(CategoryRule).where(CategoryRule.household_id == household_id)
    )
    return {rule.normalized_pattern: rule for rule in result.scalars()}


async def enrich_transactions(
    db: AsyncSession, household_id: uuid.UUID, transactions: list[Transaction]
) -> None:
    """Run the cascade over transactions that don't have an enrichment yet.

    Stage order: per-household user rules -> global rules -> unresolved
    (flagged for one-tap review). Embedding and LLM stages arrive in the next
    slice and will slot in before "unresolved".
    """
    if not transactions:
        return
    categories = await ensure_default_categories(db)
    user_rules = await _household_rules(db, household_id)

    existing_ids = {
        row
        for row in (
            await db.execute(
                select(TransactionEnrichment.transaction_id).where(
                    TransactionEnrichment.transaction_id.in_([t.id for t in transactions])
                )
            )
        ).scalars()
    }

    merchant_cache: dict[str, Merchant] = {}

    async def merchant_for(name: str) -> Merchant:
        if name not in merchant_cache:
            merchant_cache[name] = await get_or_create_merchant(db, name)
        return merchant_cache[name]

    for txn in transactions:
        if txn.id in existing_ids:
            continue
        normalized = normalize_descriptor(txn.raw_description)

        user_rule = user_rules.get(normalized)
        if user_rule is not None:
            db.add(
                TransactionEnrichment(
                    transaction_id=txn.id,
                    merchant_id=user_rule.merchant_id,
                    category_id=user_rule.category_id,
                    stage="user_rule",
                    confidence=1.0,
                    needs_review=False,
                )
            )
            continue

        global_rule = match_global_rule(normalized)
        if global_rule is not None:
            merchant_id = None
            if global_rule.merchant is not None:
                merchant_id = (await merchant_for(global_rule.merchant)).id
            db.add(
                TransactionEnrichment(
                    transaction_id=txn.id,
                    merchant_id=merchant_id,
                    category_id=categories[global_rule.category_slug].id,
                    stage="global_rule",
                    confidence=global_rule.confidence,
                    needs_review=False,
                )
            )
            continue

        db.add(
            TransactionEnrichment(
                transaction_id=txn.id, stage="unresolved", confidence=0.0, needs_review=True
            )
        )
    await db.flush()


async def correct_transaction(
    db: AsyncSession,
    transaction: Transaction,
    household_id: uuid.UUID,
    user_id: uuid.UUID,
    category_id: uuid.UUID,
    merchant_name: str | None,
) -> tuple[TransactionEnrichment, int]:
    """Apply a user correction and make it durable.

    Creates/updates a household rule keyed on the normalized descriptor and
    re-applies it to every other matching transaction in the household that a
    user hasn't already corrected. Returns (enrichment, reapplied_count).
    """
    merchant = await get_or_create_merchant(db, merchant_name) if merchant_name else None
    merchant_id = merchant.id if merchant else None
    normalized = normalize_descriptor(transaction.raw_description)

    enrichment = (
        await db.execute(
            select(TransactionEnrichment).where(
                TransactionEnrichment.transaction_id == transaction.id
            )
        )
    ).scalar_one_or_none()
    if enrichment is None:
        enrichment = TransactionEnrichment(transaction_id=transaction.id)
        db.add(enrichment)
    enrichment.merchant_id = merchant_id
    enrichment.category_id = category_id
    enrichment.stage = "user_correction"
    enrichment.confidence = 1.0
    enrichment.needs_review = False

    rule = (
        await db.execute(
            select(CategoryRule).where(
                CategoryRule.household_id == household_id,
                CategoryRule.normalized_pattern == normalized,
            )
        )
    ).scalar_one_or_none()
    if rule is None:
        rule = CategoryRule(
            household_id=household_id,
            normalized_pattern=normalized,
            created_by=user_id,
        )
        db.add(rule)
    rule.merchant_id = merchant_id
    rule.category_id = category_id
    await db.flush()

    reapplied = await _reapply_rule(db, household_id, normalized, transaction.id, rule)
    await db.commit()
    return enrichment, reapplied


async def _reapply_rule(
    db: AsyncSession,
    household_id: uuid.UUID,
    normalized: str,
    corrected_transaction_id: uuid.UUID,
    rule: CategoryRule,
) -> int:
    result = await db.execute(
        select(Transaction)
        .join(Account, Account.id == Transaction.account_id)
        .join(BankConnection, BankConnection.id == Account.connection_id)
        .where(BankConnection.household_id == household_id)
    )
    matching = [
        t
        for t in result.scalars()
        if t.id != corrected_transaction_id
        and normalize_descriptor(t.raw_description) == normalized
    ]
    if not matching:
        return 0

    enrichments = {
        e.transaction_id: e
        for e in (
            await db.execute(
                select(TransactionEnrichment).where(
                    TransactionEnrichment.transaction_id.in_([t.id for t in matching])
                )
            )
        ).scalars()
    }
    count = 0
    for txn in matching:
        enrichment = enrichments.get(txn.id)
        if enrichment is None:
            enrichment = TransactionEnrichment(transaction_id=txn.id)
            db.add(enrichment)
        elif enrichment.stage == "user_correction":
            continue  # never overwrite an explicit correction
        enrichment.merchant_id = rule.merchant_id
        enrichment.category_id = rule.category_id
        enrichment.stage = "user_rule"
        enrichment.confidence = 1.0
        enrichment.needs_review = False
        count += 1
    await db.flush()
    return count


async def enrichment_maps(
    db: AsyncSession, transaction_ids: list[uuid.UUID]
) -> tuple[dict[uuid.UUID, TransactionEnrichment], dict[uuid.UUID, Merchant], dict[uuid.UUID, Category]]:
    """Bulk-load enrichments plus referenced merchants/categories for a listing."""
    if not transaction_ids:
        return {}, {}, {}
    enrichments = {
        e.transaction_id: e
        for e in (
            await db.execute(
                select(TransactionEnrichment).where(
                    TransactionEnrichment.transaction_id.in_(transaction_ids)
                )
            )
        ).scalars()
    }
    merchant_ids = {e.merchant_id for e in enrichments.values() if e.merchant_id}
    category_ids = {e.category_id for e in enrichments.values() if e.category_id}
    merchants = (
        {
            m.id: m
            for m in (
                await db.execute(select(Merchant).where(Merchant.id.in_(merchant_ids)))
            ).scalars()
        }
        if merchant_ids
        else {}
    )
    categories = (
        {
            c.id: c
            for c in (
                await db.execute(select(Category).where(Category.id.in_(category_ids)))
            ).scalars()
        }
        if category_ids
        else {}
    )
    return enrichments, merchants, categories
