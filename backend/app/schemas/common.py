from datetime import datetime
from typing import Any, Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel

T = TypeVar("T")


class Meta(BaseModel):
    request_id: str | None = None
    timestamp: datetime = datetime.utcnow()


class ApiResponse(BaseModel, Generic[T]):
    success: bool = True
    data: T | None = None
    meta: Meta = Meta()


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict[str, Any] | None = None


class ErrorResponse(BaseModel):
    success: bool = False
    error: ErrorDetail
    meta: Meta = Meta()


class Pagination(BaseModel):
    page: int
    limit: int
    total: int
    total_pages: int
