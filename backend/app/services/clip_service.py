import asyncio
import logging
import shutil
import subprocess
import tempfile
from decimal import Decimal
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.repositories.clip_repo import ClipRepository
from app.repositories.video_repo import VideoRepository
from app.services.storage_service import StorageService
from app.utils.gcs_client import GCSClient


MAX_CLIP_DURATION = 120  # seconds
FFMPEG_TIMEOUT = 90  # seconds


logger = logging.getLogger(__name__)


class ClipService:
    def __init__(self, db: AsyncSession):
        self.repo = ClipRepository(db)
        self.video_repo = VideoRepository(db)
        self.storage_service = StorageService(db)

    async def create_clip(self, user_id: UUID, video_id: UUID, title: str, start_time: float, end_time: float, source_timestamp: float | None = None, source_frame_id: UUID | None = None):
        # Validate video ownership and status
        video = await self.video_repo.get_by_id(video_id, user_id)
        if not video:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
        if video.status != "ready":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Video must be processed before creating clips")

        # Validate time range
        if end_time <= start_time:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="end_time must be greater than start_time")
        duration = end_time - start_time
        if duration > MAX_CLIP_DURATION:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Clip duration cannot exceed {MAX_CLIP_DURATION} seconds")
        if video.duration_seconds and end_time > float(video.duration_seconds):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="end_time exceeds video duration")

        # Create clip record
        clip = await self.repo.create(
            user_id=user_id,
            video_id=video_id,
            title=title,
            start_time=Decimal(str(start_time)),
            end_time=Decimal(str(end_time)),
            duration_seconds=Decimal(str(round(duration, 2))),
            source_timestamp=Decimal(str(source_timestamp)) if source_timestamp is not None else None,
            source_frame_id=source_frame_id,
        )

        # Rendering stays in scratch storage; the exported object is durable in Blob.
        uploaded_path = None
        try:
            with tempfile.TemporaryDirectory(prefix="frameseek-clip-") as scratch:
                workdir = Path(scratch)
                video_path = video.file_path
                if not video_path or not Path(video_path).exists():
                    if not GCSClient.is_enabled() or not video.gcs_path:
                        raise HTTPException(status_code=404, detail="Video file not available")
                    video_path = str(workdir / ("source" + (Path(video.gcs_path).suffix or ".mp4")))
                    await asyncio.to_thread(GCSClient.get().download_file, video.gcs_path, video_path)

                output_path = workdir / "clip.mp4"
                cmd = [
                    "ffmpeg", "-y", "-ss", str(start_time), "-i", video_path,
                    "-t", str(duration), "-map", "0:v:0", "-map", "0:a:0?",
                    "-c:v", "libx264", "-preset", "ultrafast", "-threads", "2",
                    "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-movflags", "+faststart", str(output_path),
                ]
                await asyncio.to_thread(subprocess.run, cmd, capture_output=True, timeout=FFMPEG_TIMEOUT, check=True)
                file_size = output_path.stat().st_size
                if not await self.storage_service.try_reserve_storage(user_id, file_size):
                    raise HTTPException(status_code=403, detail="Not enough storage for this clip. Delete a saved clip or video and try again.")

                thumb_path = workdir / "thumbnail.jpg"
                try:
                    await asyncio.to_thread(subprocess.run, [
                        "ffmpeg", "-y", "-ss", str(duration / 2), "-i", str(output_path),
                        "-frames:v", "1", "-q:v", "3", str(thumb_path),
                    ], capture_output=True, timeout=10, check=True)
                except (subprocess.SubprocessError, OSError):
                    logger.info("Optional thumbnail failed for clip %s", clip.clip_id)

                if GCSClient.is_enabled():
                    storage = GCSClient.get()
                    uploaded_path = f"clips/{clip.clip_id}/clip.mp4"
                    await asyncio.to_thread(storage.upload_file, output_path, uploaded_path, content_type="video/mp4")
                    if thumb_path.exists():
                        await asyncio.to_thread(storage.upload_file, thumb_path, f"clips/{clip.clip_id}/thumbnail.jpg", content_type="image/jpeg")
                    await self.repo.update(clip, file_path=None, file_size_bytes=file_size, gcs_path=uploaded_path)
                else:
                    # Preserve compatibility for development without object storage.
                    clip_dir = settings.storage_path / "clips" / str(clip.clip_id)
                    await asyncio.to_thread(shutil.copytree, workdir, clip_dir, ignore=shutil.ignore_patterns("source*"))
                    await self.repo.update(clip, file_path=str(clip_dir / "clip.mp4"), file_size_bytes=file_size)
        except Exception as exc:
            if uploaded_path:
                try:
                    await asyncio.to_thread(GCSClient.get().delete_prefix, f"clips/{clip.clip_id}/")
                except Exception:
                    logger.exception("Could not clean up failed clip upload %s", clip.clip_id)
            # The request transaction rolls back the clip and any quota reservation.
            if isinstance(exc, HTTPException):
                raise
            logger.exception("Clip rendering failed for %s", clip.clip_id)
            if isinstance(exc, subprocess.TimeoutExpired):
                raise HTTPException(status_code=504, detail="This clip took too long to render. Try a shorter selection.") from exc
            raise HTTPException(status_code=503, detail="Could not export this clip. Your selection is unchanged; please try again.") from exc

        return clip, video.title

    async def get_clip(self, clip_id: UUID, user_id: UUID):
        clip = await self.repo.get_by_id(clip_id, user_id)
        if not clip:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found")
        # Get video title
        video = await self.video_repo.get_by_id(clip.video_id, user_id)
        video_title = video.title if video else None
        return clip, video_title

    async def list_clips(self, user_id: UUID, video_id: UUID | None = None, page: int = 1, limit: int = 20):
        if video_id:
            return await self.repo.list_by_video(video_id, user_id, page, limit)
        return await self.repo.list_by_user(user_id, page, limit)

    async def delete_clip(self, clip_id: UUID, user_id: UUID):
        clip = await self.repo.get_by_id(clip_id, user_id)
        if not clip:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found")

        # Delete file
        if clip.file_path:
            clip_dir = Path(clip.file_path).parent
            if clip_dir.exists():
                shutil.rmtree(clip_dir, ignore_errors=True)

        # Delete from GCS
        if GCSClient.is_enabled() and clip.gcs_path:
            await asyncio.to_thread(GCSClient.get().delete_prefix, f"clips/{clip_id}/")

        # Update storage quota
        if clip.file_size_bytes:
            await self.storage_service.update_storage_used(user_id, -clip.file_size_bytes)

        await self.repo.delete(clip)

    async def delete_clips_for_video(self, video_id: UUID, user_id: UUID):
        """Delete all clips for a video and their files. Used during video deletion."""
        clips = await self.repo.delete_by_video(video_id)
        total_size = 0
        for clip in clips:
            if clip.file_path:
                clip_dir = Path(clip.file_path).parent
                if clip_dir.exists():
                    shutil.rmtree(clip_dir, ignore_errors=True)
            if GCSClient.is_enabled() and clip.gcs_path:
                GCSClient.get().delete_prefix(f"clips/{clip.clip_id}/")
            if clip.file_size_bytes:
                total_size += clip.file_size_bytes
        if total_size > 0:
            await self.storage_service.update_storage_used(user_id, -total_size)
