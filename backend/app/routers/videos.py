import math
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

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
)
from app.services.job_service import JobService
from app.services.video_service import VideoService
from app.utils.gcs_client import GCSClient
from app.utils.url_helpers import resolve_storage_url

router = APIRouter()


class UploadUrlRequest(BaseModel):
    filename: str
    size_bytes: int
    content_type: str | None = None
    folder_id: UUID | None = None


def _to_video_response(video) -> VideoResponse:
    """Build VideoResponse with server-side, short-lived signed URLs (Blob SAS only)."""
    resp = VideoResponse.model_validate(video)
    resp.video_url = resolve_storage_url(video.file_path, video.gcs_path)
    if video.video_id and video.gcs_path and GCSClient.is_enabled():
        try:
            resp.thumbnail_url = GCSClient.get().generate_signed_url(
                f"frames/{video.video_id}/thumb_000000.jpg"
            )
        except Exception:
            resp.thumbnail_url = None
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
    q: str | None = Query(None, max_length=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = VideoService(db)
    videos, total = await service.list_videos(
        user.user_id, folder_id=folder_id, status=status, source_type=source_type,
        page=page, limit=limit, sort=sort, order=order, q=q,
    )
    return ApiResponse(data=VideoListResponse(
        videos=[_to_video_response(v) for v in videos],
        pagination=Pagination(page=page, limit=limit, total=total, total_pages=math.ceil(total / limit) if limit else 0),
    ))


@router.post("/upload-url")
async def create_upload_url(
    body: UploadUrlRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Step 1 of upload: get a video id + a short-lived SAS PUT URL for direct-to-Blob upload."""
    service = VideoService(db)
    video, upload_url = await service.create_upload_target(
        user.user_id, body.filename, body.size_bytes, body.content_type, body.folder_id
    )
    return ApiResponse(data={"video_id": str(video.video_id), "upload_url": upload_url})


@router.post("/{video_id}/finalize", response_model=ApiResponse[VideoResponse])
async def finalize_upload(
    video_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Step 2 of upload: confirm the blob, reserve quota, and start processing."""
    service = VideoService(db)
    video = await service.finalize_upload(video_id, user.user_id)
    await JobService(db).create_processing_job(video_id, user.user_id)
    return ApiResponse(data=_to_video_response(video))


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
    if update_fields.get("folder_id") is not None:
        from fastapi import HTTPException
        from app.repositories.folder_repo import FolderRepository
        if not await FolderRepository(db).get_by_id(update_fields["folder_id"], user.user_id):
            raise HTTPException(status_code=404, detail="Folder not found")
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
    responses = []
    for frame in frames:
        response = FrameResponse.model_validate(frame)
        response.frame_url = resolve_storage_url(frame.frame_path, frame.gcs_path)
        thumbnail_blob = frame.gcs_path.replace("/frame_", "/thumb_") if frame.gcs_path else None
        response.thumbnail_url = resolve_storage_url(frame.thumbnail_path, thumbnail_blob)
        responses.append(response)
    return ApiResponse(data=FrameListResponse(
        frames=responses,
        pagination=Pagination(page=page, limit=limit, total=total, total_pages=math.ceil(total / limit) if limit else 0),
    ))
