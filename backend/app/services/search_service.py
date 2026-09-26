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
from app.services.embedding_service import EmbeddingService, EmbeddingUnavailableError
from app.services.shot_service import Shot, ShotService, shot_at

from app.utils.formatting import format_duration
from app.utils.gcs_client import GCSClient


_SHOT_OVERFETCH = 3


def collapse_into_shots(
    results: list[SearchResultItem], shots_by_video: dict[str, list[Shot]]
) -> list[SearchResultItem]:
    """Keep the best-scoring hit per shot (results arrive best-first) and annotate it with
    the shot's span and how many of its frames matched."""
    kept: dict[tuple[str, object], SearchResultItem] = {}
    for item in results:
        shot = shot_at(shots_by_video.get(str(item.video_id), []), item.timestamp_seconds)
        key = (str(item.video_id), shot.index if shot else f"frame:{item.frame_id}")
        if key in kept:
            kept[key].match_count += 1
            continue
        if shot:
            item.shot_index = shot.index
            item.shot_start_seconds = shot.start_seconds
            item.shot_end_seconds = shot.end_seconds
            item.shot_frame_count = shot.frame_count
        kept[key] = item
    return list(kept.values())


class SearchService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.embedding_service = EmbeddingService()

    async def search(self, request: SearchRequest, user_id: UUID) -> SearchResponse:
        start_time = time.time()

        # Reset the counter at month boundaries, then atomically reserve one search.
        await self.get_quota(user_id)
        if not await self._reserve_search(user_id):
            from fastapi import HTTPException, status
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Monthly search quota exceeded")

        # Semantic search via pgvector: visual frames only
        try:
            query_vector = await self.embedding_service.generate_text_embedding(request.query)
        except EmbeddingUnavailableError as exc:
            from fastapi import HTTPException, status
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Search is temporarily unavailable. Please try again later.",
            ) from exc

        video_id_strs = [str(v) for v in request.video_ids] if request.video_ids else None
        raw_results = vector_db.search(
            user_id=str(user_id),
            query_vector=query_vector,
            # Hits in the same shot collapse into one result, so over-fetch to still
            # return up to top_k distinct shots.
            top_k=min(request.top_k * _SHOT_OVERFETCH, 150),
            video_ids=video_id_strs,
            min_score=request.min_score,
            source_type_filter="local",
        )

        # Enrich results with video titles and short-lived signed URLs (Blob SAS only).
        # Indexed payloads retain the original title when a video is renamed.
        titles = {}
        durations: dict[str, float | None] = {}
        if raw_results:
            rows = await self.db.execute(
                select(Video.video_id, Video.title, Video.duration_seconds).where(
                    Video.user_id == user_id,
                    Video.deleted_at.is_(None),
                    Video.video_id.in_([UUID(r.video_id) for r in raw_results]),
                )
            )
            for video_id, title, duration in rows:
                titles[str(video_id)] = title
                durations[str(video_id)] = float(duration) if duration is not None else None
        gcs_enabled = GCSClient.is_enabled()
        results: list[SearchResultItem] = []
        for r in raw_results:
            video_title = titles.get(r.video_id, r.payload.get("video_title", "Unknown"))
            frame_id = r.payload.get("frame_id") or r.frame_id

            gcs_frame = r.payload.get("gcs_frame_path")
            gcs_thumb = r.payload.get("gcs_thumb_path")

            frame_url = GCSClient.get().generate_signed_url(gcs_frame) if (gcs_frame and gcs_enabled) else ""
            thumbnail_url = GCSClient.get().generate_signed_url(gcs_thumb) if (gcs_thumb and gcs_enabled) else None

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

        shots = await ShotService(self.db).shots_for_videos(user_id, list(durations), durations)
        results = collapse_into_shots(results, shots)[:request.top_k]

        search_time_ms = int((time.time() - start_time) * 1000)

        # Record search history (the quota was already reserved up-front)
        await self._record_search(user_id, request, len(results), results[0].score if results else 0, search_time_ms)

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
        # populate_existing: _reserve_search bumps the counter with a raw UPDATE, which the
        # session's cached User doesn't see; without it the quota reads one search behind.
        result = await self.db.execute(
            select(User).where(User.user_id == user_id).execution_options(populate_existing=True)
        )
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

    async def _reserve_search(self, user_id: UUID) -> bool:
        """Atomically consume one search if under the monthly limit (-1 = unlimited).
        Returns False without changing anything when the quota is exhausted."""
        from sqlalchemy import text

        result = await self.db.execute(
            text(
                "UPDATE users SET monthly_search_count = monthly_search_count + 1 "
                "WHERE user_id = :uid AND (monthly_search_limit = -1 "
                "OR monthly_search_count < monthly_search_limit)"
            ),
            {"uid": str(user_id)},
        )
        return result.rowcount > 0
