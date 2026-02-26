from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class SubscriptionDetail(BaseModel):
    subscription_id: UUID | None = None
    status: str | None = None
    billing_period: str | None = None
    expires_at: datetime | None = None
    auto_renew_enabled: bool | None = None
    cancelled_at: datetime | None = None

    model_config = {"from_attributes": True}


class SubscriptionStatusResponse(BaseModel):
    plan_type: str
    plan_name: str
    storage_limit_bytes: int
    storage_used_bytes: int
    monthly_search_limit: int
    retention_days: int
    subscription: SubscriptionDetail | None = None
