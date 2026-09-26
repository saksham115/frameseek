from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.utils.security import decode_token


def _extract_access_token(request: Request) -> str | None:
    # Primary: httpOnly cookie. Fallback: Bearer header (for CLI/tests/tooling).
    token = request.cookies.get(settings.ACCESS_COOKIE_NAME)
    if token:
        return token
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    token = _extract_access_token(request)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = decode_token(token)
    if payload is None or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    result = await db.execute(select(User).where(User.user_id == UUID(user_id), User.deleted_at.is_(None)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


# Sent with the 403 so clients can tell "accept the terms first" apart from other denials.
TOS_REQUIRED_HEADER = "X-Requires-Acceptance"


async def get_active_user(user: User = Depends(get_current_user)) -> User:
    """A signed-in user who has accepted the Terms of Service and Privacy Policy.

    Everything except the auth endpoints (sign-in, profile, accepting, sign-out and
    account deletion) requires this, so the platform isn't usable until acceptance.
    """
    if user.tos_accepted_at is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accept the Terms of Service and Privacy Policy to continue.",
            headers={TOS_REQUIRED_HEADER: "tos"},
        )
    return user
