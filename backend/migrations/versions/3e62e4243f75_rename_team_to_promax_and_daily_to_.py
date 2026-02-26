"""rename_team_to_promax_and_daily_to_monthly

Revision ID: 3e62e4243f75
Revises: 6ce912878bfb
Create Date: 2026-02-26 19:30:19.906247
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3e62e4243f75'
down_revision: Union[str, None] = '6ce912878bfb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Rename columns (preserves existing data)
    op.alter_column('users', 'daily_search_limit', new_column_name='monthly_search_limit')
    op.alter_column('users', 'daily_search_count', new_column_name='monthly_search_count')
    # Update any 'team' plan_type rows to 'pro_max'
    op.execute("UPDATE users SET plan_type = 'pro_max' WHERE plan_type = 'team'")
    op.execute("UPDATE subscriptions SET plan_type = 'pro_max' WHERE plan_type = 'team'")


def downgrade() -> None:
    op.execute("UPDATE subscriptions SET plan_type = 'team' WHERE plan_type = 'pro_max'")
    op.execute("UPDATE users SET plan_type = 'team' WHERE plan_type = 'pro_max'")
    op.alter_column('users', 'monthly_search_limit', new_column_name='daily_search_limit')
    op.alter_column('users', 'monthly_search_count', new_column_name='daily_search_count')
