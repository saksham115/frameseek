"""add apple_id to users

Revision ID: a8f1b2c3d4e5
Revises: 57ded9e4631b
Create Date: 2026-03-22 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a8f1b2c3d4e5'
down_revision: Union[str, None] = '57ded9e4631b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('apple_id', sa.String(length=255), nullable=True))
    op.create_index(op.f('ix_users_apple_id'), 'users', ['apple_id'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_users_apple_id'), table_name='users')
    op.drop_column('users', 'apple_id')
