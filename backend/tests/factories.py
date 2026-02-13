"""Factory helpers for creating test records directly in the DB."""

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.folder import Folder
from app.models.frame import Frame
from app.models.job import Job
from app.models.search_history import SearchHistory
from app.models.user import User
from app.models.video import Video
from app.utils.security import hash_password


async def create_user(
    db: AsyncSession,
    *,
    email: str | None = None,
    name: str = "Factory User",
    password: str = "testpassword123",
    plan_type: str = "free",
    storage_used_bytes: int = 0,
    daily_search_count: int = 0,
    search_count_reset_at: datetime | None = None,
) -> User:
    user = User(
        email=email or f"user-{uuid.uuid4().hex[:8]}@test.com",
        name=name,
        password_hash=hash_password(password),
        plan_type=plan_type,
        storage_used_bytes=storage_used_bytes,
        daily_search_count=daily_search_count,
        search_count_reset_at=search_count_reset_at,
    )
    db.add(user)
    await db.flush()
    await db.commit()
    return user


async def create_video(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    title: str = "Factory Video",
    status: str = "uploaded",
    file_size_bytes: int = 1024000,
    folder_id: uuid.UUID | None = None,
    source_type: str = "local",
    deleted_at: datetime | None = None,
    duration_seconds: float | None = None,
    frame_count: int | None = None,
) -> Video:
    video = Video(
        user_id=user_id,
        title=title,
        original_filename=f"{title.lower().replace(' ', '_')}.mp4",
        file_path=f"/tmp/fake/{uuid.uuid4().hex}.mp4",
        file_size_bytes=file_size_bytes,
        status=status,
        folder_id=folder_id,
        source_type=source_type,
        deleted_at=deleted_at,
        duration_seconds=Decimal(str(duration_seconds)) if duration_seconds else None,
        frame_count=frame_count,
    )
    db.add(video)
    await db.flush()
    await db.commit()
    return video


async def create_job(
    db: AsyncSession,
    user_id: uuid.UUID,
    video_id: uuid.UUID,
    *,
    status: str = "queued",
    job_type: str = "video_processing",
    progress: int = 0,
    frame_interval_seconds: float = 2.0,
) -> Job:
    job = Job(
        user_id=user_id,
        video_id=video_id,
        job_type=job_type,
        frame_interval_seconds=frame_interval_seconds,
        status=status,
        progress=progress,
    )
    db.add(job)
    await db.flush()
    await db.commit()
    return job


async def create_folder(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    name: str = "Factory Folder",
    path: str | None = None,
    parent_folder_id: uuid.UUID | None = None,
) -> Folder:
    folder = Folder(
        user_id=user_id,
        name=name,
        path=path or f"/{name}",
        parent_folder_id=parent_folder_id,
    )
    db.add(folder)
    await db.flush()
    await db.commit()
    return folder


async def create_frame(
    db: AsyncSession,
    video_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    frame_index: int = 0,
    timestamp_seconds: float = 0.0,
) -> Frame:
    frame = Frame(
        video_id=video_id,
        user_id=user_id,
        frame_index=frame_index,
        timestamp_seconds=Decimal(str(timestamp_seconds)),
        frame_path=f"/tmp/fake/frame_{frame_index}.jpg",
    )
    db.add(frame)
    await db.flush()
    await db.commit()
    return frame


async def create_search_history(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    query: str = "test search query",
    results_count: int = 5,
) -> SearchHistory:
    sh = SearchHistory(
        user_id=user_id,
        query=query,
        results_count=results_count,
    )
    db.add(sh)
    await db.flush()
    await db.commit()
    return sh
