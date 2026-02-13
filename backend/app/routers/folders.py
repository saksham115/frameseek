from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.repositories.folder_repo import FolderRepository
from app.schemas.common import ApiResponse
from app.schemas.folder import FolderCreate, FolderListResponse, FolderResponse, FolderUpdate

router = APIRouter()


@router.get("", response_model=ApiResponse[FolderListResponse])
async def list_folders(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = FolderRepository(db)
    folders = await repo.list_folders(user.user_id)
    folder_responses = []
    for f in folders:
        resp = FolderResponse.model_validate(f)
        resp.video_count = await repo.get_video_count(f.folder_id)
        folder_responses.append(resp)
    return ApiResponse(data=FolderListResponse(folders=folder_responses))


@router.post("", response_model=ApiResponse[FolderResponse])
async def create_folder(
    data: FolderCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = FolderRepository(db)

    # Build path
    if data.parent_folder_id:
        parent = await repo.get_by_id(data.parent_folder_id, user.user_id)
        if not parent:
            from fastapi import HTTPException, status
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent folder not found")
        path = f"{parent.path}/{data.name}"
    else:
        path = f"/{data.name}"

    folder = await repo.create(
        user_id=user.user_id,
        parent_folder_id=data.parent_folder_id,
        name=data.name,
        path=path,
    )
    resp = FolderResponse.model_validate(folder)
    resp.video_count = 0
    return ApiResponse(data=resp)


@router.put("/{folder_id}", response_model=ApiResponse[FolderResponse])
async def update_folder(
    folder_id: UUID,
    data: FolderUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = FolderRepository(db)
    folder = await repo.get_by_id(folder_id, user.user_id)
    if not folder:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")

    # Update path
    old_name = folder.name
    new_path = folder.path.rsplit(old_name, 1)[0] + data.name
    await repo.update(folder, name=data.name, path=new_path)
    await db.refresh(folder)

    resp = FolderResponse.model_validate(folder)
    resp.video_count = await repo.get_video_count(folder_id)
    return ApiResponse(data=resp)


@router.delete("/{folder_id}")
async def delete_folder(
    folder_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = FolderRepository(db)
    folder = await repo.get_by_id(folder_id, user.user_id)
    if not folder:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found")
    await repo.delete(folder)
    return ApiResponse(data={"success": True})
