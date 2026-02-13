from sqlalchemy import func, select
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.frame import Frame
from app.models.job import Job
from app.models.search_history import SearchHistory
from app.models.user import User
from app.models.video import Video
from app.schemas.common import ApiResponse

router = APIRouter()


@router.get("/dashboard")
async def dashboard(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = user.user_id

    # Total videos
    videos_result = await db.execute(
        select(func.count()).select_from(Video).where(Video.user_id == uid, Video.deleted_at.is_(None))
    )
    total_videos = videos_result.scalar() or 0

    # Ready videos
    ready_result = await db.execute(
        select(func.count()).select_from(Video).where(Video.user_id == uid, Video.status == "ready", Video.deleted_at.is_(None))
    )
    ready_videos = ready_result.scalar() or 0

    # Processing videos
    processing_result = await db.execute(
        select(func.count()).select_from(Video).where(
            Video.user_id == uid, Video.status.in_(["queued", "processing"]), Video.deleted_at.is_(None)
        )
    )
    processing_videos = processing_result.scalar() or 0

    # Total frames
    frames_result = await db.execute(
        select(func.count()).select_from(Frame).where(Frame.user_id == uid)
    )
    total_frames = frames_result.scalar() or 0

    # Total searches
    searches_result = await db.execute(
        select(func.count()).select_from(SearchHistory).where(SearchHistory.user_id == uid)
    )
    total_searches = searches_result.scalar() or 0

    # Storage
    storage_used = user.storage_used_bytes or 0
    storage_limit = user.storage_limit_bytes or 5368709120

    return ApiResponse(data={
        "total_videos": total_videos,
        "ready_videos": ready_videos,
        "processing_videos": processing_videos,
        "total_frames": total_frames,
        "total_searches": total_searches,
        "storage_used_bytes": storage_used,
        "storage_limit_bytes": storage_limit,
        "storage_used_percentage": round((storage_used / storage_limit) * 100, 2) if storage_limit else 0,
    })
