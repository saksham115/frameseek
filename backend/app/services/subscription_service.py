import logging
from datetime import datetime, timezone
from uuid import UUID

import httpx
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User
from app.plan_config import PRODUCT_PLAN_MAP, PlanType, get_plan_config
from app.repositories.subscription_repo import SubscriptionRepository
from app.repositories.user_repo import UserRepository
from app.schemas.subscription import SubscriptionDetail, SubscriptionStatusResponse

logger = logging.getLogger(__name__)

APPLE_VERIFY_URLS = {
    "production": "https://buy.itunes.apple.com/verifyReceipt",
    "sandbox": "https://sandbox.itunes.apple.com/verifyReceipt",
}


class SubscriptionService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.sub_repo = SubscriptionRepository(db)
        self.user_repo = UserRepository(db)

    async def get_subscription_status(self, user_id: UUID) -> SubscriptionStatusResponse:
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        sub = await self.sub_repo.get_active_for_user(user_id)
        plan_config = get_plan_config(user.plan_type)

        sub_detail = None
        if sub:
            sub_detail = SubscriptionDetail(
                subscription_id=sub.subscription_id,
                status=sub.status,
                billing_period=sub.billing_period,
                expires_at=sub.expires_at,
                auto_renew_enabled=sub.auto_renew_enabled,
                cancelled_at=sub.cancelled_at,
            )

        return SubscriptionStatusResponse(
            plan_type=user.plan_type,
            plan_name=plan_config.name,
            storage_limit_bytes=plan_config.storage_limit_bytes,
            storage_used_bytes=user.storage_used_bytes or 0,
            monthly_search_limit=plan_config.monthly_search_limit,
            retention_days=plan_config.retention_days,
            subscription=sub_detail,
        )

    # ── Receipt verification (called by mobile after purchase) ──

    async def verify_and_activate(self, user_id: UUID, receipt_data: str) -> SubscriptionStatusResponse:
        """Verify an Apple receipt and activate/update the subscription."""
        user = await self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        # Local dev mode: skip Apple verification, parse product_id from receipt_data
        if settings.APPLE_IAP_ENVIRONMENT == "local":
            await self._apply_local_subscription(user, receipt_data)
            return await self.get_subscription_status(user_id)

        receipt_info = await self._verify_receipt(receipt_data)
        if not receipt_info:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid receipt")

        latest_info = self._extract_latest_subscription(receipt_info)
        if not latest_info:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active subscription in receipt")

        await self._apply_subscription(user, latest_info)
        return await self.get_subscription_status(user_id)

    async def _apply_local_subscription(self, user: User, receipt_data: str):
        """Dev-only: activate subscription without Apple verification.

        Call POST /verify-receipt with {"receipt_data": "<product_id>"} e.g.
        {"receipt_data": "frameseek_pro_monthly"} to simulate a purchase.
        """
        product_id = receipt_data.strip()
        plan_type = PRODUCT_PLAN_MAP.get(product_id)
        if not plan_type:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown product_id '{product_id}'. Valid: {list(PRODUCT_PLAN_MAP.keys())}",
            )

        billing_period = "annual" if "annual" in product_id else "monthly"
        from datetime import timedelta
        expires_at = datetime.now(timezone.utc) + timedelta(days=365 if billing_period == "annual" else 30)

        # Upsert subscription record
        existing = await self.sub_repo.get_active_for_user(user.user_id)
        if existing:
            await self.sub_repo.update(
                existing,
                product_id=product_id,
                plan_type=plan_type.value,
                billing_period=billing_period,
                status="active",
                expires_at=expires_at,
                environment="local",
            )
        else:
            await self.sub_repo.create(
                user_id=user.user_id,
                product_id=product_id,
                original_transaction_id=f"local_{user.user_id}",
                transaction_id=f"local_{datetime.now(timezone.utc).timestamp()}",
                plan_type=plan_type.value,
                billing_period=billing_period,
                status="active",
                store="app_store",
                environment="local",
                expires_at=expires_at,
                auto_renew_enabled=True,
            )

        plan_config = get_plan_config(plan_type.value)
        await self.user_repo.update(
            user,
            plan_type=plan_type.value,
            storage_limit_bytes=plan_config.storage_limit_bytes,
            monthly_search_limit=plan_config.monthly_search_limit,
            retention_days=plan_config.retention_days,
        )
        logger.info(f"[LOCAL DEV] Activated {plan_type.value} for user {user.user_id}")

    async def _verify_receipt(self, receipt_data: str) -> dict | None:
        """Verify receipt with Apple. Try production first, fall back to sandbox."""
        payload = {
            "receipt-data": receipt_data,
            "password": settings.APPLE_SHARED_SECRET,
            "exclude-old-transactions": True,
        }

        async with httpx.AsyncClient(timeout=30) as client:
            # Try production first
            resp = await client.post(APPLE_VERIFY_URLS["production"], json=payload)
            result = resp.json()

            # Status 21007 means it's a sandbox receipt — retry on sandbox
            if result.get("status") == 21007:
                resp = await client.post(APPLE_VERIFY_URLS["sandbox"], json=payload)
                result = resp.json()

            if result.get("status") != 0:
                logger.warning(f"Apple receipt verification failed: status={result.get('status')}")
                return None

            return result

    def _extract_latest_subscription(self, receipt_info: dict) -> dict | None:
        """Extract the latest active subscription from the verified receipt."""
        latest_receipt_info = receipt_info.get("latest_receipt_info", [])
        if not latest_receipt_info:
            return None

        # Get the most recent transaction
        latest = max(latest_receipt_info, key=lambda x: int(x.get("expires_date_ms", "0")))
        return latest

    async def _apply_subscription(self, user: User, txn_info: dict):
        """Create/update subscription record and apply plan to user."""
        product_id = txn_info.get("product_id", "")
        original_txn_id = txn_info.get("original_transaction_id")
        txn_id = txn_info.get("transaction_id")
        expires_ms = txn_info.get("expires_date_ms")

        plan_type = PRODUCT_PLAN_MAP.get(product_id, PlanType.PRO)
        billing_period = "annual" if "annual" in product_id else "monthly"

        expires_at = None
        if expires_ms:
            expires_at = datetime.fromtimestamp(int(expires_ms) / 1000, tz=timezone.utc)

        is_active = expires_at and expires_at > datetime.now(timezone.utc)

        # Upsert subscription record
        existing = None
        if original_txn_id:
            existing = await self.sub_repo.get_by_original_transaction_id(original_txn_id)

        if existing:
            await self.sub_repo.update(
                existing,
                product_id=product_id,
                transaction_id=txn_id,
                plan_type=plan_type.value,
                status="active" if is_active else "expired",
                expires_at=expires_at,
                billing_period=billing_period,
                auto_renew_enabled=True,
                last_notification_type="VERIFY",
                last_notification_at=datetime.now(timezone.utc),
            )
        else:
            await self.sub_repo.create(
                user_id=user.user_id,
                product_id=product_id,
                original_transaction_id=original_txn_id,
                transaction_id=txn_id,
                plan_type=plan_type.value,
                billing_period=billing_period,
                status="active" if is_active else "expired",
                store="app_store",
                environment="sandbox" if "Sandbox" in txn_info.get("environment", "") else "production",
                purchased_at=datetime.now(timezone.utc),
                expires_at=expires_at,
            )

        # Apply plan limits to user
        if is_active:
            plan_config = get_plan_config(plan_type.value)
            await self.user_repo.update(
                user,
                plan_type=plan_type.value,
                storage_limit_bytes=plan_config.storage_limit_bytes,
                monthly_search_limit=plan_config.monthly_search_limit,
                retention_days=plan_config.retention_days,
            )

    # ── Apple App Store Server Notifications v2 ──

    async def handle_apple_notification(self, payload: dict) -> None:
        """Process an Apple App Store Server Notification v2."""
        notification_type = payload.get("notificationType")
        subtype = payload.get("subtype")
        data = payload.get("data", {})
        signed_transaction_info = data.get("signedTransactionInfo", {})
        signed_renewal_info = data.get("signedRenewalInfo", {})

        # In production, you'd decode the JWS (signed) payloads.
        # For now we accept the decoded payload directly (Apple sends JWS-signed).
        # TODO: Add JWS signature verification with Apple's root cert.
        txn_info = signed_transaction_info if isinstance(signed_transaction_info, dict) else {}
        renewal_info = signed_renewal_info if isinstance(signed_renewal_info, dict) else {}

        original_txn_id = txn_info.get("originalTransactionId")
        if not original_txn_id:
            logger.warning(f"Apple notification missing originalTransactionId: {notification_type}")
            return

        sub = await self.sub_repo.get_by_original_transaction_id(original_txn_id)
        if not sub:
            logger.warning(f"No subscription found for originalTransactionId: {original_txn_id}")
            return

        user = await self.user_repo.get_by_id(sub.user_id)
        if not user:
            return

        logger.info(f"Apple notification: {notification_type}/{subtype} for user {user.user_id}")

        if notification_type == "DID_RENEW":
            await self._handle_renewal(sub, user, txn_info)
        elif notification_type == "DID_CHANGE_RENEWAL_STATUS":
            auto_renew = subtype != "AUTO_RENEW_DISABLED"
            await self.sub_repo.update(
                sub,
                auto_renew_enabled=auto_renew,
                cancelled_at=datetime.now(timezone.utc) if not auto_renew else None,
                last_notification_type=notification_type,
                last_notification_at=datetime.now(timezone.utc),
            )
        elif notification_type == "DID_CHANGE_RENEWAL_PREF":
            # User changed to a different product at next renewal
            new_product = renewal_info.get("autoRenewProductId")
            await self.sub_repo.update(
                sub,
                auto_renew_product_id=new_product,
                last_notification_type=notification_type,
                last_notification_at=datetime.now(timezone.utc),
            )
        elif notification_type == "EXPIRED":
            await self._handle_expiration(sub, user)
        elif notification_type == "DID_FAIL_TO_RENEW":
            grace_date = txn_info.get("gracePeriodExpiresDate")
            grace_expires = None
            if grace_date:
                grace_expires = datetime.fromtimestamp(int(grace_date) / 1000, tz=timezone.utc)
            await self.sub_repo.update(
                sub,
                status="billing_retry" if subtype == "GRACE_PERIOD" else "billing_retry",
                grace_period_expires_at=grace_expires,
                last_notification_type=notification_type,
                last_notification_at=datetime.now(timezone.utc),
            )
        elif notification_type == "REFUND":
            await self.sub_repo.update(
                sub,
                status="refunded",
                last_notification_type=notification_type,
                last_notification_at=datetime.now(timezone.utc),
            )
            # Immediately downgrade
            await self._downgrade_to_free(user)
        elif notification_type == "GRACE_PERIOD_EXPIRED":
            await self._handle_expiration(sub, user)

    async def _handle_renewal(self, sub, user: User, txn_info: dict):
        product_id = txn_info.get("productId", sub.product_id)
        expires_ms = txn_info.get("expiresDate")
        expires_at = None
        if expires_ms:
            expires_at = datetime.fromtimestamp(int(expires_ms) / 1000, tz=timezone.utc)

        plan_type = PRODUCT_PLAN_MAP.get(product_id, PlanType.PRO)

        await self.sub_repo.update(
            sub,
            product_id=product_id,
            plan_type=plan_type.value,
            status="active",
            expires_at=expires_at,
            auto_renew_enabled=True,
            last_notification_type="DID_RENEW",
            last_notification_at=datetime.now(timezone.utc),
        )

        plan_config = get_plan_config(plan_type.value)
        await self.user_repo.update(
            user,
            plan_type=plan_type.value,
            storage_limit_bytes=plan_config.storage_limit_bytes,
            monthly_search_limit=plan_config.monthly_search_limit,
            retention_days=plan_config.retention_days,
        )

    async def _handle_expiration(self, sub, user: User):
        await self.sub_repo.update(
            sub,
            status="expired",
            last_notification_type="EXPIRED",
            last_notification_at=datetime.now(timezone.utc),
        )
        # Only downgrade if no other active subscription
        other_active = await self.sub_repo.get_active_for_user(sub.user_id)
        if not other_active:
            await self._downgrade_to_free(user)

    async def _downgrade_to_free(self, user: User):
        free_config = get_plan_config("free")
        await self.user_repo.update(
            user,
            plan_type="free",
            storage_limit_bytes=free_config.storage_limit_bytes,
            monthly_search_limit=free_config.monthly_search_limit,
            retention_days=free_config.retention_days,
        )
