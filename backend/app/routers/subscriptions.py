import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.subscription import SubscriptionStatusResponse
from app.services.subscription_service import SubscriptionService

logger = logging.getLogger(__name__)

router = APIRouter()


class VerifyReceiptRequest(BaseModel):
    receipt_data: str


@router.get("/status", response_model=ApiResponse[SubscriptionStatusResponse])
async def subscription_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = SubscriptionService(db)
    result = await service.get_subscription_status(user.user_id)
    return ApiResponse(data=result)


@router.post("/verify-receipt", response_model=ApiResponse[SubscriptionStatusResponse])
async def verify_receipt(
    body: VerifyReceiptRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify an Apple IAP receipt and activate the subscription."""
    service = SubscriptionService(db)
    result = await service.verify_and_activate(user.user_id, body.receipt_data)
    return ApiResponse(data=result)


@router.post("/apple-notification")
async def apple_server_notification(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Apple App Store Server Notifications v2 endpoint.

    Configure this URL in App Store Connect under:
    App > App Information > App Store Server Notifications > Production/Sandbox URL
    """
    body = await request.json()

    # Apple sends a signedPayload (JWS). In a full implementation you'd
    # decode and verify the JWS using Apple's root certificate.
    # For now, we accept the decoded payload.
    # TODO: Add JWS signature verification.

    notification_type = body.get("notificationType")
    logger.info(f"Apple Server Notification: {notification_type}")

    service = SubscriptionService(db)
    await service.handle_apple_notification(body)

    return {"success": True}


@router.post("/dev/reset", response_model=ApiResponse[SubscriptionStatusResponse])
async def dev_reset_to_free(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """DEV ONLY: Reset user back to free plan."""
    if settings.APPLE_IAP_ENVIRONMENT != "local":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    service = SubscriptionService(db)
    await service._downgrade_to_free(user)
    await db.commit()
    result = await service.get_subscription_status(user.user_id)
    return ApiResponse(data=result)
