"""Enqueue helpers + scheduled maintenance tasks.

The ARQ worker is gone: processing runs in an event-triggered Container Apps Job
(see app/workers/consumer.py) fed by Service Bus. These wrappers keep the enqueue call
sites (job_service, videos router) unchanged. The cron tasks now run as scheduled
Container Apps Jobs; `python -m app.workers.worker <task>` invokes one.
"""

from __future__ import annotations

import asyncio
import logging
import sys

from app.utils import servicebus
from app.workers.retention_cleanup import check_expired_subscriptions, cleanup_expired_content

logger = logging.getLogger(__name__)


async def enqueue_job(job_id: str) -> None:
    await servicebus.enqueue_process_video(job_id)


async def enqueue_transcript_retry(video_id: str) -> None:
    await servicebus.enqueue_transcribe_video(video_id)


_SCHEDULED = {
    "retention-cleanup": cleanup_expired_content,
    "subscription-expiry": check_expired_subscriptions,
}


def main() -> None:
    task = sys.argv[1] if len(sys.argv) > 1 else ""
    fn = _SCHEDULED.get(task)
    if not fn:
        raise SystemExit(f"Unknown scheduled task '{task}'. Options: {', '.join(_SCHEDULED)}")
    logger.info("Running scheduled task: %s", task)
    asyncio.run(fn())


if __name__ == "__main__":
    main()
