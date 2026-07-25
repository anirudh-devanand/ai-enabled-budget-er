"""goal notes, priority, start_date, currency

Revision ID: 0010_goal_details
Revises: 0009_password_reset
Create Date: 2026-07-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010_goal_details"
down_revision: Union[str, None] = "0009_password_reset"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("goals", sa.Column("notes", sa.Text(), nullable=True))
    op.add_column(
        "goals",
        sa.Column("priority", sa.String(length=20), nullable=False, server_default="medium"),
    )
    op.add_column("goals", sa.Column("start_date", sa.Date(), nullable=True))
    op.add_column(
        "goals",
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="CAD"),
    )
    op.execute("UPDATE goals SET start_date = CAST(created_at AS date) WHERE start_date IS NULL")


def downgrade() -> None:
    op.drop_column("goals", "currency")
    op.drop_column("goals", "start_date")
    op.drop_column("goals", "priority")
    op.drop_column("goals", "notes")
