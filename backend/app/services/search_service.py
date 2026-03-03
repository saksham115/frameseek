import time
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.search_history import SearchHistory
from app.models.user import User
from app.repositories.vector_db import vector_db
from app.schemas.search import SearchQuota, SearchRequest, SearchResponse, SearchResultItem
from app.services.embedding_service import EmbeddingService

from app.utils.formatting import format_duration
from app.utils.gcs_client import GCSClient


class SearchService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.embedding_service = EmbeddingService()

    async def search(self, request: SearchRequest, user_id: UUID) -> SearchResponse:
        start_time = time.time()

        # Check quota (limit == -1 means unlimited)
        quota = await self.get_quota(user_id)
        if quota.limit != -1 and quota.remaining <= 0:
            from fastapi import HTTPException, status
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Monthly search quota exceeded")

        # Semantic search via Qdrant — visual frames only
        query_vector = await self.embedding_service.generate_text_embedding(request.query)

        video_id_strs = [str(v) for v in request.video_ids] if request.video_ids else None
        raw_results = vector_db.search(
            user_id=str(user_id),
            query_vector=query_vector,
            top_k=request.top_k,
            video_ids=video_id_strs,
            min_score=request.min_score,
            source_type_filter="local",
        )

        # Enrich results with video titles
        gcs_enabled = GCSClient.is_enabled()
        results: list[SearchResultItem] = []
        for r in raw_results:
            video_title = r.payload.get("video_title", "Unknown")
            frame_path = r.payload.get("frame_path", "")

            frame_id = r.payload.get("frame_id") or r.frame_id

            # Resolve frame/thumbnail URLs — GCS first when enabled
            gcs_frame = r.payload.get("gcs_frame_path")
            gcs_thumb = r.payload.get("gcs_thumb_path")

            # Frame URL
            if gcs_frame and gcs_enabled:
                frame_url = GCSClient.get().generate_signed_url(gcs_frame)
            elif frame_path:
                frame_url = f"/storage/frames/{frame_path}"
            else:
                frame_url = ""

            # Thumbnail URL
            if gcs_thumb and gcs_enabled:
                thumbnail_url = GCSClient.get().generate_signed_url(gcs_thumb)
            elif r.payload.get("thumbnail_path"):
                thumbnail_url = f"/storage/frames/{r.payload['thumbnail_path']}"
            else:
                thumbnail_url = None

            results.append(SearchResultItem(
                frame_id=frame_id,
                video_id=r.video_id,
                video_title=video_title,
                timestamp_seconds=r.timestamp,
                formatted_timestamp=format_duration(r.timestamp),
                score=round(r.score, 4),
                frame_url=frame_url,
                thumbnail_url=thumbnail_url,
            ))

        # Trim to top_k
        results = results[:request.top_k]

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
            return SearchQuota(used=0, limit=20, remaining=20)

        # Reset if new month
        now = datetime.now(timezone.utc)
        if not user.search_count_reset_at or (
            user.search_count_reset_at.year, user.search_count_reset_at.month
        ) < (now.year, now.month):
            user.monthly_search_count = 0
            user.search_count_reset_at = now
            await self.db.flush()

        limit = user.monthly_search_limit

        return SearchQuota(
            used=user.monthly_search_count,
            limit=limit,
            remaining=max(0, limit - user.monthly_search_count),
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
            source_filter="visual",
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
            user.monthly_search_count = (user.monthly_search_count or 0) + 1
            await self.db.flush()
