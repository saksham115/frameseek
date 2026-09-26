from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.user_repo import UserRepository


class StorageService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.user_repo = UserRepository(db)

    async def get_quota(self, user_id: UUID) -> dict:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            return {"used_bytes": 0, "limit_bytes": 0, "used_percentage": 0}

        used = user.storage_used_bytes or 0
        limit = user.storage_limit_bytes or 5368709120
        percentage = round((used / limit) * 100, 2) if limit > 0 else 0
        return {"used_bytes": used, "limit_bytes": limit, "used_percentage": percentage}

    async def update_storage_used(self, user_id: UUID, delta_bytes: int) -> None:
        # Atomic increment: concurrent uploads/deletes can't lose each other's changes
        # (fixes the read-modify-write race).
        await self.db.execute(
            text(
                "UPDATE users SET storage_used_bytes = GREATEST(0, storage_used_bytes + :delta) "
                "WHERE user_id = :uid"
            ),
            {"delta": delta_bytes, "uid": str(user_id)},
        )

    async def try_reserve_storage(self, user_id: UUID, size_bytes: int) -> bool:
        """Atomically reserve quota: increments only if it keeps the user within their limit.
        Returns False (without changing anything) if it would exceed the limit."""
        result = await self.db.execute(
            text(
                "UPDATE users SET storage_used_bytes = storage_used_bytes + :size "
                "WHERE user_id = :uid AND storage_used_bytes + :size <= storage_limit_bytes"
            ),
            {"size": size_bytes, "uid": str(user_id)},
        )
        return result.rowcount > 0
