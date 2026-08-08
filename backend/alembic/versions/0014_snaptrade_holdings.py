"""SnapTrade user credentials + holdings table

Revision ID: 0014_snaptrade_holdings
Revises: 0013_mfa_login_challenges
Create Date: 2026-08-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014_snaptrade_holdings"
down_revision: Union[str, None] = "0013_mfa_login_challenges"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("snaptrade_user_id", sa.String(length=64), nullable=True))
    op.add_column(
        "users", sa.Column("snaptrade_user_secret_encrypted", sa.Text(), nullable=True)
    )
    op.alter_column(
        "bank_connections",
        "login_id_encrypted",
        existing_type=sa.String(length=512),
        type_=sa.Text(),
        existing_nullable=False,
    )
    op.create_table(
        "holdings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("external_id", sa.String(length=128), nullable=False),
        sa.Column("symbol", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=True),
        sa.Column("quantity", sa.Numeric(18, 8), nullable=False),
        sa.Column("price", sa.Numeric(18, 6), nullable=True),
        sa.Column("market_value", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("as_of", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("account_id", "external_id"),
    )
    op.create_index("ix_holdings_account_id", "holdings", ["account_id"])


def downgrade() -> None:
    op.drop_index("ix_holdings_account_id", table_name="holdings")
    op.drop_table("holdings")
    op.alter_column(
        "bank_connections",
        "login_id_encrypted",
        existing_type=sa.Text(),
        type_=sa.String(length=512),
        existing_nullable=False,
    )
    op.drop_column("users", "snaptrade_user_secret_encrypted")
    op.drop_column("users", "snaptrade_user_id")
