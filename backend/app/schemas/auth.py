from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class GoogleSignInRequest(BaseModel):
    id_token: str
    name: str | None = None


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


class Tokens(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int


class UserResponse(BaseModel):
    user_id: UUID
    email: str
    name: str
    plan_type: str = "free"
    storage_used_bytes: int = 0
    storage_limit_bytes: int = 5368709120
    tos_accepted_at: datetime | None = None

    model_config = {"from_attributes": True}


class AcceptTosRequest(BaseModel):
    accepted: bool = True


class AuthResponse(BaseModel):
    user: UserResponse
    tokens: Tokens
