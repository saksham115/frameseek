import logging

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.subscription import PaymentConfigResponse, SubscriptionStatusResponse
from app.services.subscription_service import SubscriptionService

logger = logging.getLogger(__name__)

router = APIRouter()


class CheckoutRequest(BaseModel):
    price_id: str


@router.get("/config", response_model=ApiResponse[PaymentConfigResponse])
async def payment_config():
    return ApiResponse(data=PaymentConfigResponse(payments_enabled=settings.PAYMENTS_ENABLED))


@router.get("/plans")
async def list_plans(db: AsyncSession = Depends(get_db)):
    return ApiResponse(data=SubscriptionService(db).list_plans())


@router.get("/status", response_model=ApiResponse[SubscriptionStatusResponse])
async def subscription_status(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await SubscriptionService(db).get_subscription_status(user.user_id)
    return ApiResponse(data=result)


@router.post("/checkout")
async def create_checkout(
    body: CheckoutRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    url = await SubscriptionService(db).create_checkout_session(user, body.price_id)
    return ApiResponse(data={"url": url})


@router.post("/portal")
async def billing_portal(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    url = await SubscriptionService(db).create_portal_session(user)
    return ApiResponse(data={"url": url})


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(default="", alias="Stripe-Signature"),
    db: AsyncSession = Depends(get_db),
):
    payload = await request.body()
    await SubscriptionService(db).handle_webhook(payload, stripe_signature)
    return {"received": True}
