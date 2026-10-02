"""The stock music library: public-domain (CC0) tracks users can put under their creations.

The track list ships with the app (``app/assets/music/library.json``); the audio lives in
Blob under ``clips/library/music/``. ``sync`` copies any missing track from its source after
each deploy (run by the migrate job). Until a track has been copied, previews and renders
fall back to the source URL, so a slow or failed sync never breaks the library.
"""

from __future__ import annotations

import asyncio
import json
import logging
import tempfile
import time
from functools import lru_cache
from pathlib import Path

import httpx

from app.utils.gcs_client import GCSClient

logger = logging.getLogger(__name__)

LIBRARY_PATH = Path(__file__).resolve().parent.parent / "assets" / "music" / "library.json"
BLOB_PREFIX = "clips/library/music/"
# Remember which tracks are in Blob for a while, so listing the library is cheap.
_PRESENCE_TTL = 600
_presence: dict[str, tuple[bool, float]] = {}


@lru_cache(maxsize=1)
def load_library() -> dict:
    with open(LIBRARY_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def tracks() -> list[dict]:
    return load_library()["tracks"]


def get_track(track_id: str) -> dict | None:
    return next((t for t in tracks() if t["id"] == track_id), None)


def blob_path(track: dict) -> str:
    return f"{BLOB_PREFIX}{track['id']}.mp3"


def _in_blob(track: dict) -> bool:
    if not GCSClient.is_enabled():
        return False
    cached = _presence.get(track["id"])
    if cached and time.monotonic() - cached[1] < _PRESENCE_TTL:
        return cached[0]
    try:
        present = GCSClient.get().blob_exists(blob_path(track))
    except Exception:
        logger.warning("Could not check library track %s", track["id"], exc_info=True)
        present = False
    _presence[track["id"]] = (present, time.monotonic())
    return present


def playable_url(track: dict) -> str:
    """A URL the browser can play: our copy when it's there, else the source."""
    if _in_blob(track):
        try:
            return GCSClient.get().generate_signed_url(blob_path(track))
        except Exception:
            logger.warning("Could not sign library track %s", track["id"], exc_info=True)
    return track["source_url"]


def render_source(track: dict) -> dict:
    """Where the render worker gets the audio from."""
    return {"blob_path": blob_path(track) if _in_blob(track) else None, "source_url": track["source_url"]}


async def sync(time_budget_seconds: float = 420) -> None:
    """Copy library tracks missing from Blob. Best effort and time-bounded: anything not
    copied this time is copied after the next deploy, and the source covers the gap."""
    if not GCSClient.is_enabled():
        logger.info("Blob storage is off; skipping music library sync")
        return
    client = GCSClient.get()
    started = time.monotonic()
    copied = skipped = failed = 0
    async with httpx.AsyncClient(timeout=120, follow_redirects=True, headers={"User-Agent": "FrameSeek"}) as http:
        for track in tracks():
            if time.monotonic() - started > time_budget_seconds:
                logger.info("Music sync stopped at its time budget; the rest copies next deploy")
                break
            path = blob_path(track)
            try:
                if await asyncio.to_thread(client.blob_exists, path):
                    skipped += 1
                    continue
                with tempfile.NamedTemporaryFile(suffix=".mp3") as tmp:
                    async with http.stream("GET", track["source_url"]) as resp:
                        resp.raise_for_status()
                        async for chunk in resp.aiter_bytes(1 << 16):
                            tmp.write(chunk)
                    tmp.flush()
                    if Path(tmp.name).stat().st_size < 50_000:
                        raise ValueError("download too small to be the track")
                    await asyncio.to_thread(client.upload_file, tmp.name, path, content_type="audio/mpeg")
                copied += 1
            except Exception:
                failed += 1
                logger.warning("Could not copy library track %s", track["id"], exc_info=True)
    logger.info("Music library sync: %d copied, %d already there, %d failed", copied, skipped, failed)
