import time
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.models.frame import Frame
from app.models.search_history import SearchHistory
from app.models.transcript import TranscriptSegment
from app.models.user import User
from app.models.video import Video
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

        # Check quota
        quota = await self.get_quota(user_id)
        if quota.remaining <= 0:
            from fastapi import HTTPException, status
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Daily search quota exceeded")

        # 1. Exact text search on transcripts (when audio results are relevant)
        exact_results: list[SearchResultItem] = []
        if request.source_filter in ("all", "audio"):
            exact_results = await self._exact_text_search(
                query=request.query,
                user_id=user_id,
                video_ids=request.video_ids,
                top_k=request.top_k,
            )

        # 2. Semantic search via Qdrant (unchanged)
        query_vector = await self.embedding_service.generate_text_embedding(request.query)

        source_filter_map = {"visual": "local", "audio": "transcript", "all": None}
        source_type_filter = source_filter_map.get(request.source_filter)

        video_id_strs = [str(v) for v in request.video_ids] if request.video_ids else None
        raw_results = vector_db.search(
            user_id=str(user_id),
            query_vector=query_vector,
            top_k=request.top_k,
            video_ids=video_id_strs,
            min_score=request.min_score,
            source_type_filter=source_type_filter,
        )

        # Enrich results with video titles and transcript data
        gcs_enabled = GCSClient.is_enabled()
        semantic_results: list[SearchResultItem] = []
        for r in raw_results:
            video_title = r.payload.get("video_title", "Unknown")
            frame_path = r.payload.get("frame_path", "")
            source_type = r.payload.get("source_type", "local")

            frame_id = r.payload.get("frame_id") or r.frame_id

            # 3. Tag each semantic result with match_type
            match_type = "semantic_audio" if source_type == "transcript" else "semantic_visual"

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

            item = SearchResultItem(
                frame_id=frame_id,
                video_id=r.video_id,
                video_title=video_title,
                timestamp_seconds=r.timestamp,
                formatted_timestamp=format_duration(r.timestamp),
                score=round(r.score, 4),
                frame_url=frame_url,
                thumbnail_url=thumbnail_url,
                source_type=source_type,
                match_type=match_type,
            )

            if source_type == "transcript":
                item.transcript_text = r.payload.get("transcript_text")
                item.segment_start = r.payload.get("segment_start")
                item.segment_end = r.payload.get("segment_end")
                item.segment_id = r.payload.get("segment_id")

            semantic_results.append(item)

        # 4. Merge and deduplicate
        results = self._merge_and_deduplicate(exact_results, semantic_results)

        # 5. Trim to top_k
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

    async def _exact_text_search(
        self,
        query: str,
        user_id: UUID,
        video_ids: list[UUID] | None = None,
        top_k: int = 20,
    ) -> list[SearchResultItem]:
        """Search transcript_segments for exact text matches (case-insensitive)."""
        f = aliased(Frame)
        stmt = (
            select(TranscriptSegment, f.frame_path, f.thumbnail_path, f.gcs_path, Video.title)
            .outerjoin(f, TranscriptSegment.nearest_frame_id == f.frame_id)
            .join(Video, TranscriptSegment.video_id == Video.video_id)
            .where(
                TranscriptSegment.user_id == user_id,
                TranscriptSegment.text.ilike(f"%{query}%"),
            )
            .order_by(TranscriptSegment.start_seconds)
            .limit(top_k)
        )

        if video_ids:
            stmt = stmt.where(TranscriptSegment.video_id.in_(video_ids))

        result = await self.db.execute(stmt)
        rows = result.all()

        gcs_enabled = GCSClient.is_enabled()
        items: list[SearchResultItem] = []
        for seg, frame_path, thumbnail_path, frame_gcs_path, video_title in rows:
            frame_id = seg.nearest_frame_id or seg.segment_id

            # Resolve frame URL — GCS first when enabled
            if frame_gcs_path and gcs_enabled:
                frame_url = GCSClient.get().generate_signed_url(frame_gcs_path)
            elif frame_path:
                frame_url = f"/storage/frames/{frame_path}"
            else:
                frame_url = ""

            # Thumbnail URL — GCS first when enabled
            if frame_gcs_path and gcs_enabled:
                thumb_gcs = frame_gcs_path.replace("frame_", "thumb_")
                thumb_url = GCSClient.get().generate_signed_url(thumb_gcs)
            elif thumbnail_path:
                thumb_url = f"/storage/frames/{thumbnail_path}"
            else:
                thumb_url = None

            items.append(
                SearchResultItem(
                    frame_id=frame_id,
                    video_id=seg.video_id,
                    video_title=video_title or "Unknown",
                    timestamp_seconds=float(seg.start_seconds),
                    formatted_timestamp=format_duration(float(seg.start_seconds)),
                    score=1.0,
                    frame_url=frame_url,
                    thumbnail_url=thumb_url,
                    source_type="transcript",
                    match_type="exact",
                    transcript_text=seg.text,
                    segment_start=float(seg.start_seconds),
                    segment_end=float(seg.end_seconds),
                    segment_id=str(seg.segment_id),
                )
            )
        return items

    @staticmethod
    def _merge_and_deduplicate(
        exact: list[SearchResultItem],
        semantic: list[SearchResultItem],
    ) -> list[SearchResultItem]:
        """Merge exact and semantic results, removing semantic transcript duplicates that overlap exact matches."""
        # Build set of (video_id, start, end) from exact matches for overlap check
        exact_ranges: set[tuple[UUID, float, float]] = set()
        for item in exact:
            if item.segment_start is not None and item.segment_end is not None:
                exact_ranges.add((item.video_id, item.segment_start, item.segment_end))

        # Filter out semantic transcript results that overlap an exact match on the same video
        filtered_semantic: list[SearchResultItem] = []
        for item in semantic:
            if item.source_type == "transcript" and item.segment_start is not None and item.segment_end is not None:
                overlaps = any(
                    item.video_id == vid and item.segment_start < e_end and item.segment_end > e_start
                    for vid, e_start, e_end in exact_ranges
                )
                if overlaps:
                    continue
            filtered_semantic.append(item)

        # Exact matches first, then semantic sorted by score desc
        filtered_semantic.sort(key=lambda x: x.score, reverse=True)
        return exact + filtered_semantic

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
