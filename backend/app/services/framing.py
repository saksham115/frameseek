"""Subject-aware framing: where to centre the crop window when a video is reframed to a
different shape (say landscape footage in a 9:16 short).

Azure AI Vision's smart-crop finds the region of interest for a requested aspect ratio.
It only accepts ratios from 0.75 to 1.8, so taller targets (9:16 is 0.56) ask for 0.75 and
use that region's centre: the subject is inside it, and the renderer then cuts the
narrower window around the same centre.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.frame import Frame
from app.services.render.layout import crop_centre_from_box
from app.utils.gcs_client import GCSClient

logger = logging.getLogger(__name__)

_API_VERSION = "2024-02-01"
_TOKEN_SCOPE = "https://cognitiveservices.azure.com/.default"
MIN_RATIO, MAX_RATIO = 0.75, 1.8


class _Token:
    credential = None
    cached = None

    @classmethod
    def get(cls) -> str:
        if cls.cached and cls.cached.expires_on - 300 > datetime.now(timezone.utc).timestamp():
            return cls.cached.token
        if cls.credential is None:
            from azure.identity import DefaultAzureCredential

            cls.credential = DefaultAzureCredential()
        cls.cached = cls.credential.get_token(_TOKEN_SCOPE)
        return cls.cached.token


async def smart_crop_centre(image: bytes, target_aspect: float) -> tuple[float, float] | None:
    """Normalised (x, y) centre of the region of interest, or None if unavailable."""
    if not settings.AZURE_VISION_ENDPOINT:
        return None
    ratio = round(min(MAX_RATIO, max(MIN_RATIO, target_aspect)), 2)
    url = (
        f"{settings.AZURE_VISION_ENDPOINT.rstrip('/')}/computervision/imageanalysis:analyze"
        f"?api-version={_API_VERSION}&features=smartCrops&smartcrops-aspect-ratios={ratio}"
    )
    try:
        token = await asyncio.to_thread(_Token.get)
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(url, content=image, headers={
                "Authorization": f"Bearer {token}", "Content-Type": "application/octet-stream",
            })
            resp.raise_for_status()
            data = resp.json()
        meta = data["metadata"]
        box = data["smartCropsResult"]["values"][0]["boundingBox"]
        return crop_centre_from_box(meta["width"], meta["height"], box["x"], box["y"], box["w"], box["h"])
    except Exception:
        logger.warning("Smart crop failed; keeping centred framing", exc_info=True)
        return None


async def frame_near(db: AsyncSession, user_id, video_id, seconds: float) -> Frame | None:
    """The indexed frame closest to a timestamp in a video."""
    from sqlalchemy import func

    result = await db.execute(
        select(Frame)
        .where(Frame.user_id == user_id, Frame.video_id == video_id)
        .order_by(func.abs(Frame.timestamp_seconds - seconds))
        .limit(1)
    )
    return result.scalar_one_or_none()


async def auto_frame_moment(db: AsyncSession, user_id, moment: dict, target_aspect: float) -> dict | None:
    """A crop for a moment centred on the subject at its midpoint (None if unknown)."""
    mid = (float(moment["start"]) + float(moment["end"])) / 2
    frame = await frame_near(db, user_id, moment["video_id"], mid)
    if not frame or not frame.gcs_path or not GCSClient.is_enabled():
        return None
    try:
        image = await asyncio.to_thread(GCSClient.get().download_bytes, frame.gcs_path)
    except Exception:
        logger.warning("Could not read frame %s for framing", frame.frame_id, exc_info=True)
        return None
    centre = await smart_crop_centre(image, target_aspect)
    if centre is None:
        return None
    return {"x": round(centre[0], 4), "y": round(centre[1], 4), "zoom": 1.0}
