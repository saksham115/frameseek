from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job import Job


class JobRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, job_id: UUID, user_id: UUID) -> Job | None:
        result = await self.db.execute(select(Job).where(Job.job_id == job_id, Job.user_id == user_id))
        return result.scalar_one_or_none()

    async def get_active_for_video(self, video_id: UUID) -> Job | None:
        result = await self.db.execute(
            select(Job).where(Job.video_id == video_id, Job.status.in_(["queued", "processing"])).order_by(Job.created_at.desc())
        )
        return result.scalar_one_or_none()

    async def list_jobs(
        self, user_id: UUID, status: str | None = None, video_id: UUID | None = None,
        page: int = 1, limit: int = 20
    ) -> tuple[list[Job], int]:
        query = select(Job).where(Job.user_id == user_id)
        count_query = select(func.count()).select_from(Job).where(Job.user_id == user_id)

        if status:
            query = query.where(Job.status == status)
            count_query = count_query.where(Job.status == status)
        if video_id:
            query = query.where(Job.video_id == video_id)
            count_query = count_query.where(Job.video_id == video_id)

        query = query.order_by(Job.created_at.desc()).offset((page - 1) * limit).limit(limit)

        result = await self.db.execute(query)
        jobs = list(result.scalars().all())

        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        return jobs, total

    async def create(self, **kwargs) -> Job:
        job = Job(**kwargs)
        self.db.add(job)
        await self.db.flush()
        return job

    async def update(self, job: Job, **kwargs) -> Job:
        for key, value in kwargs.items():
            setattr(job, key, value)
        await self.db.flush()
        return job
