from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import Pagination


class JobResponse(BaseModel):
    job_id: UUID
    video_id: UUID
    video_title: str | None = None
    job_type: str
    status: str
    progress: int
    current_step: str | None = None
    total_frames: int | None = None
    processed_frames: int = 0
    error_message: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class JobListResponse(BaseModel):
    jobs: list[JobResponse]
    pagination: Pagination
