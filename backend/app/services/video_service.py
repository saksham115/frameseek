import os
import shutil
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.repositories.vector_db import vector_db
from app.repositories.video_repo import VideoRepository
from app.services.storage_service import StorageService
from app.utils.video_metadata import extract_metadata


class VideoService:
    def __init__(self, db: AsyncSession):
        self.repo = VideoRepository(db)
        self.storage_service = StorageService(db)

    async def upload_video(self, file: UploadFile, user_id: UUID, title: str | None = None, folder_id: UUID | None = None, local_uri: str | None = None, thumbnail_uri: str | None = None) -> dict:
        filename = file.filename or "unknown.mp4"
        file_title = title or os.path.splitext(filename)[0]

        # Check file size
        file.file.seek(0, 2)
        file_size = file.file.tell()
        file.file.seek(0)

        max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        if file_size > max_size:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large")

        # Check storage quota
        quota = await self.storage_service.get_quota(user_id)
        if quota["used_bytes"] + file_size > quota["limit_bytes"]:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Storage limit exceeded. Please delete some videos or upgrade your plan.")

        # Create video record first to get ID
        video = await self.repo.create(
            user_id=user_id,
            title=file_title,
            original_filename=filename,
            file_path="",  # Will update after saving
            file_size_bytes=file_size,
            source_type="local",
            folder_id=folder_id,
            local_uri=local_uri,
            thumbnail_uri=thumbnail_uri,
        )

        # Save file to storage
        video_dir = Path(settings.STORAGE_BASE_PATH) / "videos" / str(user_id) / str(video.video_id)
        video_dir.mkdir(parents=True, exist_ok=True)
        ext = os.path.splitext(filename)[1] or ".mp4"
        file_path = video_dir / f"original{ext}"

        with open(file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        # Extract metadata
        metadata = extract_metadata(str(file_path))

        # Update video record
        await self.repo.update(
            video,
            file_path=str(file_path),
            duration_seconds=metadata.duration_seconds,
            fps=metadata.fps,
            width=metadata.width,
            height=metadata.height,
            codec=metadata.codec,
        )

        # Update storage usage
        await self.storage_service.update_storage_used(user_id, file_size)

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

        # Delete embeddings from Qdrant
        vector_db.delete_by_video_id(str(user_id), str(video_id))

        # Delete frame and job records from DB
        await self.repo.delete_frames(video_id)
        await self.repo.delete_jobs(video_id)

        # Delete files from storage
        if video.file_path:
            video_dir = Path(video.file_path).parent
            if video_dir.exists():
                shutil.rmtree(video_dir, ignore_errors=True)

        # Delete frames directory
        frames_dir = Path(settings.STORAGE_BASE_PATH) / "frames" / str(video_id)
        if frames_dir.exists():
            shutil.rmtree(frames_dir, ignore_errors=True)

        # Update storage usage (subtract file size)
        await self.storage_service.update_storage_used(user_id, -(video.file_size_bytes or 0))

        # Hard-delete video record
        await self.repo.delete(video)

    async def get_frame_count(self, video_id: UUID) -> int:
        return await self.repo.get_frame_count(video_id)

    async def list_frames(self, video_id: UUID, page: int = 1, limit: int = 50):
        return await self.repo.list_frames(video_id, page, limit)
