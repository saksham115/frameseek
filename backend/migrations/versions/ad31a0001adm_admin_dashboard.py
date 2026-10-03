"""Admin dashboard: admins, daily activity, and where users are.

Revision ID: ad31a0001adm
Revises: c7ea7e0001tp
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "ad31a0001adm"
down_revision = "c7ea7e0001tp"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "admins",
        sa.Column("email", sa.String(255), primary_key=True),
        sa.Column("added_by", sa.String(255), nullable=True),
        sa.Column("created_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "user_active_days",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("day", sa.Date(), primary_key=True),
    )
    op.create_index("ix_user_active_days_day", "user_active_days", ["day"])
    op.add_column("users", sa.Column("country_code", sa.String(2), nullable=True))
    op.add_column("users", sa.Column("timezone", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("last_seen_at", postgresql.TIMESTAMP(timezone=True), nullable=True))
    op.create_index("ix_users_country_code", "users", ["country_code"])
    op.create_index("ix_users_last_seen_at", "users", ["last_seen_at"])


def downgrade() -> None:
    op.drop_index("ix_users_last_seen_at", table_name="users")
    op.drop_index("ix_users_country_code", table_name="users")
    op.drop_column("users", "last_seen_at")
    op.drop_column("users", "timezone")
    op.drop_column("users", "country_code")
    op.drop_index("ix_user_active_days_day", table_name="user_active_days")
    op.drop_table("user_active_days")
    op.drop_table("admins")
