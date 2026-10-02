"""Templates: creations, renders, user assets, and a monthly render counter.

Revision ID: c7ea7e0001tp
Revises: f1n9e7p7r1n7
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c7ea7e0001tp"
down_revision = "f1n9e7p7r1n7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "creations",
        sa.Column("creation_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("template_id", sa.String(64), nullable=False),
        sa.Column("template_version", sa.Integer(), nullable=False),
        sa.Column("recipe", postgresql.JSONB(), nullable=False),
        sa.Column("moments", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("settings", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("caption_edits", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index("ix_creations_user_id", "creations", ["user_id"])

    op.create_table(
        "renders",
        sa.Column("render_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("creation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("creations.creation_id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("progress", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("current_step", sa.String(50), nullable=True),
        sa.Column("spec", postgresql.JSONB(), nullable=False),
        sa.Column("format", sa.String(8), nullable=False),
        sa.Column("resolution", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("output_path", sa.String(1000), nullable=True),
        sa.Column("thumbnail_path", sa.String(1000), nullable=True),
        sa.Column("watermarked", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index("ix_renders_creation_id", "renders", ["creation_id"])
    op.create_index("ix_renders_user_id", "renders", ["user_id"])
    op.create_index("ix_renders_status", "renders", ["status"])

    op.create_table(
        "user_assets",
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("blob_path", sa.String(1000), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("duration_seconds", sa.Float(), nullable=True),
        sa.Column("rights_confirmed_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index("ix_user_assets_user_id", "user_assets", ["user_id"])

    op.add_column("users", sa.Column("monthly_render_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("render_count_reset_at", postgresql.TIMESTAMP(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "render_count_reset_at")
    op.drop_column("users", "monthly_render_count")
    op.drop_index("ix_user_assets_user_id", table_name="user_assets")
    op.drop_table("user_assets")
    op.drop_index("ix_renders_status", table_name="renders")
    op.drop_index("ix_renders_user_id", table_name="renders")
    op.drop_index("ix_renders_creation_id", table_name="renders")
    op.drop_table("renders")
    op.drop_index("ix_creations_user_id", table_name="creations")
    op.drop_table("creations")
