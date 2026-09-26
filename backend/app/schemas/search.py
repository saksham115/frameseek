from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    top_k: int = Field(default=20, ge=1, le=50)
    video_ids: list[UUID] | None = None
    min_score: float = Field(default=0.05, ge=0.0, le=1.0)


class SearchResultItem(BaseModel):
    frame_id: UUID
    video_id: UUID
    video_title: str
    timestamp_seconds: float
    formatted_timestamp: str
    score: float
    frame_url: str
    thumbnail_url: str | None = None
    match_type: str = "semantic_visual"
    # The shot (run of look-alike frames) this match falls in. Matches in the same shot
    # are collapsed into one result; match_count says how many frames matched.
    shot_index: int | None = None
    shot_start_seconds: float | None = None
    shot_end_seconds: float | None = None
    shot_frame_count: int | None = None
    match_count: int = 1


class SearchQuota(BaseModel):
    used: int
    # Effective limit this month: the plan's limit plus any "Request more" top-ups.
    limit: int
    remaining: int
    resets_at: datetime | None = None
    bonus_searches: int = 0
    requests_used: int = 0
    requests_max: int = 0
    # True only on the Free plan, with searches used up and top-ups left this month.
    can_request_more: bool = False


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResultItem]
    count: int
    search_time_ms: int
    quota: SearchQuota


class SearchHistoryItem(BaseModel):
    search_id: UUID
    query: str
    results_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class SearchHistoryResponse(BaseModel):
    history: list[SearchHistoryItem]
