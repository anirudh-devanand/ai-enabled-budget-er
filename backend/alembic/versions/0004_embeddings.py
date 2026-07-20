"""descriptor_embeddings

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-20

"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "descriptor_embeddings",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "household_id",
            sa.Uuid(),
            sa.ForeignKey("households.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("normalized_pattern", sa.String(200), nullable=False),
        sa.Column("embedding_json", sa.Text(), nullable=False),
        sa.Column(
            "merchant_id",
            sa.Uuid(),
            sa.ForeignKey("merchants.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "category_id",
            sa.Uuid(),
            sa.ForeignKey("categories.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("household_id", "normalized_pattern"),
    )
    op.create_index(
        "ix_descriptor_embeddings_household_id", "descriptor_embeddings", ["household_id"]
    )


def downgrade() -> None:
    op.drop_table("descriptor_embeddings")
