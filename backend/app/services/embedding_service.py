"""Multimodal embeddings: Azure AI Vision (replaces Vertex AI).

Same image/text shared vector space as before, so frames embedded as images can be
retrieved by a text query. The Image Analysis 4.0 multimodal-embeddings REST API
(``vectorizeImage`` / ``vectorizeText``) returns 1024-dim vectors. Auth via managed
identity (Cognitive Services User), so no API keys.
"""

from __future__ import annotations

import asyncio
import logging
import math
import random
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_API_VERSION = "2024-02-01"
_TOKEN_SCOPE = "https://cognitiveservices.azure.com/.default"
_RETRYABLE_STATUSES = {408, 429, 500, 502, 503, 504}


def _retry_delay(response: httpx.Response | None, attempt: int) -> float:
    """Honor Azure's cooldown, with backoff when no usable header is supplied."""
    if response is not None:
        for header, scale in (("retry-after-ms", 0.001), ("x-ms-retry-after-ms", 0.001), ("retry-after", 1)):
            value = response.headers.get(header)
            if value is None:
                continue
            try:
                delay = float(value) * scale
            except ValueError:
                if header != "retry-after":
                    continue
                try:
                    delay = (parsedate_to_datetime(value) - datetime.now(timezone.utc)).total_seconds()
                except (TypeError, ValueError, OverflowError):
                    continue
            if math.isfinite(delay) and delay >= 0:
                return max(0.5, delay) + random.uniform(0, 1)
    base = 5 if response is not None and response.status_code == 429 else 1
    return min(30, base * 2 ** attempt) + random.uniform(0, 1)


class EmbeddingUnavailableError(RuntimeError):
    pass


class EmbeddingService:
    def __init__(self, *, max_retries: int = 2, retry_budget_seconds: float = 10):
        self._credential = None
        self._max_retries = max_retries
        self._retry_budget_seconds = retry_budget_seconds

    def _endpoint(self, operation: str) -> str:
        base = settings.AZURE_VISION_ENDPOINT.rstrip("/")
        return f"{base}/computervision/retrieval:{operation}?api-version={_API_VERSION}&model-version=2023-04-15"

    def _token(self) -> str:
        if self._credential is None:
            from azure.identity import DefaultAzureCredential

            self._credential = DefaultAzureCredential()
        return self._credential.get_token(_TOKEN_SCOPE).token

    async def _post(self, operation: str, json_body: dict | None = None, content: bytes | None = None) -> list[float]:
        if not settings.AZURE_VISION_ENDPOINT:
            raise EmbeddingUnavailableError("Azure AI Vision endpoint is not configured.")
        token = await asyncio.to_thread(self._token)
        headers = {"Authorization": f"Bearer {token}"}
        if content is not None:
            headers["Content-Type"] = "application/octet-stream"
        async with httpx.AsyncClient(timeout=30) as client:
            waited = 0.0
            for attempt in range(self._max_retries + 1):
                resp = None
                try:
                    resp = await client.post(self._endpoint(operation), headers=headers, json=json_body, content=content)
                    resp.raise_for_status()
                    return resp.json()["vector"]
                except httpx.HTTPStatusError as exc:
                    if exc.response.status_code not in _RETRYABLE_STATUSES:
                        raise
                    failure = exc
                except httpx.TransportError as exc:
                    failure = exc

                delay = _retry_delay(resp, attempt)
                if attempt == self._max_retries or waited + delay > self._retry_budget_seconds:
                    reason = "rate limited" if resp is not None and resp.status_code == 429 else "unavailable"
                    raise EmbeddingUnavailableError(
                        f"Azure AI Vision is temporarily {reason}. Please retry processing later."
                    ) from failure
                logger.warning(
                    "Azure Vision %s returned %s; retrying in %.1fs (%d/%d)",
                    operation, resp.status_code if resp is not None else "a network error",
                    delay, attempt + 1, self._max_retries,
                )
                await asyncio.sleep(delay)
                waited += delay

    async def generate_image_embedding(self, image_path: str) -> list[float]:
        with open(image_path, "rb") as fh:
            data = fh.read()
        return await self._post("vectorizeImage", content=data)

    async def generate_text_embedding(self, text: str) -> list[float]:
        return await self._post("vectorizeText", json_body={"text": text})
