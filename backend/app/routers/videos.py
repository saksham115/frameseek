import math
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import ApiResponse, Pagination
from app.schemas.video import (
    FrameListResponse,
    FrameResponse,
    ProcessRequest,
    TranscriptResponse,
    TranscriptSegmentResponse,
    VideoDetailResponse,
    VideoListResponse,
    VideoResponse,
    VideoUpdateRequest,
    VideoUploadResponse,
)
from app.services.job_service import JobService
from app.services.video_service import VideoService

router = APIRouter()


def _to_video_response(video) -> VideoResponse:
    """Build VideoResponse with server-side video_url and thumbnail_url."""
    resp = VideoResponse.model_validate(video)

    # Compute server-side video URL from file_path
    if video.file_path:
        try:
            storage_root = Path(settings.STORAGE_BASE_PATH).resolve()
            file_abs = Path(video.file_path).resolve()
            rel = file_abs.relative_to(storage_root)
            resp.video_url = f"/storage/{rel}"
        except (ValueError, RuntimeError):
            pass

    # Compute thumbnail URL: first extracted frame thumbnail
    if video.video_id:
        thumb_path = Path(settings.STORAGE_BASE_PATH).resolve() / "frames" / str(video.video_id) / "thumb_000000.jpg"
        if thumb_path.exists():
            resp.thumbnail_url = f"/storage/frames/{video.video_id}/thumb_000000.jpg"

    return resp


@router.get("", response_model=ApiResponse[VideoListResponse])
async def list_videos(
    folder_id: UUID | None = Query(None),
    status: str | None = Query(None),
    source_type: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    sort: str = Query("created_at"),
    order: str = Query("desc"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = VideoService(db)
    videos, total = await service.list_videos(
        user.user_id, folder_id=folder_id, status=status, source_type=source_type,
        page=page, limit=limit, sort=sort, order=order,
    )
    return ApiResponse(data=VideoListResponse(
        videos=[_to_video_response(v) for v in videos],
        pagination=Pagination(page=page, limit=limit, total=total, total_pages=math.ceil(total / limit) if limit else 0),
    ))


@router.post("", response_model=ApiResponse[VideoUploadResponse])
async def upload_video(
    file: UploadFile = File(...),
    title: str | None = Form(None),
    folder_id: UUID | None = Form(None),
    local_uri: str | None = Form(None),
    thumbnail_uri: str | None = Form(None),
    auto_process: bool = Form(False),
    frame_interval: float = Form(2.0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = VideoService(db)
    video = await service.upload_video(file, user.user_id, title, folder_id, local_uri, thumbnail_uri)

    job = None
    if auto_process:
        job_service = JobService(db)
        job_model = await job_service.create_processing_job(video.video_id, user.user_id, frame_interval)
        from app.schemas.video import JobBriefResponse
        job = JobBriefResponse.model_validate(job_model)

    return ApiResponse(data=VideoUploadResponse(video=_to_video_response(video), job=job))


@router.get("/{video_id}", response_model=ApiResponse[VideoDetailResponse])
async def get_video(
    video_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = VideoService(db)
    video = await service.get_video(video_id, user.user_id)
    frames_count = await service.get_frame_count(video_id)

    # Check for active job
    job_service = JobService(db)
    from app.repositories.job_repo import JobRepository
    repo = JobRepository(db)
    active_job = await repo.get_active_for_video(video_id)
    job_brief = None
    if active_job:
        from app.schemas.video import JobBriefResponse
        job_brief = JobBriefResponse.model_validate(active_job)

    return ApiResponse(data=VideoDetailResponse(
        video=_to_video_response(video),
        frames_count=frames_count,
        job=job_brief,
    ))


@router.patch("/{video_id}", response_model=ApiResponse[VideoDetailResponse])
async def update_video(
    video_id: UUID,
    data: VideoUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = VideoService(db)
    video = await service.get_video(video_id, user.user_id)

    update_fields = data.model_dump(exclude_unset=True)
    if update_fields:
        await service.repo.update(video, **update_fields)

    frames_count = await service.get_frame_count(video_id)
    return ApiResponse(data=VideoDetailResponse(
        video=_to_video_response(video),
        frames_count=frames_count,
    ))


@router.delete("/{video_id}")
async def delete_video(
    video_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = VideoService(db)
    await service.delete_video(video_id, user.user_id)
    return ApiResponse(data={"success": True})


@router.post("/{video_id}/process")
async def process_video(
    video_id: UUID,
    data: ProcessRequest = ProcessRequest(),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = JobService(db)
    job = await service.create_processing_job(video_id, user.user_id, data.frame_interval, data.priority)
    from app.schemas.job import JobResponse
    return ApiResponse(data={"job": JobResponse.model_validate(job)})


@router.post("/{video_id}/retry-transcript")
async def retry_transcript(
    video_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = VideoService(db)
    video = await service.get_video(video_id, user.user_id)

    if video.transcript_status != "failed":
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail=f"Transcript retry only allowed when status is 'failed', current: '{video.transcript_status}'",
        )

    from app.workers.worker import enqueue_transcript_retry
    await enqueue_transcript_retry(str(video_id))

    return ApiResponse(data={"success": True, "message": "Transcript retry enqueued"})


@router.get("/{video_id}/transcript", response_model=ApiResponse[TranscriptResponse])
async def get_transcript(
    video_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = VideoService(db)
    video = await service.get_video(video_id, user.user_id)

    if not video.has_transcript:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="No transcript available for this video")

    from sqlalchemy import select
    from app.models.transcript import TranscriptSegment
    result = await db.execute(
        select(TranscriptSegment)
        .where(TranscriptSegment.video_id == video_id)
        .order_by(TranscriptSegment.segment_index)
    )
    segments = result.scalars().all()

    return ApiResponse(data=TranscriptResponse(
        segments=[TranscriptSegmentResponse.model_validate(s) for s in segments],
        language=video.transcript_language,
        total_segments=len(segments),
    ))


@router.get("/{video_id}/frames", response_model=ApiResponse[FrameListResponse])
async def list_frames(
    video_id: UUID,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = VideoService(db)
    # Verify video belongs to user
    await service.get_video(video_id, user.user_id)

    frames, total = await service.list_frames(video_id, page, limit)
    return ApiResponse(data=FrameListResponse(
        frames=[FrameResponse.model_validate(f) for f in frames],
        pagination=Pagination(page=page, limit=limit, total=total, total_pages=math.ceil(total / limit) if limit else 0),
    ))
