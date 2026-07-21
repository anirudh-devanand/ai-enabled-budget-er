"""mfa recovery codes

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-20

"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("mfa_recovery_hashes", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "mfa_recovery_hashes")
