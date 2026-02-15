import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import TIMESTAMP, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class Clip(Base):
    __tablename__ = "clips"

    clip_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    video_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("videos.video_id", ondelete="CASCADE"), nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    start_time: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    end_time: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    duration_seconds: Mapped[Decimal] = mapped_column(Numeric, nullable=False)

    file_path: Mapped[str | None] = mapped_column(String(1000))
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    gcs_path: Mapped[str | None] = mapped_column(String(1000))

    source_timestamp: Mapped[Decimal | None] = mapped_column(Numeric)
    source_frame_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))

    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))

    # Relationships
    user = relationship("User", back_populates="clips")
    video = relationship("Video", back_populates="clips")
