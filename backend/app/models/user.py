import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, Integer, String, Text
from sqlalchemy.dialects.postgresql import TIMESTAMP, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Plan & Limits
    plan_type: Mapped[str] = mapped_column(String(20), default="free")
    storage_used_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    storage_limit_bytes: Mapped[int] = mapped_column(BigInteger, default=5368709120)  # 5GB
    monthly_search_limit: Mapped[int] = mapped_column(Integer, default=20)
    monthly_search_count: Mapped[int] = mapped_column(Integer, default=0)
    search_count_reset_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))

    retention_days: Mapped[int] = mapped_column(Integer, default=15)

    # Preferences
    auto_process_uploads: Mapped[bool] = mapped_column(Boolean, default=False)
    default_frame_interval: Mapped[float] = mapped_column(default=2.0)
    notifications_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    # OAuth
    google_id: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    google_access_token: Mapped[str | None] = mapped_column(Text)
    google_refresh_token: Mapped[str | None] = mapped_column(Text)
    google_token_expires_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    apple_id: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)

    # Terms of Service
    tos_accepted_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))

    # Relationships
    videos = relationship("Video", back_populates="user", lazy="selectin")
    folders = relationship("Folder", back_populates="user", lazy="selectin")
    clips = relationship("Clip", back_populates="user")
