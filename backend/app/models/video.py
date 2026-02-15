import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TIMESTAMP, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class Video(Base):
    __tablename__ = "videos"

    video_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)

    # Basic Info
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)

    # Storage
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    gcs_bucket: Mapped[str | None] = mapped_column(String(255))
    gcs_path: Mapped[str | None] = mapped_column(String(1000))
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)

    # Video Metadata
    duration_seconds: Mapped[Decimal | None] = mapped_column()
    fps: Mapped[Decimal | None] = mapped_column()
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    codec: Mapped[str | None] = mapped_column(String(50))

    # Processing
    status: Mapped[str] = mapped_column(String(20), default="uploaded", index=True)
    processing_progress: Mapped[int] = mapped_column(Integer, default=0)
    frame_count: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)

    # Transcript
    has_transcript: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    transcript_status: Mapped[str] = mapped_column(String(20), default="pending", server_default="pending")
    transcript_language: Mapped[str | None] = mapped_column(String(10))
    transcript_segment_count: Mapped[int | None] = mapped_column(Integer)
    transcript_error: Mapped[str | None] = mapped_column(Text)

    # Organization
    folder_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("folders.folder_id", ondelete="SET NULL"))
    tags: Mapped[list | None] = mapped_column(ARRAY(String(100)))

    # Client-side URIs (for mobile playback without re-downloading)
    local_uri: Mapped[str | None] = mapped_column(Text)
    thumbnail_uri: Mapped[str | None] = mapped_column(Text)

    # Source
    source_type: Mapped[str] = mapped_column(String(20), default="local")
    source_id: Mapped[str | None] = mapped_column(String(500))
    source_url: Mapped[str | None] = mapped_column(Text)
    source_metadata: Mapped[dict | None] = mapped_column(JSONB)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())
    processed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))

    # Relationships
    user = relationship("User", back_populates="videos")
    folder = relationship("Folder", back_populates="videos")
    frames = relationship("Frame", back_populates="video", cascade="all, delete-orphan")
    jobs = relationship("Job", back_populates="video", cascade="all, delete-orphan")
    clips = relationship("Clip", back_populates="video", cascade="all, delete-orphan")
    transcript_segments = relationship("TranscriptSegment", back_populates="video", cascade="all, delete-orphan")
