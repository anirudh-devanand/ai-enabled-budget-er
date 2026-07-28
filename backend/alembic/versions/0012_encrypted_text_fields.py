"""Widen transaction/account text columns for Fernet field encryption.

Revision ID: 0012_encrypted_text_fields
Revises: 0011_security_events
Create Date: 2026-07-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012_encrypted_text_fields"
down_revision: Union[str, None] = "0011_security_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "transactions",
        "raw_description",
        existing_type=sa.String(length=500),
        type_=sa.Text(),
        existing_nullable=False,
    )
    op.alter_column(
        "accounts",
        "notes",
        existing_type=sa.String(length=500),
        type_=sa.Text(),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "accounts",
        "notes",
        existing_type=sa.Text(),
        type_=sa.String(length=500),
        existing_nullable=True,
    )
    op.alter_column(
        "transactions",
        "raw_description",
        existing_type=sa.Text(),
        type_=sa.String(length=500),
        existing_nullable=False,
    )
