import math
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import ApiResponse, Pagination
from app.schemas.video import (
    FrameListResponse,
    FrameResponse,
    ProcessRequest,
    VideoDetailResponse,
    VideoListResponse,
    VideoResponse,
    VideoUpdateRequest,
    VideoUploadResponse,
)
from app.services.job_service import JobService
from app.services.video_service import VideoService

router = APIRouter()


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
        videos=[VideoResponse.model_validate(v) for v in videos],
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

    return ApiResponse(data=VideoUploadResponse(video=VideoResponse.model_validate(video), job=job))


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
        video=VideoResponse.model_validate(video),
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
        video=VideoResponse.model_validate(video),
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
