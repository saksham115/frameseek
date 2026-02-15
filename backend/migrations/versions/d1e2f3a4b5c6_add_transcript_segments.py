"""add transcript segments table and video transcript columns

Revision ID: d1e2f3a4b5c6
Revises: c4a13581ee62
Create Date: 2026-02-15 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, None] = "c4a13581ee62"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create transcript_segments table
    op.create_table(
        "transcript_segments",
        sa.Column("segment_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("video_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("videos.video_id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("segment_index", sa.Integer(), nullable=False),
        sa.Column("start_seconds", sa.Float(), nullable=False),
        sa.Column("end_seconds", sa.Float(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("language", sa.String(10), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("chunk_group", sa.Integer(), nullable=True),
        sa.Column("embedding_id", sa.String(255), nullable=True),
        sa.Column("embedding_generated_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("nearest_frame_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("frames.frame_id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", postgresql.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )

    # Add transcript columns to videos table
    op.add_column("videos", sa.Column("has_transcript", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("videos", sa.Column("transcript_status", sa.String(20), server_default="pending", nullable=False))
    op.add_column("videos", sa.Column("transcript_language", sa.String(10), nullable=True))
    op.add_column("videos", sa.Column("transcript_segment_count", sa.Integer(), nullable=True))
    op.add_column("videos", sa.Column("transcript_error", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("videos", "transcript_error")
    op.drop_column("videos", "transcript_segment_count")
    op.drop_column("videos", "transcript_language")
    op.drop_column("videos", "transcript_status")
    op.drop_column("videos", "has_transcript")
    op.drop_table("transcript_segments")
