from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import Pagination


class ClipCreateRequest(BaseModel):
    video_id: UUID
    title: str = Field(min_length=1, max_length=500)
    start_time: float = Field(ge=0)
    end_time: float = Field(gt=0)
    source_timestamp: float | None = None
    source_frame_id: UUID | None = None


class ClipResponse(BaseModel):
    clip_id: UUID
    user_id: UUID
    video_id: UUID
    title: str
    start_time: Decimal
    end_time: Decimal
    duration_seconds: Decimal
    file_path: str | None = None
    file_size_bytes: int | None = None
    source_timestamp: Decimal | None = None
    source_frame_id: UUID | None = None
    clip_url: str | None = None
    thumbnail_url: str | None = None
    video_title: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ClipListResponse(BaseModel):
    clips: list[ClipResponse]
    pagination: Pagination
