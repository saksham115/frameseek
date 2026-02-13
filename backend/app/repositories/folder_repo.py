from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.folder import Folder
from app.models.video import Video


class FolderRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, folder_id: UUID, user_id: UUID) -> Folder | None:
        result = await self.db.execute(select(Folder).where(Folder.folder_id == folder_id, Folder.user_id == user_id))
        return result.scalar_one_or_none()

    async def list_folders(self, user_id: UUID, parent_id: UUID | None = None) -> list[Folder]:
        query = select(Folder).where(Folder.user_id == user_id)
        if parent_id:
            query = query.where(Folder.parent_folder_id == parent_id)
        else:
            query = query.where(Folder.parent_folder_id.is_(None))
        query = query.order_by(Folder.name)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def create(self, **kwargs) -> Folder:
        folder = Folder(**kwargs)
        self.db.add(folder)
        await self.db.flush()
        return folder

    async def update(self, folder: Folder, **kwargs) -> Folder:
        for key, value in kwargs.items():
            setattr(folder, key, value)
        await self.db.flush()
        return folder

    async def delete(self, folder: Folder) -> None:
        await self.db.delete(folder)
        await self.db.flush()

    async def get_video_count(self, folder_id: UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(Video).where(Video.folder_id == folder_id, Video.deleted_at.is_(None))
        )
        return result.scalar() or 0
