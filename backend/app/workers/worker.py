import logging

from arq import create_pool
from arq.connections import RedisSettings
from arq.cron import cron

from app.config import settings
from app.workers.video_processor import process_video, transcribe_video_standalone
from app.workers.retention_cleanup import cleanup_expired_content, check_expired_subscriptions

logger = logging.getLogger(__name__)


def get_redis_settings() -> RedisSettings:
    """Parse Redis URL into ARQ RedisSettings."""
    url = settings.REDIS_URL
    # redis://localhost:6379
    parts = url.replace("redis://", "").split(":")
    host = parts[0] if parts else "localhost"
    port = int(parts[1]) if len(parts) > 1 else 6379
    return RedisSettings(host=host, port=port)


async def process_video_task(ctx, job_id: str):
    """ARQ task wrapper for video processing."""
    logger.info(f"Starting video processing job: {job_id}")
    await process_video(job_id)
    logger.info(f"Completed video processing job: {job_id}")


async def transcribe_video_task(ctx, video_id: str):
    """ARQ task for re-running transcription + transcript embedding on a video."""
    logger.info(f"Starting transcript retry for video: {video_id}")
    await transcribe_video_standalone(video_id)
    logger.info(f"Completed transcript retry for video: {video_id}")


async def retention_cleanup_task(ctx):
    """ARQ cron task for deleting videos past retention period."""
    logger.info("Starting retention cleanup")
    await cleanup_expired_content()


async def subscription_expiry_task(ctx):
    """ARQ cron task for checking expired subscriptions."""
    logger.info("Starting subscription expiry check")
    await check_expired_subscriptions()


async def enqueue_job(job_id: str):
    """Enqueue a video processing job."""
    redis = await create_pool(get_redis_settings())
    await redis.enqueue_job("process_video_task", job_id)


async def enqueue_transcript_retry(video_id: str):
    """Enqueue a transcript retry job."""
    redis = await create_pool(get_redis_settings())
    await redis.enqueue_job("transcribe_video_task", video_id)


class WorkerSettings:
    """ARQ worker settings."""
    functions = [process_video_task, transcribe_video_task]
    cron_jobs = [
        cron(retention_cleanup_task, hour=3, minute=0),  # Daily at 3 AM UTC
        cron(subscription_expiry_task, hour={0, 6, 12, 18}),  # Every 6 hours
    ]
    redis_settings = get_redis_settings()
    max_jobs = 3
    job_timeout = 3600  # 1 hour
    keep_result = 3600
