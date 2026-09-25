"""Multimodal embeddings — Azure AI Vision (replaces Vertex AI).

Same image/text shared vector space as before, so frames embedded as images can be
retrieved by a text query. The Image Analysis 4.0 multimodal-embeddings REST API
(``vectorizeImage`` / ``vectorizeText``) returns 1024-dim vectors. Auth via managed
identity (Cognitive Services User) — no API keys.
"""

from __future__ import annotations

import asyncio
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_API_VERSION = "2024-02-01"
_TOKEN_SCOPE = "https://cognitiveservices.azure.com/.default"


class EmbeddingUnavailableError(RuntimeError):
    pass


class EmbeddingService:
    def __init__(self):
        self._credential = None

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
            resp = await client.post(self._endpoint(operation), headers=headers, json=json_body, content=content)
            resp.raise_for_status()
            return resp.json()["vector"]

    async def generate_image_embedding(self, image_path: str) -> list[float]:
        with open(image_path, "rb") as fh:
            data = fh.read()
        return await self._post("vectorizeImage", content=data)

    async def generate_text_embedding(self, text: str) -> list[float]:
        return await self._post("vectorizeText", json_body={"text": text})
