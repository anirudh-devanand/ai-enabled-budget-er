"""prefs, oauth, account nicknames, transaction filters

Revision ID: 0007_prefs_oauth
Revises: 0006_mfa_recovery_codes
Create Date: 2026-07-21
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_prefs_oauth"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("oauth_provider", sa.String(length=40), nullable=True))
    op.add_column("users", sa.Column("oauth_subject", sa.String(length=255), nullable=True))
    op.alter_column("users", "password_hash", existing_type=sa.String(length=255), nullable=True)
    op.create_index("ix_users_oauth", "users", ["oauth_provider", "oauth_subject"], unique=True)

    op.add_column("accounts", sa.Column("nickname", sa.String(length=120), nullable=True))
    op.add_column("accounts", sa.Column("notes", sa.String(length=500), nullable=True))
    op.add_column(
        "accounts",
        sa.Column("hidden", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )

    op.create_table(
        "category_preferences",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("household_id", sa.Uuid(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=False),
        sa.Column("icon_key", sa.String(length=40), nullable=False),
        sa.Column("color", sa.String(length=16), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["household_id"], ["households.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("household_id", "category_id", name="uq_category_pref_household"),
    )
    op.create_index("ix_category_preferences_household_id", "category_preferences", ["household_id"])


def downgrade() -> None:
    op.drop_index("ix_category_preferences_household_id", table_name="category_preferences")
    op.drop_table("category_preferences")
    op.drop_column("accounts", "hidden")
    op.drop_column("accounts", "notes")
    op.drop_column("accounts", "nickname")
    op.drop_index("ix_users_oauth", table_name="users")
    op.drop_column("users", "oauth_subject")
    op.drop_column("users", "oauth_provider")
    op.alter_column("users", "password_hash", existing_type=sa.String(length=255), nullable=False)
