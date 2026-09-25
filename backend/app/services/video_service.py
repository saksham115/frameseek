import asyncio
import os
import shutil
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.repositories.vector_db import vector_db
from app.repositories.video_repo import VideoRepository
from app.services.clip_service import ClipService
from app.services.storage_service import StorageService
from app.utils.gcs_client import GCSClient


class VideoService:
    def __init__(self, db: AsyncSession):
        self.repo = VideoRepository(db)
        self.storage_service = StorageService(db)

    # ------------------------------------------------------------------ direct-to-Blob upload
    async def create_upload_target(
        self,
        user_id: UUID,
        filename: str,
        size_bytes: int,
        content_type: str | None = None,
        folder_id: UUID | None = None,
    ) -> tuple:
        """Create a pending video row and return a short-lived SAS PUT URL so the browser
        uploads straight to Blob (the API never proxies the bytes)."""
        if size_bytes > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large")
        if not GCSClient.is_enabled():
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Storage not configured")

        # Soft pre-check; the authoritative atomic reservation happens at finalize.
        quota = await self.storage_service.get_quota(user_id)
        if quota["used_bytes"] + size_bytes > quota["limit_bytes"]:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Storage limit exceeded. Delete some videos or upgrade your plan.",
            )

        ext = os.path.splitext(filename)[1] or ".mp4"
        title = os.path.splitext(filename)[0]
        video = await self.repo.create(
            user_id=user_id,
            title=title,
            original_filename=filename,
            file_path="",
            file_size_bytes=size_bytes,
            source_type="upload",
            folder_id=folder_id,
            status="uploaded",
        )
        gcs_path = f"videos/{user_id}/{video.video_id}/original{ext}"
        await self.repo.update(video, gcs_path=gcs_path)

        upload_url = await asyncio.to_thread(GCSClient.get().generate_upload_sas, gcs_path)
        return video, upload_url

    async def finalize_upload(self, video_id: UUID, user_id: UUID):
        """Confirm the blob was uploaded, reserve quota atomically, and return the video."""
        video = await self.repo.get_by_id(video_id, user_id)
        if not video:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
        if not video.gcs_path or not await asyncio.to_thread(GCSClient.get().blob_exists, video.gcs_path):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Upload not found in storage")

        actual_size = await asyncio.to_thread(GCSClient.get().get_blob_size, video.gcs_path)
        reserved = await self.storage_service.try_reserve_storage(user_id, actual_size)
        if not reserved:
            await asyncio.to_thread(GCSClient.get().delete_prefix, f"videos/{user_id}/{video_id}/")
            await self.repo.delete(video)
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Storage limit exceeded"
            )

        await self.repo.update(video, file_size_bytes=actual_size, status="uploaded")
        return video

    async def get_video(self, video_id: UUID, user_id: UUID):
        video = await self.repo.get_by_id(video_id, user_id)
        if not video:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
        return video

    async def list_videos(self, user_id: UUID, **kwargs):
        return await self.repo.list_videos(user_id, **kwargs)

    async def delete_video(self, video_id: UUID, user_id: UUID):
        video = await self.repo.get_by_id(video_id, user_id)
        if not video:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

        # Quota is reserved at finalize, which always creates a processing job. An upload that
        # was abandoned before finalize ("uploaded", no job) never reserved anything, so it
        # must not be refunded either.
        reserved_quota = video.status != "uploaded" or await self.repo.has_jobs(video_id)

        clip_service = ClipService(self.repo.db)
        await clip_service.delete_clips_for_video(video_id, user_id)

        vector_db.delete_by_video_id(str(user_id), str(video_id))

        await self.repo.delete_frames(video_id)
        await self.repo.delete_jobs(video_id)

        # Any local temp files (dev mode)
        if video.file_path:
            video_dir = Path(video.file_path).parent
            if video_dir.exists():
                shutil.rmtree(video_dir, ignore_errors=True)
        frames_dir = Path(settings.STORAGE_BASE_PATH) / "frames" / str(video_id)
        if frames_dir.exists():
            shutil.rmtree(frames_dir, ignore_errors=True)

        if GCSClient.is_enabled() and video.gcs_path:
            await asyncio.to_thread(GCSClient.get().delete_prefix, f"videos/{video.user_id}/{video_id}/")
            await asyncio.to_thread(GCSClient.get().delete_prefix, f"frames/{video_id}/")

        if reserved_quota:
            await self.storage_service.update_storage_used(user_id, -(video.file_size_bytes or 0))
        await self.repo.delete(video)

    async def get_frame_count(self, video_id: UUID) -> int:
        return await self.repo.get_frame_count(video_id)

    async def list_frames(self, video_id: UUID, page: int = 1, limit: int = 50):
        return await self.repo.list_frames(video_id, page, limit)
