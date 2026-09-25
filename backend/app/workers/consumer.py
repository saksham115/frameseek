"""Service Bus consumer — the entrypoint for the worker Container Apps Job.

KEDA scales this job on queue depth. Each run drains available messages: process each,
complete on success, dead-letter on failure (Service Bus max-delivery + dead-lettering is
the stale-job safety net the old pipeline lacked). Then exit so the job replica can stop.

Run: python -m app.workers.consumer
"""

from __future__ import annotations

import asyncio
import json
import logging

from app.config import settings
from app.workers import video_processor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_MAX_IDLE_RECEIVES = 1  # stop after an empty receive so the job replica can exit


async def _handle(body: dict) -> None:
    mtype = body.get("type")
    if mtype == "process_video":
        await video_processor.process_video(body["job_id"])
    elif mtype == "transcribe_video":
        await video_processor.transcribe_video_standalone(body["video_id"])
    else:
        logger.warning("Unknown message type: %s", mtype)


async def run() -> None:
    if not settings.SERVICE_BUS_FQDN:
        logger.error("SERVICE_BUS_FQDN not set; consumer has nothing to connect to")
        return

    from azure.identity.aio import DefaultAzureCredential
    from azure.servicebus.aio import ServiceBusClient

    credential = DefaultAzureCredential()
    processed = 0
    async with ServiceBusClient(settings.SERVICE_BUS_FQDN, credential) as client:
        receiver = client.get_queue_receiver(settings.SERVICE_BUS_QUEUE, max_wait_time=30)
        async with receiver:
            idle = 0
            while idle < _MAX_IDLE_RECEIVES:
                messages = await receiver.receive_messages(max_message_count=1, max_wait_time=30)
                if not messages:
                    idle += 1
                    continue
                idle = 0
                for msg in messages:
                    try:
                        body = json.loads(str(msg))
                        await _handle(body)
                        await receiver.complete_message(msg)
                        processed += 1
                    except Exception:
                        logger.exception("Message processing failed; dead-lettering")
                        await receiver.dead_letter_message(msg, reason="processing_error")
    await credential.close()
    logger.info("Consumer run complete; processed %d message(s)", processed)


if __name__ == "__main__":
    asyncio.run(run())
