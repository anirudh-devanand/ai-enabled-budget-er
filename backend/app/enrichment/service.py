import json
import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.connections.models import Account, BankConnection, Transaction
from app.core.config import get_settings
from app.core.llm import LlmClient, get_llm_client, propose_merchant_category
from app.enrichment.embeddings import cosine_similarity, embed_text, token_overlap, tokens
from app.enrichment.models import (
    Category,
    CategoryRule,
    DescriptorEmbedding,
    Merchant,
    TransactionEnrichment,
)
from app.enrichment.normalize import normalize_descriptor
from app.enrichment.rules import DEFAULT_CATEGORIES, match_global_rule


async def ensure_default_categories(db: AsyncSession) -> dict[str, Category]:
    existing = {c.slug: c for c in (await db.execute(select(Category))).scalars()}
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


async def index_descriptor(
    db: AsyncSession,
    normalized: str,
    merchant_id: uuid.UUID | None,
    category_id: uuid.UUID,
    household_id: uuid.UUID | None,
) -> None:
    """Upsert an embedding so future similar descriptors can match."""
    result = await db.execute(
        select(DescriptorEmbedding).where(
            DescriptorEmbedding.household_id == household_id,
            DescriptorEmbedding.normalized_pattern == normalized,
        )
    )
    row = result.scalar_one_or_none()
    vector = embed_text(normalized)
    if row is None:
        db.add(
            DescriptorEmbedding(
                household_id=household_id,
                normalized_pattern=normalized,
                embedding_json=json.dumps(vector),
                merchant_id=merchant_id,
                category_id=category_id,
            )
        )
    else:
        row.merchant_id = merchant_id
        row.category_id = category_id
        row.embedding_json = json.dumps(vector)
    await db.flush()


async def _match_embedding(
    db: AsyncSession, household_id: uuid.UUID, normalized: str
) -> DescriptorEmbedding | None:
    """Nearest resolved descriptor by token overlap (primary) and cosine (tie-break)."""
    query_vec = embed_text(normalized)
    result = await db.execute(
        select(DescriptorEmbedding).where(
            or_(
                DescriptorEmbedding.household_id == household_id,
                DescriptorEmbedding.household_id.is_(None),
            )
        )
    )
    best: DescriptorEmbedding | None = None
    best_score = 0.0
    for row in result.scalars():
        overlap = token_overlap(normalized, row.normalized_pattern)
        try:
            vec = json.loads(row.embedding_json)
            cos = cosine_similarity(query_vec, vec)
        except json.JSONDecodeError:
            cos = 0.0
        score = overlap * 0.75 + cos * 0.25
        shared = tokens(normalized) & tokens(row.normalized_pattern)
        if len(shared) < 2 and overlap < 0.5:
            continue
        if score > best_score:
            best_score = score
            best = row
    if best is None:
        return None
    if len(tokens(normalized) & tokens(best.normalized_pattern)) >= 2 and token_overlap(
        normalized, best.normalized_pattern
    ) >= 0.4:
        return best
    if best_score < 0.45:
        return None
    return best


async def enrich_transactions(
    db: AsyncSession,
    household_id: uuid.UUID,
    transactions: list[Transaction],
    llm: LlmClient | None = None,
) -> None:
    """Cascade: user rules -> global rules -> embedding -> LLM -> unresolved."""
    if not transactions:
        return
    categories = await ensure_default_categories(db)
    user_rules = await _household_rules(db, household_id)
    llm = llm if llm is not None else get_llm_client()
    settings = get_settings()

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
        from app.core.security import decrypt_field

        plain_description = decrypt_field(txn.raw_description) or ""
        normalized = normalize_descriptor(plain_description)

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
            category_id = categories[global_rule.category_slug].id
            db.add(
                TransactionEnrichment(
                    transaction_id=txn.id,
                    merchant_id=merchant_id,
                    category_id=category_id,
                    stage="global_rule",
                    confidence=global_rule.confidence,
                    needs_review=False,
                )
            )
            await index_descriptor(db, normalized, merchant_id, category_id, None)
            continue

        emb = await _match_embedding(db, household_id, normalized)
        if emb is not None:
            db.add(
                TransactionEnrichment(
                    transaction_id=txn.id,
                    merchant_id=emb.merchant_id,
                    category_id=emb.category_id,
                    stage="embedding",
                    confidence=settings.embedding_match_threshold,
                    needs_review=False,
                )
            )
            continue

        proposal = await propose_merchant_category(
            llm,
            plain_description,
            str(txn.amount),
            list(categories.keys()),
        )
        if (
            proposal is not None
            and proposal.confidence >= settings.llm_enrichment_min_confidence
        ):
            merchant = await merchant_for(proposal.merchant_name)
            category_id = categories[proposal.category_slug].id
            db.add(
                TransactionEnrichment(
                    transaction_id=txn.id,
                    merchant_id=merchant.id,
                    category_id=category_id,
                    stage="llm",
                    confidence=proposal.confidence,
                    needs_review=False,
                )
            )
            await index_descriptor(
                db, normalized, merchant.id, category_id, household_id
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
    merchant = await get_or_create_merchant(db, merchant_name) if merchant_name else None
    merchant_id = merchant.id if merchant else None
    from app.core.security import decrypt_field

    normalized = normalize_descriptor(decrypt_field(transaction.raw_description) or "")

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
    await index_descriptor(db, normalized, merchant_id, category_id, household_id)

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
    from app.core.security import decrypt_field

    matching = [
        t
        for t in result.scalars()
        if t.id != corrected_transaction_id
        and normalize_descriptor(decrypt_field(t.raw_description) or "") == normalized
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
            continue
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
) -> tuple[
    dict[uuid.UUID, TransactionEnrichment],
    dict[uuid.UUID, Merchant],
    dict[uuid.UUID, Category],
]:
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
