"""Worker job: render a queued creation to MP4 and store it in Blob.

Runs from the Service Bus consumer (``render_creation`` messages). Progress goes to the
``renders`` row through a heartbeat, the same way video processing reports, so the editor
can show live progress and a dead worker is noticed (see CreationService.mark_stalled_renders).
"""

from __future__ import annotations

import asyncio
import logging
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from sqlalchemy import text

from app.database import async_session
from app.services.render.pipeline import RenderError, Renderer, probe, probe_duration
from app.services.storage_service import StorageService
from app.services.template_catalog import caption_styles
from app.utils.gcs_client import GCSClient

logger = logging.getLogger(__name__)

HEARTBEAT_SECONDS = 10


class RenderCancelled(Exception):
    pass


class RenderProgress:
    def __init__(self, render_id: UUID):
        self.render_id = render_id
        self.progress = 0
        self.step = "Starting"
        self.cancelled = False
        self._task: asyncio.Task | None = None

    def update(self, fraction: float, step: str | None = None) -> None:
        if self.cancelled:
            raise RenderCancelled()
        self.progress = max(self.progress, min(99, int(fraction * 100)))
        if step:
            self.step = step[:50]

    def stage(self, start: float, end: float):
        return lambda f, step=None: self.update(start + (end - start) * max(0.0, min(1.0, f)), step)

    async def beat(self) -> None:
        async with async_session() as db:
            result = await db.execute(
                text(
                    "UPDATE renders SET progress = :p, current_step = :s, updated_at = now() "
                    "WHERE render_id = :r AND status = 'rendering'"
                ),
                {"p": self.progress, "s": self.step, "r": str(self.render_id)},
            )
            if result.rowcount == 0:
                self.cancelled = True
            await db.commit()

    async def _run(self) -> None:
        while True:
            await asyncio.sleep(HEARTBEAT_SECONDS)
            try:
                await self.beat()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.warning("Render heartbeat failed for %s", self.render_id, exc_info=True)

    def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass


async def _set(render_id: str, **values) -> int:
    cols = ", ".join(f"{k} = :{k}" for k in values)
    async with async_session() as db:
        result = await db.execute(
            text(f"UPDATE renders SET {cols}, updated_at = now() WHERE render_id = :rid AND status = 'rendering'"),
            {**values, "rid": render_id},
        )
        await db.commit()
        return result.rowcount


async def _fetch(path: str | None, local_fallback: str | None, dest: Path) -> str:
    if path and GCSClient.is_enabled():
        await asyncio.to_thread(GCSClient.get().download_file, path, str(dest))
        return str(dest)
    if local_fallback and Path(local_fallback).exists():
        return local_fallback
    raise RenderError("A video in this creation is no longer available.")


async def _download(url: str, dest: Path) -> str:
    import httpx

    try:
        async with httpx.AsyncClient(timeout=120, follow_redirects=True, headers={"User-Agent": "FrameSeek"}) as http:
            async with http.stream("GET", url) as resp:
                resp.raise_for_status()
                with open(dest, "wb") as fh:
                    async for chunk in resp.aiter_bytes(1 << 16):
                        fh.write(chunk)
    except httpx.HTTPError as exc:
        raise RenderError("The music track couldn't be fetched. Try again, or pick another track.") from exc
    return str(dest)


async def render_creation(render_id: str) -> None:
    async with async_session() as db:
        row = (await db.execute(
            text("SELECT user_id, status, spec FROM renders WHERE render_id = :r"), {"r": render_id}
        )).mappings().first()
        if not row:
            logger.warning("Render %s not found", render_id)
            return
        if row["status"] != "queued":
            logger.info("Render %s is %s; skipping", render_id, row["status"])
            return
        claimed = await db.execute(
            text("UPDATE renders SET status = 'rendering', current_step = 'Starting', updated_at = now() "
                 "WHERE render_id = :r AND status = 'queued'"),
            {"r": render_id},
        )
        await db.commit()
        if claimed.rowcount == 0:
            return
    user_id, spec = row["user_id"], row["spec"]

    reporter = RenderProgress(UUID(render_id))
    reporter.start()
    uploaded_prefix = None
    try:
        with tempfile.TemporaryDirectory(prefix="frameseek-render-") as scratch:
            work = Path(scratch)
            download = reporter.stage(0.0, 0.12)
            sources = {}
            items = list(spec["sources"].items())
            for i, (vid, src) in enumerate(items):
                download(i / max(1, len(items)), "Fetching your videos")
                suffix = Path(src.get("gcs_path") or src.get("file_path") or "x.mp4").suffix or ".mp4"
                path = await _fetch(src.get("gcs_path"), src.get("file_path"), work / f"src_{i}{suffix}")
                sources[vid] = await asyncio.to_thread(probe, path)

            logo_path = music_path = None
            if spec.get("logo"):
                logo_path = await _fetch(spec["logo"]["blob_path"], None, work / ("logo" + Path(spec["logo"]["blob_path"]).suffix))
            if spec.get("music"):
                music = spec["music"]
                if music.get("blob_path"):
                    music_path = await _fetch(music["blob_path"], None, work / ("music" + Path(music["blob_path"]).suffix))
                else:
                    # A library track not copied to Blob yet: fetch it from its source.
                    music_path = await _download(music["source_url"], work / "music.mp3")
                if await asyncio.to_thread(probe_duration, music_path) <= 0:
                    raise RenderError("The music file couldn't be read. Try a different MP3, WAV or M4A.")

            recipe = spec["recipe"]
            style_name = (spec["settings"].get("captions") or {}).get("style") or (recipe.get("captions") or {}).get("style", "clean")
            style = caption_styles().get(style_name) or caption_styles()["clean"]
            renderer = Renderer(spec, sources, work, music_path=music_path, logo_path=logo_path,
                                progress=reporter.stage(0.12, 0.92))
            output = await asyncio.to_thread(renderer.run, style, bool(spec.get("watermark")))
            thumb = await asyncio.to_thread(renderer.thumbnail, output)
            reporter.update(0.93, "Saving")

            size = output.stat().st_size
            duration = await asyncio.to_thread(probe_duration, str(output))
            prefix = f"clips/renders/{user_id}/{render_id}/"
            output_path = thumb_path = None
            if GCSClient.is_enabled():
                uploaded_prefix = prefix
                client = GCSClient.get()
                output_path = prefix + "output.mp4"
                await asyncio.to_thread(client.upload_file, output, output_path, content_type="video/mp4")
                if thumb:
                    thumb_path = prefix + "thumbnail.jpg"
                    await asyncio.to_thread(client.upload_file, thumb, thumb_path, content_type="image/jpeg")
            else:
                logger.warning("Blob storage is off; render %s output is not kept", render_id)

            async with async_session() as db:
                if not await StorageService(db).try_reserve_storage(user_id, size):
                    raise RenderError("Your storage is full. Delete a video or creation, then render again.")
                saved = await db.execute(
                    text(
                        "UPDATE renders SET status = 'ready', progress = 100, current_step = 'Done', "
                        "size_bytes = :size, duration_seconds = :dur, output_path = :out, thumbnail_path = :thumb, "
                        "completed_at = :now, updated_at = now() WHERE render_id = :r AND status = 'rendering'"
                    ),
                    {"size": size, "dur": duration, "out": output_path, "thumb": thumb_path,
                     "now": datetime.now(timezone.utc), "r": render_id},
                )
                if saved.rowcount == 0:
                    await db.rollback()
                    raise RenderCancelled()
                await db.commit()
            uploaded_prefix = None
            logger.info("Render %s ready: %.1fs, %d bytes", render_id, duration, size)
    except RenderCancelled:
        logger.info("Render %s was cancelled", render_id)
    except RenderError as exc:
        logger.warning("Render %s failed: %s", render_id, exc)
        await _set(render_id, status="failed", error_message=str(exc), completed_at=datetime.now(timezone.utc))
    except Exception:
        logger.exception("Render %s failed", render_id)
        await _set(render_id, status="failed", error_message="Rendering failed. Please try again.",
                   completed_at=datetime.now(timezone.utc))
    finally:
        await reporter.stop()
        if uploaded_prefix:
            try:
                await asyncio.to_thread(GCSClient.get().delete_prefix, uploaded_prefix)
            except Exception:
                logger.exception("Could not clean up render files %s", uploaded_prefix)
