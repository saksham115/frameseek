import asyncio
import json
import math
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import ApiResponse, Pagination
from app.schemas.job import JobListResponse, JobResponse
from app.services.job_service import JobService

router = APIRouter()


@router.get("", response_model=ApiResponse[JobListResponse])
async def list_jobs(
    status: str | None = Query(None),
    video_id: UUID | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = JobService(db)
    jobs, total = await service.list_jobs(user.user_id, status=status, video_id=video_id, page=page, limit=limit)

    job_responses = []
    for j in jobs:
        jr = JobResponse.model_validate(j)
        jr.video_title = j.video.title if j.video else None
        job_responses.append(jr)

    return ApiResponse(data=JobListResponse(
        jobs=job_responses,
        pagination=Pagination(page=page, limit=limit, total=total, total_pages=math.ceil(total / limit) if limit else 0),
    ))


@router.get("/{job_id}", response_model=ApiResponse[JobResponse])
async def get_job(
    job_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = JobService(db)
    job = await service.get_job(job_id, user.user_id)
    resp = JobResponse.model_validate(job)
    resp.video_title = job.video.title if job.video else None
    return ApiResponse(data=resp)


@router.post("/{job_id}/cancel")
async def cancel_job(
    job_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = JobService(db)
    job = await service.cancel_job(job_id, user.user_id)
    return ApiResponse(data={"success": True, "job": JobResponse.model_validate(job)})


@router.get("/{job_id}/progress")
async def job_progress_sse(
    job_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Server-Sent Events stream for job progress."""
    service = JobService(db)
    job = await service.get_job(job_id, user.user_id)

    async def event_stream():
        from app.database import async_session
        from app.models.job import Job
        from sqlalchemy import select

        while True:
            async with async_session() as session:
                result = await session.execute(select(Job).where(Job.job_id == job_id))
                current_job = result.scalar_one_or_none()
                if not current_job:
                    break

                data = json.dumps({
                    "progress": current_job.progress,
                    "current_step": current_job.current_step,
                    "processed_frames": current_job.processed_frames,
                    "status": current_job.status,
                })
                yield f"event: progress\ndata: {data}\n\n"

                if current_job.status in ("completed", "failed", "cancelled"):
                    break

            await asyncio.sleep(1)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
