from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subscription import Subscription


class SubscriptionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, subscription_id: UUID) -> Subscription | None:
        result = await self.db.execute(
            select(Subscription).where(Subscription.subscription_id == subscription_id)
        )
        return result.scalar_one_or_none()

    async def get_active_for_user(self, user_id: UUID) -> Subscription | None:
        result = await self.db.execute(
            select(Subscription)
            .where(
                Subscription.user_id == user_id,
                Subscription.status.in_(["active", "grace_period", "billing_retry"]),
            )
            .order_by(Subscription.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_by_original_transaction_id(self, txn_id: str) -> Subscription | None:
        result = await self.db.execute(
            select(Subscription).where(Subscription.original_transaction_id == txn_id)
        )
        return result.scalar_one_or_none()

    async def list_expired(self, before: datetime) -> list[Subscription]:
        result = await self.db.execute(
            select(Subscription).where(
                Subscription.status == "active",
                Subscription.expires_at < before,
            )
        )
        return list(result.scalars().all())

    async def create(self, **kwargs) -> Subscription:
        sub = Subscription(**kwargs)
        self.db.add(sub)
        await self.db.flush()
        return sub

    async def update(self, sub: Subscription, **kwargs) -> Subscription:
        for key, value in kwargs.items():
            setattr(sub, key, value)
        await self.db.flush()
        return sub
