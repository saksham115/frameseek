import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import TIMESTAMP, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class SearchQuotaRequest(Base):
    """One row per "Request more" click that granted extra searches."""

    __tablename__ = "search_quota_requests"

    request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="SET NULL"), index=True
    )
    plan_type: Mapped[str] = mapped_column(String(20), nullable=False)
    searches_granted: Mapped[int] = mapped_column(Integer, nullable=False)
    # 1, 2 or 3: which of the month's allowed requests this was.
    request_number: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), index=True)
