"""mfa_login_challenges for email OTP on sign-in

Revision ID: 0013_mfa_login_challenges
Revises: 0012_encrypted_text_fields
Create Date: 2026-07-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013_mfa_login_challenges"
down_revision: Union[str, None] = "0012_encrypted_text_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mfa_login_challenges",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mfa_login_challenges_user_id", "mfa_login_challenges", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_mfa_login_challenges_user_id", table_name="mfa_login_challenges")
    op.drop_table("mfa_login_challenges")
