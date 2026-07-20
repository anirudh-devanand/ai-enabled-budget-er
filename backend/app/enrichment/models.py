import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.users.models import utcnow


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("categories.id", ondelete="SET NULL"), default=None
    )
    slug: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Merchant(Base):
    __tablename__ = "merchants"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    website: Mapped[str | None] = mapped_column(String(255), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TransactionEnrichment(Base):
    """One row per transaction recording how (and how confidently) it was resolved."""

    __tablename__ = "transaction_enrichments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("transactions.id", ondelete="CASCADE"), unique=True, index=True
    )
    merchant_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("merchants.id", ondelete="SET NULL"), default=None
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("categories.id", ondelete="SET NULL"), default=None
    )
    # user_rule | user_correction | global_rule | embedding | llm | unresolved
    stage: Mapped[str] = mapped_column(String(20), default="unresolved")
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class CategoryRule(Base):
    """Durable per-household override created from a user correction."""

    __tablename__ = "category_rules"
    __table_args__ = (UniqueConstraint("household_id", "normalized_pattern"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("households.id", ondelete="CASCADE"), index=True
    )
    normalized_pattern: Mapped[str] = mapped_column(String(200))
    merchant_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("merchants.id", ondelete="SET NULL"), default=None
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("categories.id", ondelete="CASCADE")
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DescriptorEmbedding(Base):
    """Indexed embeddings of resolved descriptors for nearest-neighbour matching."""

    __tablename__ = "descriptor_embeddings"
    __table_args__ = (UniqueConstraint("household_id", "normalized_pattern"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    household_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("households.id", ondelete="CASCADE"), index=True, default=None
    )
    normalized_pattern: Mapped[str] = mapped_column(String(200))
    embedding_json: Mapped[str] = mapped_column(Text)
    merchant_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("merchants.id", ondelete="SET NULL"), default=None
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("categories.id", ondelete="CASCADE")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
