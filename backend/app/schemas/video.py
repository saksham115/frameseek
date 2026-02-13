from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import Pagination


class VideoMetadataSchema(BaseModel):
    duration_seconds: float | None = None
    fps: float | None = None
    width: int | None = None
    height: int | None = None
    codec: str | None = None


class VideoResponse(BaseModel):
    video_id: UUID
    title: str
    description: str | None = None
    original_filename: str
    file_size_bytes: int
    status: str
    processing_progress: int = 0
    frame_count: int | None = None
    local_uri: str | None = None
    thumbnail_uri: str | None = None
    source_type: str = "local"
    folder_id: UUID | None = None
    tags: list[str] | None = None
    duration_seconds: Decimal | None = None
    fps: Decimal | None = None
    width: int | None = None
    height: int | None = None
    codec: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VideoUploadResponse(BaseModel):
    video: VideoResponse
    job: "JobBriefResponse | None" = None


class VideoListResponse(BaseModel):
    videos: list[VideoResponse]
    pagination: Pagination


class VideoDetailResponse(BaseModel):
    video: VideoResponse
    frames_count: int
    job: "JobBriefResponse | None" = None


class ProcessRequest(BaseModel):
    frame_interval: float = Field(default=2.0, ge=0.5, le=30.0)
    priority: int = Field(default=5, ge=1, le=10)


class FrameResponse(BaseModel):
    frame_id: UUID
    video_id: UUID
    frame_index: int
    timestamp_seconds: Decimal
    frame_path: str
    thumbnail_path: str | None = None
    width: int | None = None
    height: int | None = None
    embedding_id: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class FrameListResponse(BaseModel):
    frames: list[FrameResponse]
    pagination: Pagination


class JobBriefResponse(BaseModel):
    job_id: UUID
    status: str
    progress: int
    current_step: str | None = None

    model_config = {"from_attributes": True}
