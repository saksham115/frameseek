import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class Creation(Base):
    """A user's editable template draft: moments from their videos plus panel settings.

    The template recipe is copied in when the creation is made, so later edits to the
    catalogue never change an existing creation.
    """

    __tablename__ = "creations"

    creation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    template_id: Mapped[str] = mapped_column(String(64), nullable=False)
    template_version: Mapped[int] = mapped_column(Integer, nullable=False)
    recipe: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # [{id, video_id, start, end, crop: {x, y, zoom} | null, keep_audio}]
    moments: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    # The adjustable panel's state (format, captions, text, branding, music, cards).
    settings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # Edited caption lines per moment id, in source-video seconds. A moment without an
    # entry uses its transcript as-is.
    caption_edits: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))


class Render(Base):
    """One render of a creation to an MP4. The creation's state is frozen into ``spec``
    when the render is queued, so editing during a render doesn't change its output."""

    __tablename__ = "renders"

    render_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    creation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("creations.creation_id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued", index=True)
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    current_step: Mapped[str | None] = mapped_column(String(50))
    spec: Mapped[dict] = mapped_column(JSONB, nullable=False)

    format: Mapped[str] = mapped_column(String(8), nullable=False)
    resolution: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    duration_seconds: Mapped[float | None] = mapped_column(Float)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    output_path: Mapped[str | None] = mapped_column(String(1000))
    thumbnail_path: Mapped[str | None] = mapped_column(String(1000))
    watermarked: Mapped[bool] = mapped_column(default=False)
    error_message: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    # Refreshed by the worker's heartbeat; a rendering row whose updated_at stops moving
    # lost its worker.
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))


class UserAsset(Base):
    """A logo or music file the user uploaded for their creations."""

    __tablename__ = "user_assets"

    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)

    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # logo | music
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    blob_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")  # pending | ready
    duration_seconds: Mapped[float | None] = mapped_column(Float)
    # Music only: when the user confirmed they have the rights to use the track.
    rights_confirmed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))

    created_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
