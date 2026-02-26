import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.database import async_session
from app.models.user import User
from app.models.video import Video
from app.plan_config import get_plan_config
from app.repositories.subscription_repo import SubscriptionRepository
from app.repositories.user_repo import UserRepository
from app.services.video_service import VideoService

logger = logging.getLogger(__name__)


async def cleanup_expired_content():
    """Delete videos past their user's retention period. Run as periodic ARQ cron job."""
    async with async_session() as db:
        result = await db.execute(
            select(User).where(User.deleted_at.is_(None))
        )
        users = result.scalars().all()

        total_deleted = 0
        for user in users:
            retention_days = user.retention_days or 15
            cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)

            result = await db.execute(
                select(Video).where(
                    Video.user_id == user.user_id,
                    Video.created_at < cutoff,
                    Video.deleted_at.is_(None),
                )
            )
            expired_videos = result.scalars().all()

            if expired_videos:
                service = VideoService(db)
                for video in expired_videos:
                    try:
                        await service.delete_video(video.video_id, user.user_id)
                        total_deleted += 1
                    except Exception as e:
                        logger.error(f"Failed to delete expired video {video.video_id}: {e}")

        await db.commit()
        logger.info(f"Retention cleanup: deleted {total_deleted} expired videos")


async def check_expired_subscriptions():
    """Check for subscriptions past their expires_at and downgrade users."""
    async with async_session() as db:
        sub_repo = SubscriptionRepository(db)
        user_repo = UserRepository(db)

        now = datetime.now(timezone.utc)
        expired = await sub_repo.list_expired(now)

        downgraded = 0
        for sub in expired:
            await sub_repo.update(sub, status="expired")
            user = await user_repo.get_by_id(sub.user_id)
            if user and user.plan_type != "free":
                # Check if another subscription is still active
                other_active = await sub_repo.get_active_for_user(sub.user_id)
                if not other_active:
                    free_config = get_plan_config("free")
                    await user_repo.update(
                        user,
                        plan_type="free",
                        storage_limit_bytes=free_config.storage_limit_bytes,
                        monthly_search_limit=free_config.monthly_search_limit,
                        retention_days=free_config.retention_days,
                    )
                    downgraded += 1

        await db.commit()
        if expired:
            logger.info(
                f"Subscription expiry check: {len(expired)} expired, {downgraded} downgraded"
            )
