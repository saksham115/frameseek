from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import ApiResponse
from app.schemas.search import SearchHistoryItem, SearchHistoryResponse, SearchQuota, SearchRequest, SearchResponse
from app.services.search_service import SearchService

router = APIRouter()


@router.post("", response_model=ApiResponse[SearchResponse])
async def search(
    data: SearchRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = SearchService(db)
    result = await service.search(data, user.user_id)
    return ApiResponse(data=result)


@router.get("/history", response_model=ApiResponse[SearchHistoryResponse])
async def search_history(
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = SearchService(db)
    history = await service.get_history(user.user_id, limit)
    return ApiResponse(data=SearchHistoryResponse(
        history=[SearchHistoryItem.model_validate(h) for h in history]
    ))


@router.get("/quota", response_model=ApiResponse[SearchQuota])
async def search_quota(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = SearchService(db)
    quota = await service.get_quota(user.user_id)
    return ApiResponse(data=quota)
