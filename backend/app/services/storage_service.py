from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.user_repo import UserRepository


class StorageService:
    def __init__(self, db: AsyncSession):
        self.user_repo = UserRepository(db)

    async def get_quota(self, user_id: UUID) -> dict:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            return {"used_bytes": 0, "limit_bytes": 0, "used_percentage": 0}
        used = user.storage_used_bytes or 0
        limit = user.storage_limit_bytes or 5368709120
        percentage = round((used / limit) * 100, 2) if limit > 0 else 0
        return {"used_bytes": used, "limit_bytes": limit, "used_percentage": percentage}

    async def update_storage_used(self, user_id: UUID, delta_bytes: int):
        user = await self.user_repo.get_by_id(user_id)
        if user:
            new_total = max(0, (user.storage_used_bytes or 0) + delta_bytes)
            await self.user_repo.update(user, storage_used_bytes=new_total)
