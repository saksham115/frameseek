"""Azure Service Bus — durable job queue that triggers the worker Container Apps Job.

Replaces the ARQ/Redis enqueue. Messages are small JSON envelopes {type, ...ids}. When
SERVICE_BUS_FQDN is unset (local dev), jobs run inline in a background task so the app
still works without a queue.
"""

from __future__ import annotations

import asyncio
import json
import logging

from app.config import settings

logger = logging.getLogger(__name__)


async def _send(body: dict) -> None:
    from azure.identity.aio import DefaultAzureCredential
    from azure.servicebus import ServiceBusMessage
    from azure.servicebus.aio import ServiceBusClient

    credential = DefaultAzureCredential()
    async with ServiceBusClient(settings.SERVICE_BUS_FQDN, credential) as client:
        async with client.get_queue_sender(settings.SERVICE_BUS_QUEUE) as sender:
            await sender.send_messages(ServiceBusMessage(json.dumps(body)))
    await credential.close()


async def _run_inline(body: dict) -> None:
    # Dev fallback: execute the job directly instead of via the queue.
    from app.workers import video_processor

    try:
        if body.get("type") == "process_video":
            await video_processor.process_video(body["job_id"])
        elif body.get("type") == "transcribe_video":
            await video_processor.transcribe_video_standalone(body["video_id"])
    except Exception:
        logger.exception("Inline job failed: %s", body)


async def enqueue(body: dict) -> None:
    if settings.SERVICE_BUS_FQDN:
        await _send(body)
    else:
        logger.info("SERVICE_BUS_FQDN unset — running job inline (dev mode)")
        asyncio.create_task(_run_inline(body))


async def enqueue_process_video(job_id: str) -> None:
    await enqueue({"type": "process_video", "job_id": str(job_id)})


async def enqueue_transcribe_video(video_id: str) -> None:
    await enqueue({"type": "transcribe_video", "video_id": str(video_id)})
