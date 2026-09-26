import secrets
from datetime import datetime, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_active_user, get_current_user
from app.models.user import User
from app.schemas.auth import AcceptTosRequest, DeleteAccountRequest, UserResponse
from app.schemas.common import ApiResponse
from app.services.auth_service import AuthService, SessionTokens

router = APIRouter()

_GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_STATE_COOKIE = "fs_oauth_state"


def _cookie_kwargs() -> dict:
    kwargs = {"httponly": True, "secure": settings.COOKIE_SECURE, "samesite": "lax"}
    if settings.COOKIE_DOMAIN:
        kwargs["domain"] = settings.COOKIE_DOMAIN
    return kwargs


def _set_session_cookies(response: Response, tokens: SessionTokens) -> None:
    response.set_cookie(
        settings.ACCESS_COOKIE_NAME, tokens.access_token,
        max_age=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60, path="/", **_cookie_kwargs(),
    )
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME, tokens.refresh_token,
        max_age=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600, path="/", **_cookie_kwargs(),
    )


def _clear_session_cookies(response: Response) -> None:
    domain = settings.COOKIE_DOMAIN or None
    response.delete_cookie(settings.ACCESS_COOKIE_NAME, path="/", domain=domain)
    response.delete_cookie(settings.REFRESH_COOKIE_NAME, path="/", domain=domain)


@router.get("/google/start")
async def google_start():
    state = secrets.token_urlsafe(24)
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "select_account",
    }
    response = RedirectResponse(f"{_GOOGLE_AUTH_URL}?{urlencode(params)}")
    # Double-submit state: store it in a short-lived cookie validated on callback.
    response.set_cookie(_STATE_COOKIE, state, max_age=600, httponly=True,
                        secure=settings.COOKIE_SECURE, samesite="lax", path="/")
    return response


@router.get("/google/callback")
async def google_callback(request: Request, code: str = "", state: str = "", db: AsyncSession = Depends(get_db)):
    expected = request.cookies.get(_STATE_COOKIE)
    if not code or not state or state != expected:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OAuth state")

    service = AuthService(db)
    user = await service.exchange_google_code(code)
    tokens = await service.issue_session(user)

    response = RedirectResponse(settings.FRONTEND_URL)
    _set_session_cookies(response, tokens)
    response.delete_cookie(_STATE_COOKIE, path="/")
    return response


@router.post("/refresh")
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")
    tokens = await AuthService(db).refresh(token)
    _set_session_cookies(response, tokens)
    return ApiResponse(data={"success": True})


@router.post("/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    await AuthService(db).logout(token)
    _clear_session_cookies(response)
    return ApiResponse(data={"success": True})


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
    result = await AuthService(db).accept_tos(current_user.user_id)
    return ApiResponse(data=result)


@router.post("/tour-complete", response_model=ApiResponse[UserResponse])
async def complete_tour(
    current_user: User = Depends(get_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Record that the first-visit product tour was finished or skipped (first time only)."""
    if current_user.tour_completed_at is None:
        current_user.tour_completed_at = datetime.now(timezone.utc)
        await db.flush()
    return ApiResponse(data=UserResponse.model_validate(current_user))


@router.delete("/me")
async def delete_account(
    request: Request,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    reason = "user_request"
    feedback = None
    try:
        body = await request.json()
        if isinstance(body, dict):
            parsed = DeleteAccountRequest(**body)
            reason, feedback = parsed.reason, parsed.feedback
    except Exception:
        pass  # body is optional for web deletion

    service = AuthService(db)
    await service.delete_account(current_user.user_id, reason=reason, feedback=feedback)
    token = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    await service.logout(token)
    _clear_session_cookies(response)
    return ApiResponse(data={"success": True})
