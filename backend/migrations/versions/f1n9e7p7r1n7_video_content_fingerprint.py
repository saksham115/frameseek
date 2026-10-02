"""Content fingerprint on videos, for the "already uploaded" warning.

Revision ID: f1n9e7p7r1n7
Revises: 5ea4c4b0e501
"""

from alembic import op
import sqlalchemy as sa

revision = "f1n9e7p7r1n7"
down_revision = "5ea4c4b0e501"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("videos", sa.Column("content_fingerprint", sa.String(length=64), nullable=True))
    op.create_index("ix_videos_content_fingerprint", "videos", ["content_fingerprint"])


def downgrade() -> None:
    op.drop_index("ix_videos_content_fingerprint", table_name="videos")
    op.drop_column("videos", "content_fingerprint")
