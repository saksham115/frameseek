from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.common import ApiResponse
from app.services.storage_service import StorageService

router = APIRouter()


@router.get("/quota")
async def storage_quota(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = StorageService(db)
    quota = await service.get_quota(user.user_id)
    return ApiResponse(data=quota)
