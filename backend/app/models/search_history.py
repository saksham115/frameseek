import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Date, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, TIMESTAMP, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class SearchHistory(Base):
    __tablename__ = "search_history"

    search_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)

    query: Mapped[str] = mapped_column(Text, nullable=False)
    query_embedding_id: Mapped[str | None] = mapped_column(String(255))

    # Filters Applied
    video_ids: Mapped[list | None] = mapped_column(ARRAY(UUID(as_uuid=True)))
    source_filter: Mapped[str | None] = mapped_column(String(20))
    min_score: Mapped[Decimal | None] = mapped_column()

    # Results
    results_count: Mapped[int] = mapped_column(Integer, default=0)
    top_result_score: Mapped[Decimal | None] = mapped_column()

    # Performance
    search_time_ms: Mapped[int | None] = mapped_column(Integer)

    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())


class UserAnalytics(Base):
    __tablename__ = "user_analytics"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True)
    date: Mapped[date] = mapped_column(Date, primary_key=True)

    # Counts
    videos_uploaded: Mapped[int] = mapped_column(Integer, default=0)
    videos_processed: Mapped[int] = mapped_column(Integer, default=0)
    searches_performed: Mapped[int] = mapped_column(Integer, default=0)
    storage_delta_bytes: Mapped[int] = mapped_column(BigInteger, default=0)

    # Aggregates
    total_processing_time_seconds: Mapped[int] = mapped_column(Integer, default=0)
    total_frames_generated: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())
