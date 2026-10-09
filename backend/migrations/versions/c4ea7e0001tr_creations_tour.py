"""Creations walkthrough flag, separate from the first-visit product tour.

Revision ID: c4ea7e0001tr
Revises: ad31a0001adm
"""

from alembic import op
import sqlalchemy as sa

revision = "c4ea7e0001tr"
down_revision = "ad31a0001adm"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("creations_tour_completed_at", sa.TIMESTAMP(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "creations_tour_completed_at")
