import asyncio
import shutil
import subprocess
from decimal import Decimal
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.repositories.clip_repo import ClipRepository
from app.repositories.video_repo import VideoRepository
from app.services.storage_service import StorageService


MAX_CLIP_DURATION = 120  # seconds
FFMPEG_TIMEOUT = 30  # seconds


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

        # Prepare output path
        clip_dir = Path(settings.STORAGE_BASE_PATH) / "clips" / str(clip.clip_id)
        clip_dir.mkdir(parents=True, exist_ok=True)
        output_path = clip_dir / "clip.mp4"

        # Run ffmpeg to extract clip
        try:
            # Re-encode for frame-accurate cuts (-ss before -i for fast seek,
            # then re-encode to cut at exact timestamps, not keyframes)
            cmd = [
                "ffmpeg", "-y",
                "-ss", str(start_time),
                "-i", video.file_path,
                "-t", str(duration),
                "-c:v", "libx264", "-preset", "ultrafast",
                "-c:a", "aac",
                str(output_path),
            ]
            await asyncio.to_thread(
                subprocess.run, cmd, capture_output=True, timeout=FFMPEG_TIMEOUT, check=True
            )
        except Exception:
            # Cleanup on failure
            shutil.rmtree(clip_dir, ignore_errors=True)
            await self.repo.delete(clip)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to generate clip")

        # Generate thumbnail from middle of clip
        thumb_path = clip_dir / "thumbnail.jpg"
        try:
            thumb_cmd = [
                "ffmpeg", "-y",
                "-ss", str(duration / 2),
                "-i", str(output_path),
                "-frames:v", "1",
                "-q:v", "3",
                str(thumb_path),
            ]
            await asyncio.to_thread(
                subprocess.run, thumb_cmd, capture_output=True, timeout=10, check=True
            )
        except Exception:
            pass  # Thumbnail is optional, don't fail clip creation

        # Update clip with file info
        file_size = output_path.stat().st_size
        await self.repo.update(
            clip,
            file_path=str(output_path),
            file_size_bytes=file_size,
        )

        # Update storage quota
        await self.storage_service.update_storage_used(user_id, file_size)

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
            if clip.file_size_bytes:
                total_size += clip.file_size_bytes
        if total_size > 0:
            await self.storage_service.update_storage_used(user_id, -total_size)
