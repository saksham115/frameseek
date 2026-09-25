"""Billing — Stripe subscriptions (replaces Apple/Google IAP).

Entitlement always comes from Stripe webhooks with verified signatures — the client is
never trusted (this closes the forgeable-receipt and forgeable-Apple-webhook findings).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.subscription import Subscription
from app.models.user import User
from app.plan_config import PlanType, get_plan_config, price_to_plan, public_plans
from app.repositories.subscription_repo import SubscriptionRepository
from app.repositories.user_repo import UserRepository
from app.schemas.subscription import SubscriptionDetail, SubscriptionStatusResponse

logger = logging.getLogger(__name__)


def _stripe():
    import stripe

    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


class SubscriptionService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.sub_repo = SubscriptionRepository(db)
        self.user_repo = UserRepository(db)

    # ------------------------------------------------------------------ read
    def list_plans(self) -> list[dict]:
        return public_plans()

    async def get_subscription_status(self, user_id: UUID) -> SubscriptionStatusResponse:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        sub = await self.sub_repo.get_active_for_user(user_id)
        cfg = get_plan_config(user.plan_type)
        detail = SubscriptionDetail.model_validate(sub) if sub else None
        return SubscriptionStatusResponse(
            plan_type=user.plan_type,
            plan_name=cfg.name,
            storage_limit_bytes=user.storage_limit_bytes,
            storage_used_bytes=user.storage_used_bytes,
            monthly_search_limit=user.monthly_search_limit,
            retention_days=user.retention_days,
            subscription=detail,
        )

    # ------------------------------------------------------------------ checkout / portal
    async def _ensure_customer(self, user: User) -> str:
        if user.stripe_customer_id:
            return user.stripe_customer_id
        stripe = _stripe()
        customer = await asyncio.to_thread(
            stripe.Customer.create, email=user.email, name=user.name, metadata={"user_id": str(user.user_id)}
        )
        await self.user_repo.update(user, stripe_customer_id=customer.id)
        return customer.id

    async def create_checkout_session(self, user: User, price_id: str) -> str:
        stripe = _stripe()
        customer_id = await self._ensure_customer(user)
        session = await asyncio.to_thread(
            stripe.checkout.Session.create,
            mode="subscription",
            customer=customer_id,
            line_items=[{"price": price_id, "quantity": 1}],
            client_reference_id=str(user.user_id),
            success_url=f"{settings.FRONTEND_URL}/settings?checkout=success",
            cancel_url=f"{settings.FRONTEND_URL}/upgrade?checkout=cancelled",
            allow_promotion_codes=True,
        )
        return session.url

    async def create_portal_session(self, user: User) -> str:
        if not user.stripe_customer_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No billing account yet")
        stripe = _stripe()
        session = await asyncio.to_thread(
            stripe.billing_portal.Session.create,
            customer=user.stripe_customer_id,
            return_url=f"{settings.FRONTEND_URL}/settings",
        )
        return session.url

    # ------------------------------------------------------------------ webhook
    async def handle_webhook(self, payload: bytes, signature: str) -> None:
        stripe = _stripe()
        try:
            event = stripe.Webhook.construct_event(payload, signature, settings.STRIPE_WEBHOOK_SECRET)
        except Exception as e:
            logger.warning("Stripe webhook signature verification failed: %s", e)
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature")

        etype = event["type"]
        obj = event["data"]["object"]
        logger.info("Stripe webhook: %s", etype)

        if etype == "checkout.session.completed":
            await self._on_checkout_completed(obj)
        elif etype in ("customer.subscription.updated", "customer.subscription.created"):
            await self._on_subscription_change(obj)
        elif etype == "customer.subscription.deleted":
            await self._on_subscription_deleted(obj)

    async def _user_for_customer(self, customer_id: str) -> User | None:
        result = await self.db.execute(select(User).where(User.stripe_customer_id == customer_id))
        return result.scalar_one_or_none()

    async def _on_checkout_completed(self, session: dict) -> None:
        user = None
        ref = session.get("client_reference_id")
        if ref:
            user = await self.user_repo.get_by_id(UUID(ref))
        if not user and session.get("customer"):
            user = await self._user_for_customer(session["customer"])
        if not user:
            logger.warning("checkout.session.completed for unknown user")
            return
        if session.get("customer") and not user.stripe_customer_id:
            await self.user_repo.update(user, stripe_customer_id=session["customer"])

        sub_id = session.get("subscription")
        if sub_id:
            stripe = _stripe()
            sub = await asyncio.to_thread(stripe.Subscription.retrieve, sub_id)
            await self._sync_subscription(user, sub)

    async def _on_subscription_change(self, sub: dict) -> None:
        user = await self._user_for_customer(sub.get("customer"))
        if user:
            await self._sync_subscription(user, sub)

    async def _on_subscription_deleted(self, sub: dict) -> None:
        user = await self._user_for_customer(sub.get("customer"))
        if user:
            await self._apply_plan(user, PlanType.FREE)
            existing = await self.sub_repo.get_by_original_transaction_id(sub.get("id", ""))
            if existing:
                await self.sub_repo.update(existing, status="cancelled", cancelled_at=datetime.now(timezone.utc))

    async def _sync_subscription(self, user: User, sub) -> None:
        # `sub` is a Stripe Subscription (object or dict).
        s = sub if isinstance(sub, dict) else sub.to_dict()
        price_id = s["items"]["data"][0]["price"]["id"]
        plan = price_to_plan(price_id)
        stripe_status = s.get("status", "active")
        active = stripe_status in ("active", "trialing", "past_due")

        await self._apply_plan(user, plan if active else PlanType.FREE)

        expires = s.get("current_period_end")
        expires_at = datetime.fromtimestamp(expires, tz=timezone.utc) if expires else None
        interval = s["items"]["data"][0]["price"].get("recurring", {}).get("interval")

        existing = await self.sub_repo.get_by_original_transaction_id(s["id"])
        fields = dict(
            product_id=price_id,
            plan_type=plan.value,
            status="active" if active else stripe_status,
            billing_period="annual" if interval == "year" else "monthly",
            store="stripe",
            environment="live" if settings.STRIPE_SECRET_KEY.startswith("sk_live") else "test",
            expires_at=expires_at,
            auto_renew_enabled=not s.get("cancel_at_period_end", False),
        )
        if existing:
            await self.sub_repo.update(existing, **fields)
        else:
            await self.sub_repo.create(
                user_id=user.user_id, original_transaction_id=s["id"], transaction_id=s["id"], **fields
            )

    async def _apply_plan(self, user: User, plan: PlanType) -> None:
        cfg = get_plan_config(plan.value)
        await self.user_repo.update(
            user,
            plan_type=plan.value,
            storage_limit_bytes=cfg.storage_limit_bytes,
            monthly_search_limit=cfg.monthly_search_limit,
            retention_days=cfg.retention_days,
        )
