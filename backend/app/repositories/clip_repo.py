from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.clip import Clip


class ClipRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, **kwargs) -> Clip:
        clip = Clip(**kwargs)
        self.db.add(clip)
        await self.db.flush()
        await self.db.refresh(clip)
        return clip

    async def get_by_id(self, clip_id: UUID, user_id: UUID) -> Clip | None:
        result = await self.db.execute(
            select(Clip).where(Clip.clip_id == clip_id, Clip.user_id == user_id, Clip.deleted_at.is_(None))
        )
        return result.scalar_one_or_none()

    async def list_by_user(self, user_id: UUID, page: int = 1, limit: int = 20) -> tuple[list[Clip], int]:
        query = (
            select(Clip)
            .where(Clip.user_id == user_id, Clip.deleted_at.is_(None))
            .order_by(Clip.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
        result = await self.db.execute(query)
        clips = list(result.scalars().all())

        count_result = await self.db.execute(
            select(func.count()).select_from(Clip).where(Clip.user_id == user_id, Clip.deleted_at.is_(None))
        )
        total = count_result.scalar() or 0

        return clips, total

    async def list_by_video(self, video_id: UUID, user_id: UUID, page: int = 1, limit: int = 20) -> tuple[list[Clip], int]:
        query = (
            select(Clip)
            .where(Clip.video_id == video_id, Clip.user_id == user_id, Clip.deleted_at.is_(None))
            .order_by(Clip.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
        result = await self.db.execute(query)
        clips = list(result.scalars().all())

        count_result = await self.db.execute(
            select(func.count()).select_from(Clip).where(Clip.video_id == video_id, Clip.user_id == user_id, Clip.deleted_at.is_(None))
        )
        total = count_result.scalar() or 0

        return clips, total

    async def update(self, clip: Clip, **kwargs) -> Clip:
        for key, value in kwargs.items():
            setattr(clip, key, value)
        await self.db.flush()
        await self.db.refresh(clip)
        return clip

    async def delete(self, clip: Clip) -> None:
        await self.db.delete(clip)
        await self.db.flush()

    async def delete_by_video(self, video_id: UUID) -> list[Clip]:
        """Return all clips for a video (for file cleanup), then delete them."""
        result = await self.db.execute(
            select(Clip).where(Clip.video_id == video_id, Clip.deleted_at.is_(None))
        )
        clips = list(result.scalars().all())
        if clips:
            await self.db.execute(delete(Clip).where(Clip.video_id == video_id))
            await self.db.flush()
        return clips
