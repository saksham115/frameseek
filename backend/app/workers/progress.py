"""Live progress and liveness for the processing pipeline.

The pipeline reports progress from anywhere (including worker threads); a background
task writes it to the database every HEARTBEAT_SECONDS on its own connection. Each write
also refreshes ``videos.updated_at``, so a "processing" video whose updated_at stops
moving belongs to a worker that died (for example, killed at the job's time limit).
``mark_stalled_videos`` turns those into failed videos the user can retry.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session

logger = logging.getLogger(__name__)

HEARTBEAT_SECONDS = 15
# A processing video with no heartbeat for this long has lost its worker.
STALLED_AFTER_SECONDS = 5 * 60
STALLED_MESSAGE = "Processing stopped before it finished. Retry to process this video again."


class VideoDeleted(Exception):
    """The video was deleted while it was being processed."""


class ProgressReporter:
    def __init__(self, job_id: UUID, video_id: UUID):
        self.job_id = job_id
        self.video_id = video_id
        self.progress = 0
        self.step = "starting"
        self.deleted = False
        self._task: asyncio.Task | None = None

    def update(self, progress: float, step: str | None = None) -> None:
        """Record progress (0-100). Safe to call from any thread; raises once the video
        has been deleted, which stops the pipeline wherever it is."""
        if self.deleted:
            raise VideoDeleted()
        # Only ever move forward, so the bar never jumps back between steps.
        self.progress = max(self.progress, max(0, min(100, int(progress))))
        if step:
            self.step = step[:50]

    def stage(self, start: float, end: float, step: str | None = None):
        """A callback mapping a step's own 0..1 fraction onto [start, end]."""
        def report(fraction: float) -> None:
            label = step(fraction) if callable(step) else step
            self.update(start + (end - start) * max(0.0, min(1.0, fraction)), label)
        return report

    async def _beat(self) -> None:
        async with async_session() as db:
            moved = await db.execute(
                text(
                    "UPDATE videos SET processing_progress = :p, updated_at = now() "
                    "WHERE video_id = :v AND status = 'processing'"
                ),
                {"p": self.progress, "v": str(self.video_id)},
            )
            await db.execute(
                text("UPDATE jobs SET progress = :p, current_step = :s WHERE job_id = :j"),
                {"p": self.progress, "s": self.step, "j": str(self.job_id)},
            )
            if moved.rowcount == 0:
                exists = await db.execute(
                    text("SELECT 1 FROM videos WHERE video_id = :v AND deleted_at IS NULL"),
                    {"v": str(self.video_id)},
                )
                if exists.first() is None:
                    self.deleted = True
            await db.commit()

    async def _run(self) -> None:
        while True:
            await asyncio.sleep(HEARTBEAT_SECONDS)
            try:
                await self._beat()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.warning("Progress heartbeat failed for video %s", self.video_id, exc_info=True)

    def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass


async def mark_stalled_videos(db: AsyncSession, user_id: UUID) -> int:
    """Fail this user's videos whose worker stopped sending heartbeats, so they show
    "Needs attention" with a Retry option instead of sitting at the same percentage."""
    result = await db.execute(
        text(
            "UPDATE videos SET status = 'error', processing_progress = 0, error_message = :msg "
            "WHERE user_id = :u AND status = 'processing' AND deleted_at IS NULL "
            "AND updated_at < :cutoff "
            "RETURNING video_id"
        ),
        {
            "u": str(user_id),
            "msg": STALLED_MESSAGE,
            "cutoff": datetime.now(timezone.utc) - timedelta(seconds=STALLED_AFTER_SECONDS),
        },
    )
    stalled = [row[0] for row in result]
    if stalled:
        await db.execute(
            text(
                "UPDATE jobs SET status = 'failed', error_message = :msg, completed_at = now() "
                "WHERE video_id = ANY(:ids) AND status IN ('queued', 'processing')"
            ),
            {"msg": STALLED_MESSAGE, "ids": stalled},
        )
        # The signed-in user's videos are already loaded in this session (User.videos is
        # eager-loaded), so refresh those objects or the request would return stale ones.
        from app.models.job import Job
        from app.models.video import Video

        await db.execute(
            select(Video).where(Video.video_id.in_(stalled)).execution_options(populate_existing=True)
        )
        await db.execute(
            select(Job).where(Job.video_id.in_(stalled)).execution_options(populate_existing=True)
        )
        logger.warning("Marked %d stalled video(s) as failed for user %s", len(stalled), user_id)
    return len(stalled)
