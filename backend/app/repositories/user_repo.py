from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, user_id: UUID) -> User | None:
        result = await self.db.execute(select(User).where(User.user_id == user_id, User.deleted_at.is_(None)))
        return result.scalar_one_or_none()

    async def get_by_email(self, email: str) -> User | None:
        result = await self.db.execute(select(User).where(User.email == email, User.deleted_at.is_(None)))
        return result.scalar_one_or_none()

    async def get_by_google_id(self, google_id: str) -> User | None:
        result = await self.db.execute(select(User).where(User.google_id == google_id, User.deleted_at.is_(None)))
        return result.scalar_one_or_none()

    async def get_deleted_by_google_id(self, google_id: str) -> User | None:
        result = await self.db.execute(select(User).where(User.google_id == google_id, User.deleted_at.is_not(None)))
        return result.scalar_one_or_none()

    async def get_by_apple_id(self, apple_id: str) -> User | None:
        result = await self.db.execute(select(User).where(User.apple_id == apple_id, User.deleted_at.is_(None)))
        return result.scalar_one_or_none()

    async def get_deleted_by_apple_id(self, apple_id: str) -> User | None:
        result = await self.db.execute(select(User).where(User.apple_id == apple_id, User.deleted_at.is_not(None)))
        return result.scalar_one_or_none()

    async def get_deleted_by_email(self, email: str) -> User | None:
        result = await self.db.execute(select(User).where(User.email == email, User.deleted_at.is_not(None)))
        return result.scalar_one_or_none()

    async def create(self, **kwargs) -> User:
        user = User(**kwargs)
        self.db.add(user)
        await self.db.flush()
        return user

    async def update(self, user: User, **kwargs) -> User:
        for key, value in kwargs.items():
            setattr(user, key, value)
        await self.db.flush()
        return user
