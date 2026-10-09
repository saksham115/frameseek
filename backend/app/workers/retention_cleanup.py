import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import String, func, select, update

from app.database import async_session
from app.legal import DELETED_ACCOUNT_GRACE_DAYS, RETENTION_ENFORCED_FROM
from app.models.account_deletion_feedback import AccountDeletionFeedback
from app.models.user import User
from app.models.video import Video
from app.plan_config import get_plan_config
from app.repositories.subscription_repo import SubscriptionRepository
from app.repositories.user_repo import UserRepository
from app.services.video_service import VideoService

logger = logging.getLogger(__name__)


async def cleanup_expired_content():
    """Delete videos past their user's retention period (the daily maintenance job)."""
    async with async_session() as db:
        result = await db.execute(
            select(User).where(User.deleted_at.is_(None))
        )
        users = result.scalars().all()

        total_deleted = 0
        for user in users:
            retention_days = user.retention_days or 15
            cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
            if cutoff < RETENTION_ENFORCED_FROM:
                continue  # Nothing can be past its period yet.

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


async def purge_deleted_accounts():
    """Remove the identity left on accounts deleted more than the grace period ago.

    Account deletion removes the content straight away but keeps the user row, so signing
    back in within the grace period restores the (empty) account. After that the row keeps
    only anonymous usage figures, and the deletion record loses its email.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=DELETED_ACCOUNT_GRACE_DAYS)
    async with async_session() as db:
        users = (await db.execute(
            update(User)
            .where(User.deleted_at < cutoff, ~User.email.like("%@deleted.invalid"))
            .values(
                email=func.concat(User.user_id.cast(String), "@deleted.invalid"),
                name="Deleted user",
                google_id=None, apple_id=None, stripe_customer_id=None,
                google_access_token=None, google_refresh_token=None, google_token_expires_at=None,
                country_code=None, timezone=None,
            )
            .returning(User.user_id)
        )).all()
        records = (await db.execute(
            update(AccountDeletionFeedback)
            .where(AccountDeletionFeedback.created_at < cutoff,
                   ~AccountDeletionFeedback.email.like("%@deleted.invalid"))
            .values(email=func.concat(AccountDeletionFeedback.user_id.cast(String), "@deleted.invalid"))
            .returning(AccountDeletionFeedback.feedback_id)
        )).all()
        await db.commit()
        logger.info(f"Deleted-account purge: anonymised {len(users)} accounts and {len(records)} deletion records")


async def daily_maintenance():
    """Everything the daily scheduled job runs. One task failing doesn't stop the others."""
    failed = []
    for task in (cleanup_expired_content, check_expired_subscriptions, purge_deleted_accounts):
        try:
            await task()
        except Exception:
            logger.exception("Daily maintenance: %s failed", task.__name__)
            failed.append(task.__name__)
    if failed:
        raise RuntimeError(f"Daily maintenance failed: {', '.join(failed)}")
