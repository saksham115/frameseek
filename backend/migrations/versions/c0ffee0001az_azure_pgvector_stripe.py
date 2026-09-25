"""Azure re-platform: pgvector embeddings table + Stripe customer id.

Adds the frame_embeddings table (replacing Qdrant) and users.stripe_customer_id
(replacing Apple/Google IAP). Enables the pgvector extension.

Revision ID: c0ffee0001az
Revises: a8f1b2c3d4e5
"""

from alembic import op
import sqlalchemy as sa

revision = "c0ffee0001az"
down_revision = "a8f1b2c3d4e5"
branch_labels = None
depends_on = None

VECTOR_SIZE = 1024


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.add_column("users", sa.Column("stripe_customer_id", sa.String(length=255), nullable=True))
    op.create_index("ix_users_stripe_customer_id", "users", ["stripe_customer_id"], unique=True)

    op.execute(
        f"""
        CREATE TABLE IF NOT EXISTS frame_embeddings (
            id           TEXT PRIMARY KEY,
            user_id      UUID NOT NULL,
            video_id     UUID NOT NULL,
            source_type  TEXT NOT NULL DEFAULT 'frame',
            embedding    vector({VECTOR_SIZE}) NOT NULL,
            payload      JSONB NOT NULL DEFAULT '{{}}'::jsonb
        )
        """
    )
    op.create_index("idx_frame_embeddings_user", "frame_embeddings", ["user_id"])
    op.create_index("idx_frame_embeddings_video", "frame_embeddings", ["video_id"])
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_frame_embeddings_vec "
        "ON frame_embeddings USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.drop_table("frame_embeddings")
    op.drop_index("ix_users_stripe_customer_id", table_name="users")
    op.drop_column("users", "stripe_customer_id")
