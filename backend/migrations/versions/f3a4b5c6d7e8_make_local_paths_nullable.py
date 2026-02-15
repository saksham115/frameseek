"""make local paths nullable for GCS-only storage

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-02-15 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "f3a4b5c6d7e8"
down_revision: Union[str, None] = "e2f3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("videos", "file_path", existing_type=sa.String(1000), nullable=True)
    op.alter_column("frames", "frame_path", existing_type=sa.String(1000), nullable=True)


def downgrade() -> None:
    # Backfill NULLs with empty string before re-adding NOT NULL
    op.execute("UPDATE videos SET file_path = '' WHERE file_path IS NULL")
    op.execute("UPDATE frames SET frame_path = '' WHERE frame_path IS NULL")
    op.alter_column("videos", "file_path", existing_type=sa.String(1000), nullable=False)
    op.alter_column("frames", "frame_path", existing_type=sa.String(1000), nullable=False)
