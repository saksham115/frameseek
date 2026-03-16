import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class AccountDeletionFeedback(Base):
    __tablename__ = "account_deletion_feedback"

    feedback_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    reason: Mapped[str] = mapped_column(String(100), nullable=False)
    feedback: Mapped[str | None] = mapped_column(Text)

    # Usage stats snapshot at time of deletion
    plan_type: Mapped[str | None] = mapped_column(String(20))
    total_videos: Mapped[int | None] = mapped_column(Integer)
    total_searches: Mapped[int | None] = mapped_column(Integer)
    storage_used_bytes: Mapped[int | None] = mapped_column(BigInteger)
    account_age_days: Mapped[int | None] = mapped_column(Integer)
    subscription_history: Mapped[dict | None] = mapped_column(JSONB)

    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
