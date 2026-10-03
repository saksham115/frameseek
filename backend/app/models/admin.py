from datetime import date, datetime
import uuid

from sqlalchemy import Date, ForeignKey, String
from sqlalchemy.dialects.postgresql import TIMESTAMP, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class Admin(Base):
    """An admin added from the dashboard. Admins listed in the ADMIN_EMAILS setting are
    admins too, without a row here."""

    __tablename__ = "admins"

    email: Mapped[str] = mapped_column(String(255), primary_key=True)  # lowercased
    added_by: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), nullable=False)


class UserActiveDay(Base):
    """One row per user per day they used the app: daily and monthly active users."""

    __tablename__ = "user_active_days"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True, index=True)
