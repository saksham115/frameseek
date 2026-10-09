from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, field_validator

from app.legal import accepted_current_terms


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
    creations_tour_completed_at: datetime | None = None
    is_admin: bool = False

    model_config = {"from_attributes": True}

    @field_validator("tos_accepted_at")
    @classmethod
    def _only_current_terms(cls, v: datetime | None) -> datetime | None:
        # Acceptance of an older version reads as none, so the app asks again.
        return v if accepted_current_terms(v) else None


class AcceptTosRequest(BaseModel):
    accepted: bool = True


class DeleteAccountRequest(BaseModel):
    reason: str = "user_request"
    feedback: str | None = None
