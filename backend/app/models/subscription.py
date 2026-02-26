import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class Subscription(Base):
    __tablename__ = "subscriptions"

    subscription_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Apple Store identifiers
    product_id: Mapped[str] = mapped_column(String(255), nullable=False)
    original_transaction_id: Mapped[str | None] = mapped_column(String(255), index=True)
    transaction_id: Mapped[str | None] = mapped_column(String(255), unique=True)

    # Plan
    plan_type: Mapped[str] = mapped_column(String(20), nullable=False)
    billing_period: Mapped[str | None] = mapped_column(String(20))  # "monthly" | "annual"

    # Status: active, expired, cancelled, grace_period, billing_retry, refunded
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)

    store: Mapped[str] = mapped_column(String(20), default="app_store")
    environment: Mapped[str] = mapped_column(String(20), default="sandbox")  # "sandbox" | "production"

    # Dates
    purchased_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now()
    )
    expires_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    grace_period_expires_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))

    # Auto-renew
    auto_renew_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_renew_product_id: Mapped[str | None] = mapped_column(String(255))

    # Apple Server Notification metadata
    last_notification_type: Mapped[str | None] = mapped_column(String(100))
    last_notification_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    user = relationship("User", backref="subscriptions")
