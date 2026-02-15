import math
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.clip import ClipCreateRequest, ClipListResponse, ClipResponse
from app.schemas.common import ApiResponse, Pagination
from app.services.clip_service import ClipService
from app.utils.gcs_client import GCSClient
from app.utils.url_helpers import resolve_storage_url

router = APIRouter()


def _to_clip_response(clip, video_title: str | None = None) -> ClipResponse:
    resp = ClipResponse.model_validate(clip)
    resp.video_title = video_title

    # Clip URL (signed GCS or local /storage/)
    resp.clip_url = resolve_storage_url(clip.file_path, clip.gcs_path)

    # Thumbnail — GCS first when enabled, local fallback
    if clip.gcs_path and GCSClient.is_enabled():
        resp.thumbnail_url = GCSClient.get().generate_signed_url(
            f"clips/{clip.clip_id}/thumbnail.jpg"
        )
    else:
        thumb_path = Path(settings.STORAGE_BASE_PATH).resolve() / "clips" / str(clip.clip_id) / "thumbnail.jpg"
        if thumb_path.exists():
            resp.thumbnail_url = f"/storage/clips/{clip.clip_id}/thumbnail.jpg"

    return resp


@router.post("", response_model=ApiResponse[ClipResponse])
async def create_clip(
    data: ClipCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = ClipService(db)
    clip, video_title = await service.create_clip(
        user_id=user.user_id,
        video_id=data.video_id,
        title=data.title,
        start_time=data.start_time,
        end_time=data.end_time,
        source_timestamp=data.source_timestamp,
        source_frame_id=data.source_frame_id,
    )
    return ApiResponse(data=_to_clip_response(clip, video_title))


@router.get("", response_model=ApiResponse[ClipListResponse])
async def list_clips(
    video_id: UUID | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = ClipService(db)
    clips, total = await service.list_clips(user.user_id, video_id=video_id, page=page, limit=limit)
    return ApiResponse(data=ClipListResponse(
        clips=[_to_clip_response(c) for c in clips],
        pagination=Pagination(page=page, limit=limit, total=total, total_pages=math.ceil(total / limit) if limit else 0),
    ))


@router.get("/{clip_id}", response_model=ApiResponse[ClipResponse])
async def get_clip(
    clip_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = ClipService(db)
    clip, video_title = await service.get_clip(clip_id, user.user_id)
    return ApiResponse(data=_to_clip_response(clip, video_title))


@router.delete("/{clip_id}")
async def delete_clip(
    clip_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = ClipService(db)
    await service.delete_clip(clip_id, user.user_id)
    return ApiResponse(data={"success": True})
