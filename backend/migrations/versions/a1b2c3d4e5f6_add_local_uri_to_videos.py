"""add local_uri and thumbnail_uri to videos

Revision ID: a1b2c3d4e5f6
Revises: 8c26c88c4c7f
Create Date: 2026-02-11 18:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '8c26c88c4c7f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('videos', sa.Column('local_uri', sa.Text(), nullable=True))
    op.add_column('videos', sa.Column('thumbnail_uri', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('videos', 'thumbnail_uri')
    op.drop_column('videos', 'local_uri')
