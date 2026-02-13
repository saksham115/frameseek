from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.frame import Frame
from app.models.job import Job
from app.models.video import Video


class VideoRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, video_id: UUID, user_id: UUID) -> Video | None:
        result = await self.db.execute(
            select(Video).where(Video.video_id == video_id, Video.user_id == user_id, Video.deleted_at.is_(None))
        )
        return result.scalar_one_or_none()

    async def list_videos(
        self, user_id: UUID, folder_id: UUID | None = None, status: str | None = None,
        source_type: str | None = None, page: int = 1, limit: int = 20,
        sort: str = "created_at", order: str = "desc"
    ) -> tuple[list[Video], int]:
        query = select(Video).where(Video.user_id == user_id, Video.deleted_at.is_(None))
        count_query = select(func.count()).select_from(Video).where(Video.user_id == user_id, Video.deleted_at.is_(None))

        if folder_id:
            query = query.where(Video.folder_id == folder_id)
            count_query = count_query.where(Video.folder_id == folder_id)
        if status:
            query = query.where(Video.status == status)
            count_query = count_query.where(Video.status == status)
        if source_type:
            query = query.where(Video.source_type == source_type)
            count_query = count_query.where(Video.source_type == source_type)

        sort_col = getattr(Video, sort, Video.created_at)
        query = query.order_by(sort_col.desc() if order == "desc" else sort_col.asc())
        query = query.offset((page - 1) * limit).limit(limit)

        result = await self.db.execute(query)
        videos = list(result.scalars().all())

        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        return videos, total

    async def create(self, **kwargs) -> Video:
        video = Video(**kwargs)
        self.db.add(video)
        await self.db.flush()
        await self.db.refresh(video)
        return video

    async def update(self, video: Video, **kwargs) -> Video:
        for key, value in kwargs.items():
            setattr(video, key, value)
        await self.db.flush()
        await self.db.refresh(video)
        return video

    async def delete(self, video: Video) -> None:
        await self.db.delete(video)
        await self.db.flush()

    async def delete_frames(self, video_id: UUID) -> None:
        await self.db.execute(delete(Frame).where(Frame.video_id == video_id))
        await self.db.flush()

    async def delete_jobs(self, video_id: UUID) -> None:
        await self.db.execute(delete(Job).where(Job.video_id == video_id))
        await self.db.flush()

    async def get_frame_count(self, video_id: UUID) -> int:
        result = await self.db.execute(select(func.count()).select_from(Frame).where(Frame.video_id == video_id))
        return result.scalar() or 0

    async def list_frames(self, video_id: UUID, page: int = 1, limit: int = 50) -> tuple[list[Frame], int]:
        query = select(Frame).where(Frame.video_id == video_id).order_by(Frame.frame_index).offset((page - 1) * limit).limit(limit)
        result = await self.db.execute(query)
        frames = list(result.scalars().all())

        count_result = await self.db.execute(select(func.count()).select_from(Frame).where(Frame.video_id == video_id))
        total = count_result.scalar() or 0

        return frames, total

    async def create_frame(self, **kwargs) -> Frame:
        frame = Frame(**kwargs)
        self.db.add(frame)
        await self.db.flush()
        return frame
