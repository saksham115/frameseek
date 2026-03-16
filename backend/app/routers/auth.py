from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.auth import AcceptTosRequest, AuthResponse, DeleteAccountRequest, GoogleSignInRequest, LogoutRequest, RefreshRequest, Tokens, UserResponse
from app.schemas.common import ApiResponse
from app.services.auth_service import AuthService

router = APIRouter()


@router.post("/google", response_model=ApiResponse[AuthResponse])
async def google_sign_in(data: GoogleSignInRequest, db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    result = await service.google_sign_in(data.id_token, data.name)
    return ApiResponse(data=result)


@router.post("/refresh", response_model=ApiResponse[Tokens])
async def refresh(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    service = AuthService(db)
    result = await service.refresh(data.refresh_token)
    return ApiResponse(data=result)


@router.get("/me", response_model=ApiResponse[UserResponse])
async def get_me(current_user: User = Depends(get_current_user)):
    return ApiResponse(data=UserResponse.model_validate(current_user))


@router.post("/accept-tos", response_model=ApiResponse[UserResponse])
async def accept_tos(
    data: AcceptTosRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not data.accepted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Terms must be accepted")
    service = AuthService(db)
    result = await service.accept_tos(current_user.user_id)
    return ApiResponse(data=result)


@router.post("/logout")
async def logout(data: LogoutRequest):
    # In a production system, we'd blacklist the refresh token
    return ApiResponse(data={"success": True})


@router.delete("/account")
async def delete_account(
    data: DeleteAccountRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = AuthService(db)
    await service.delete_account(current_user.user_id, reason=data.reason, feedback=data.feedback)
    return ApiResponse(data={"success": True})
