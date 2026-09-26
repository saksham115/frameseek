import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_active_user
from app.models.user import User
from app.models.user_feedback import UserFeedback
from app.schemas.common import ApiResponse
from app.schemas.feedback import FeedbackCreate, FeedbackReceipt

router = APIRouter()
# Under "app" so Azure Monitor exports it; INFO set explicitly because the root default
# (WARNING) would otherwise drop these records.
logger = logging.getLogger("app.feedback")
logger.setLevel(logging.INFO)

# Generous for real feedback, tight enough that the box can't be used to flood the table.
MAX_PER_HOUR = 10


@router.post("", response_model=ApiResponse[FeedbackReceipt], status_code=status.HTTP_201_CREATED)
async def submit_feedback(
    data: FeedbackCreate,
    request: Request,
    user: User = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
):
    """One-way feedback from a user to the FrameSeek team."""
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    recent = (
        await db.execute(
            select(func.count()).select_from(UserFeedback).where(
                UserFeedback.user_id == user.user_id, UserFeedback.created_at >= since
            )
        )
    ).scalar() or 0
    if recent >= MAX_PER_HOUR:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="You've sent a lot of feedback in the last hour. Please try again later.",
        )

    feedback = UserFeedback(
        user_id=user.user_id,
        email=user.email,
        category=data.category,
        message=data.message,
        page=data.page,
        user_agent=(request.headers.get("user-agent") or "")[:500] or None,
    )
    db.add(feedback)
    await db.flush()
    await db.refresh(feedback)
    # Also lands in Application Insights, so new feedback is visible without querying the DB.
    logger.info(
        "User feedback [%s] from %s on %s: %s",
        data.category, user.email, data.page or "-", data.message[:500],
        extra={"custom_dimensions": {
            "feedback_id": str(feedback.feedback_id), "category": data.category, "page": data.page or "",
        }},
    )
    return ApiResponse(data=FeedbackReceipt(feedback_id=feedback.feedback_id, created_at=feedback.created_at))
