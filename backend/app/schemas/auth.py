from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class UserResponse(BaseModel):
    user_id: UUID
    email: str
    name: str
    plan_type: str = "free"
    storage_used_bytes: int = 0
    storage_limit_bytes: int = 5368709120
    monthly_search_limit: int = 20
    retention_days: int = 15
    tos_accepted_at: datetime | None = None
    tour_completed_at: datetime | None = None

    model_config = {"from_attributes": True}


class AcceptTosRequest(BaseModel):
    accepted: bool = True


class DeleteAccountRequest(BaseModel):
    reason: str = "user_request"
    feedback: str | None = None
