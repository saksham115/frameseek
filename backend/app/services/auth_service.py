import logging
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.account_deletion_feedback import AccountDeletionFeedback
from app.models.folder import Folder
from app.models.search_history import SearchHistory, UserAnalytics
from app.models.subscription import Subscription
from app.models.video import Video
from app.repositories.user_repo import UserRepository
from app.repositories.vector_db import vector_db
from app.schemas.auth import UserResponse
from app.services.video_service import VideoService
from app.utils import sessions
from app.utils.security import create_access_token, create_refresh_token, decode_token

logger = logging.getLogger(__name__)

_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


@dataclass
class SessionTokens:
    access_token: str
    refresh_token: str


class AuthService:
    def __init__(self, db: AsyncSession):
        self.repo = UserRepository(db)

    # ------------------------------------------------------------------ Google web OAuth
    async def exchange_google_code(self, code: str) -> "User":  # noqa: F821
        """Exchange an authorization code for tokens, verify the id_token, upsert the user."""
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                _GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "redirect_uri": settings.GOOGLE_OAUTH_REDIRECT_URI,
                    "grant_type": "authorization_code",
                },
            )
        if resp.status_code != 200:
            logger.error("Google token exchange failed: %s", resp.text)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google sign-in failed")

        id_tok = resp.json().get("id_token")
        if not id_tok:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No id_token from Google")

        try:
            payload = google_id_token.verify_oauth2_token(
                id_tok, google_requests.Request(), audience=settings.GOOGLE_CLIENT_ID
            )
        except ValueError as e:
            logger.error("Google id_token verification failed: %s", e)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token")

        google_id = payload["sub"]
        email = payload.get("email")
        name = payload.get("name") or "User"
        if not email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google account has no email")

        return await self._upsert_google_user(google_id, email, name)

    async def _upsert_google_user(self, google_id: str, email: str, name: str) -> "User":  # noqa: F821
        now = datetime.now(timezone.utc)

        user = await self.repo.get_by_google_id(google_id)
        if user:
            await self.repo.update(user, last_login_at=now)
            return user

        user = await self.repo.get_by_email(email)
        if user:
            await self.repo.update(user, google_id=google_id, last_login_at=now)
            return user

        user = await self.repo.get_deleted_by_google_id(google_id) or await self.repo.get_deleted_by_email(email)
        if user:
            await self.repo.update(
                user, deleted_at=None, name=name, google_id=google_id, last_login_at=now, tos_accepted_at=None
            )
            return user

        return await self.repo.create(email=email, name=name, google_id=google_id)

    # ------------------------------------------------------------------ sessions
    async def issue_session(self, user) -> SessionTokens:
        claims = {"sub": str(user.user_id), "email": user.email, "name": user.name, "plan": user.plan_type}
        access = create_access_token(claims)
        refresh, jti = create_refresh_token(claims)
        await sessions.register_refresh(jti, str(user.user_id))
        return SessionTokens(access_token=access, refresh_token=refresh)

    async def refresh(self, refresh_token: str) -> SessionTokens:
        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

        jti = payload.get("jti")
        user_id = payload.get("sub")
        if not jti or not await sessions.is_refresh_valid(jti, str(user_id)):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token revoked")

        user = await self.repo.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

        await sessions.revoke_refresh(jti)  # rotate: old token is now dead
        return await self.issue_session(user)

    async def logout(self, refresh_token: str | None) -> None:
        if not refresh_token:
            return
        payload = decode_token(refresh_token)
        if payload and payload.get("jti"):
            await sessions.revoke_refresh(payload["jti"])

    async def accept_tos(self, user_id) -> UserResponse:
        user = await self.repo.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        if not user.tos_accepted_at:
            await self.repo.update(user, tos_accepted_at=datetime.now(timezone.utc))
        return UserResponse.model_validate(user)

    # ------------------------------------------------------------------ account deletion
    async def delete_account(self, user_id, reason: str = "user_request", feedback: str | None = None) -> None:
        user = await self.repo.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        db = self.repo.db
        video_count = (await db.execute(
            select(func.count()).select_from(Video).where(Video.user_id == user_id, Video.deleted_at.is_(None))
        )).scalar() or 0
        total_searches = (await db.execute(
            select(func.count()).select_from(SearchHistory).where(SearchHistory.user_id == user_id)
        )).scalar() or 0
        sub_result = await db.execute(
            select(Subscription.product_id, Subscription.plan_type, Subscription.status,
                   Subscription.purchased_at, Subscription.cancelled_at).where(Subscription.user_id == user_id)
        )
        subscription_history = [
            {"product_id": s.product_id, "plan": s.plan_type, "status": s.status,
             "purchased_at": s.purchased_at.isoformat() if s.purchased_at else None,
             "cancelled_at": s.cancelled_at.isoformat() if s.cancelled_at else None}
            for s in sub_result.all()
        ]
        account_age_days = (
            (datetime.now(timezone.utc) - user.created_at.replace(tzinfo=timezone.utc)).days
            if user.created_at else None
        )

        db.add(AccountDeletionFeedback(
            user_id=user.user_id, email=user.email, reason=reason, feedback=feedback,
            plan_type=user.plan_type, total_videos=video_count, total_searches=total_searches,
            storage_used_bytes=user.storage_used_bytes, account_age_days=account_age_days,
            subscription_history=subscription_history or None,
        ))

        video_service = VideoService(db)
        videos = list((await db.execute(
            select(Video).where(Video.user_id == user_id, Video.deleted_at.is_(None))
        )).scalars().all())
        for video in videos:
            try:
                await video_service.delete_video(video.video_id, user_id)
            except Exception:
                logger.exception("Failed to delete video %s during account deletion", video.video_id)

        try:
            vector_db.delete_collection(str(user_id))
        except Exception:
            logger.exception("Failed to delete embeddings for user %s", user_id)

        await db.execute(delete(Folder).where(Folder.user_id == user_id))
        await db.execute(delete(SearchHistory).where(SearchHistory.user_id == user_id))
        await db.execute(delete(UserAnalytics).where(UserAnalytics.user_id == user_id))
        await db.execute(delete(Subscription).where(Subscription.user_id == user_id))

        await self.repo.update(user, deleted_at=datetime.now(timezone.utc), storage_used_bytes=0, monthly_search_count=0)
