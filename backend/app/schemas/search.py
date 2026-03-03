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


class SearchQuota(BaseModel):
    used: int
    limit: int
    remaining: int
    resets_at: datetime | None = None


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
