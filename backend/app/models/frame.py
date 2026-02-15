import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import TIMESTAMP, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class Frame(Base):
    __tablename__ = "frames"
    __table_args__ = (UniqueConstraint("video_id", "frame_index"),)

    frame_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    video_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("videos.video_id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)

    # Frame Info
    frame_index: Mapped[int] = mapped_column(Integer, nullable=False)
    timestamp_seconds: Mapped[Decimal] = mapped_column(nullable=False)

    # Storage
    frame_path: Mapped[str | None] = mapped_column(String(1000))
    gcs_path: Mapped[str | None] = mapped_column(String(1000))
    thumbnail_path: Mapped[str | None] = mapped_column(String(1000))

    # Metadata
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer)

    # Embedding
    embedding_id: Mapped[str | None] = mapped_column(String(255))
    embedding_generated_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())

    # Relationships
    video = relationship("Video", back_populates="frames")
