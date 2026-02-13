import time
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.search_history import SearchHistory
from app.models.user import User
from app.models.video import Video
from app.repositories.vector_db import vector_db
from app.schemas.search import SearchQuota, SearchRequest, SearchResponse, SearchResultItem
from app.services.embedding_service import EmbeddingService
from app.utils.formatting import format_duration


class SearchService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.embedding_service = EmbeddingService()

    async def search(self, request: SearchRequest, user_id: UUID) -> SearchResponse:
        start_time = time.time()

        # Check quota
        quota = await self.get_quota(user_id)
        if quota.remaining <= 0:
            from fastapi import HTTPException, status
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Daily search quota exceeded")

        # Generate query embedding
        query_vector = await self.embedding_service.generate_text_embedding(request.query)

        # Search Qdrant
        video_id_strs = [str(v) for v in request.video_ids] if request.video_ids else None
        raw_results = vector_db.search(
            user_id=str(user_id),
            query_vector=query_vector,
            top_k=request.top_k,
            video_ids=video_id_strs,
            min_score=request.min_score,
        )

        # Enrich results with video titles
        results = []
        for r in raw_results:
            video_title = r.payload.get("video_title", "Unknown")
            frame_path = r.payload.get("frame_path", "")
            results.append(SearchResultItem(
                frame_id=r.frame_id,
                video_id=r.video_id,
                video_title=video_title,
                timestamp_seconds=r.timestamp,
                formatted_timestamp=format_duration(r.timestamp),
                score=round(r.score, 4),
                frame_url=f"/storage/frames/{frame_path}" if frame_path else "",
                thumbnail_url=r.payload.get("thumbnail_path"),
                source_type=r.payload.get("source_type", "local"),
            ))

        search_time_ms = int((time.time() - start_time) * 1000)

        # Record search history
        await self._record_search(user_id, request, len(results), results[0].score if results else 0, search_time_ms)

        # Increment search count
        await self._increment_search_count(user_id)

        # Get updated quota
        quota = await self.get_quota(user_id)

        return SearchResponse(
            query=request.query,
            results=results,
            count=len(results),
            search_time_ms=search_time_ms,
            quota=quota,
        )

    async def get_quota(self, user_id: UUID) -> SearchQuota:
        result = await self.db.execute(select(User).where(User.user_id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            return SearchQuota(used=0, limit=50, remaining=50)

        # Reset if needed
        now = datetime.now(timezone.utc)
        if not user.search_count_reset_at or user.search_count_reset_at.date() < now.date():
            user.daily_search_count = 0
            user.search_count_reset_at = now
            await self.db.flush()

        return SearchQuota(
            used=user.daily_search_count,
            limit=user.daily_search_limit,
            remaining=max(0, user.daily_search_limit - user.daily_search_count),
            resets_at=user.search_count_reset_at,
        )

    async def get_history(self, user_id: UUID, limit: int = 20) -> list[SearchHistory]:
        result = await self.db.execute(
            select(SearchHistory)
            .where(SearchHistory.user_id == user_id)
            .order_by(SearchHistory.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def _record_search(self, user_id: UUID, request: SearchRequest, count: int, top_score: float, time_ms: int):
        history = SearchHistory(
            user_id=user_id,
            query=request.query,
            video_ids=[str(v) for v in request.video_ids] if request.video_ids else None,
            source_filter=request.source_filter,
            min_score=request.min_score,
            results_count=count,
            top_result_score=top_score,
            search_time_ms=time_ms,
        )
        self.db.add(history)
        await self.db.flush()

    async def _increment_search_count(self, user_id: UUID):
        result = await self.db.execute(select(User).where(User.user_id == user_id))
        user = result.scalar_one_or_none()
        if user:
            user.daily_search_count = (user.daily_search_count or 0) + 1
            await self.db.flush()
