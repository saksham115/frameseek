"""Shots: runs of consecutive frames that look alike, derived from frame embeddings.

A video is sampled every couple of seconds and each sample gets an image embedding. Two
neighbouring samples from the same shot embed almost identically; across a cut the
similarity drops. Walking the samples in time order and starting a new shot at each drop
turns hundreds of near-duplicate frames into a handful of shots — the unit people actually
think in when they browse footage or cut a clip.

Nothing is stored: shots are recomputed from pgvector on demand (one windowed query per
request), so they work for every already-processed video and follow any threshold change.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Cosine similarity between neighbouring samples below which a new shot starts.
# Tuned on 2 s samples (Azure AI Vision embeddings) of live-action and animated footage:
# frames within one continuous shot, including handheld and tracking shots, scored
# 0.90-0.99; a cut to another angle of the same scene 0.80-0.87; a hard cut below 0.78.
# The known miss is a rack focus inside one shot (~0.81-0.87), which splits it in two.
SHOT_SIMILARITY_THRESHOLD = 0.88


@dataclass
class ShotFrame:
    frame_id: str
    video_id: str
    frame_index: int
    timestamp_seconds: float
    gcs_path: str | None
    frame_path: str | None
    similarity_to_previous: float | None


@dataclass
class Shot:
    index: int
    start_seconds: float
    end_seconds: float
    frames: list[ShotFrame] = field(default_factory=list)

    @property
    def frame_count(self) -> int:
        return len(self.frames)

    @property
    def representative(self) -> ShotFrame:
        # The middle sample is least likely to be a transition or motion-blurred edge.
        return self.frames[len(self.frames) // 2]


def group_into_shots(
    frames: list[ShotFrame],
    duration_seconds: float | None = None,
    threshold: float = SHOT_SIMILARITY_THRESHOLD,
) -> list[Shot]:
    """Split time-ordered samples into shots.

    A sample starts a new shot when its similarity to the previous sample is below
    ``threshold`` or unknown (no embedding). The cut itself happened somewhere between two
    samples, so shot boundaries sit halfway between them; the first shot starts at 0 and
    the last ends at the video's duration.
    """
    runs: list[list[ShotFrame]] = []
    for f in frames:
        sim = f.similarity_to_previous
        if not runs or sim is None or sim < threshold:
            runs.append([f])
        else:
            runs[-1].append(f)

    shots: list[Shot] = []
    for i, run in enumerate(runs):
        start = 0.0 if i == 0 else (runs[i - 1][-1].timestamp_seconds + run[0].timestamp_seconds) / 2
        if i + 1 < len(runs):
            end = (run[-1].timestamp_seconds + runs[i + 1][0].timestamp_seconds) / 2
        else:
            end = max(duration_seconds or 0.0, run[-1].timestamp_seconds)
        shots.append(Shot(index=i, start_seconds=round(start, 3), end_seconds=round(end, 3), frames=run))
    return shots


def shot_at(shots: list[Shot], timestamp: float) -> Shot | None:
    for s in shots:
        if s.start_seconds <= timestamp < s.end_seconds:
            return s
    return shots[-1] if shots and timestamp >= shots[-1].start_seconds else None


_FRAMES_WITH_SIMILARITY = """
    SELECT f.frame_id::text AS frame_id, f.video_id::text AS video_id, f.frame_index,
           f.timestamp_seconds, f.gcs_path, f.frame_path,
           1 - (e.embedding <=> LAG(e.embedding) OVER w) AS similarity_to_previous
    FROM frames f
    LEFT JOIN frame_embeddings e ON e.id = f.frame_id::text AND e.source_type = 'local'
    WHERE f.user_id = :user_id AND f.video_id = ANY(CAST(:video_ids AS uuid[]))
    WINDOW w AS (PARTITION BY f.video_id ORDER BY f.timestamp_seconds, f.frame_index)
    ORDER BY f.video_id, f.timestamp_seconds, f.frame_index
"""

# Before the first embedding is ever written the vector table doesn't exist yet; every
# frame is then its own shot.
_FRAMES_ONLY = """
    SELECT f.frame_id::text AS frame_id, f.video_id::text AS video_id, f.frame_index,
           f.timestamp_seconds, f.gcs_path, f.frame_path, NULL AS similarity_to_previous
    FROM frames f
    WHERE f.user_id = :user_id AND f.video_id = ANY(CAST(:video_ids AS uuid[]))
    ORDER BY f.video_id, f.timestamp_seconds, f.frame_index
"""


class ShotService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def shots_for_videos(
        self, user_id: UUID, video_ids: list[str], durations: dict[str, float | None] | None = None
    ) -> dict[str, list[Shot]]:
        if not video_ids:
            return {}
        has_vectors = (
            await self.db.execute(text("SELECT to_regclass('frame_embeddings') IS NOT NULL"))
        ).scalar()
        rows = (
            await self.db.execute(
                text(_FRAMES_WITH_SIMILARITY if has_vectors else _FRAMES_ONLY),
                {"user_id": str(user_id), "video_ids": [str(v) for v in video_ids]},
            )
        ).mappings().all()

        by_video: dict[str, list[ShotFrame]] = {}
        for r in rows:
            sim = r["similarity_to_previous"]
            by_video.setdefault(r["video_id"], []).append(
                ShotFrame(
                    frame_id=r["frame_id"],
                    video_id=r["video_id"],
                    frame_index=r["frame_index"],
                    timestamp_seconds=float(r["timestamp_seconds"]),
                    gcs_path=r["gcs_path"],
                    frame_path=r["frame_path"],
                    similarity_to_previous=float(sim) if sim is not None else None,
                )
            )
        durations = durations or {}
        return {
            vid: group_into_shots(frames, durations.get(vid))
            for vid, frames in by_video.items()
        }
