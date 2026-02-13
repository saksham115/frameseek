from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.job_repo import JobRepository
from app.repositories.video_repo import VideoRepository


class JobService:
    def __init__(self, db: AsyncSession):
        self.job_repo = JobRepository(db)
        self.video_repo = VideoRepository(db)

    async def create_processing_job(self, video_id: UUID, user_id: UUID, frame_interval: float = 2.0, priority: int = 5):
        video = await self.video_repo.get_by_id(video_id, user_id)
        if not video:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

        if video.status in ("processing", "queued"):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Video is already being processed")

        # Check for existing active jobs
        active_job = await self.job_repo.get_active_for_video(video_id)
        if active_job:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Active job already exists for this video")

        # Create job
        job = await self.job_repo.create(
            user_id=user_id,
            video_id=video_id,
            job_type="video_processing",
            frame_interval_seconds=frame_interval,
            priority=priority,
            status="queued",
        )

        # Update video status
        await self.video_repo.update(video, status="queued")

        # Enqueue to ARQ
        try:
            from app.workers.worker import enqueue_job
            await enqueue_job(str(job.job_id))
        except Exception:
            pass  # Worker may not be running in dev

        return job

    async def get_job(self, job_id: UUID, user_id: UUID):
        job = await self.job_repo.get_by_id(job_id, user_id)
        if not job:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
        return job

    async def list_jobs(self, user_id: UUID, **kwargs):
        return await self.job_repo.list_jobs(user_id, **kwargs)

    async def cancel_job(self, job_id: UUID, user_id: UUID):
        job = await self.job_repo.get_by_id(job_id, user_id)
        if not job:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

        if job.status not in ("queued", "processing"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Job cannot be cancelled")

        await self.job_repo.update(job, status="cancelled", completed_at=datetime.now(timezone.utc))

        # Also revert video status
        video = await self.video_repo.get_by_id(job.video_id, user_id)
        if video and video.status in ("queued", "processing"):
            await self.video_repo.update(video, status="uploaded")

        return job
