"""Free plan: 50 searches a month, plus up to three "Request more" top-ups of 10.

Revision ID: 5ea4c4b0e501
Revises: d00dfeed0001
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "5ea4c4b0e501"
down_revision = "d00dfeed0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("search_bonus", sa.Integer(), server_default="0", nullable=False))
    op.add_column("users", sa.Column("search_bonus_requests", sa.Integer(), server_default="0", nullable=False))
    op.alter_column("users", "monthly_search_limit", server_default="50")
    # Existing Free accounts move from 20 to 50 searches a month.
    op.execute("UPDATE users SET monthly_search_limit = 50 WHERE plan_type = 'free' AND monthly_search_limit = 20")

    op.create_table(
        "search_quota_requests",
        sa.Column("request_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("plan_type", sa.String(length=20), nullable=False),
        sa.Column("searches_granted", sa.Integer(), nullable=False),
        sa.Column("request_number", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_search_quota_requests_user_id", "search_quota_requests", ["user_id"])
    op.create_index("ix_search_quota_requests_created_at", "search_quota_requests", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_search_quota_requests_created_at", table_name="search_quota_requests")
    op.drop_index("ix_search_quota_requests_user_id", table_name="search_quota_requests")
    op.drop_table("search_quota_requests")
    op.execute("UPDATE users SET monthly_search_limit = 20 WHERE plan_type = 'free' AND monthly_search_limit = 50")
    op.alter_column("users", "monthly_search_limit", server_default=None)
    op.drop_column("users", "search_bonus_requests")
    op.drop_column("users", "search_bonus")
