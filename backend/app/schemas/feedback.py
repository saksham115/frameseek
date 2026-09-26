from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class FeedbackCreate(BaseModel):
    category: Literal["idea", "issue", "feature"] = "idea"
    message: str = Field(min_length=1, max_length=2000)
    # The in-app path the user was on, e.g. "/videos/…"; helps us reproduce problems.
    page: str | None = Field(default=None, max_length=500)

    @field_validator("message")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Feedback can't be empty")
        return v


class FeedbackReceipt(BaseModel):
    feedback_id: UUID
    created_at: datetime
