import logging
from datetime import datetime, timezone

import httpx
import jwt as pyjwt
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
from app.schemas.auth import AuthResponse, Tokens, UserResponse
from app.services.video_service import VideoService
from app.utils.security import create_access_token, create_refresh_token, decode_token

logger = logging.getLogger(__name__)


class AuthService:
    def __init__(self, db: AsyncSession):
        self.repo = UserRepository(db)

    async def demo_sign_in(self, email: str, password: str) -> AuthResponse:
        """Sign in with the demo account for App Store Review."""
        if email != settings.DEMO_ACCOUNT_EMAIL or password != settings.DEMO_ACCOUNT_PASSWORD:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid demo credentials",
            )

        user = await self.repo.get_by_email(email)
        if not user:
            # Create the demo user if it doesn't exist
            user = await self.repo.create(email=email, name="Demo User")

        await self.repo.update(user, last_login_at=datetime.now(timezone.utc))
        tokens = self._generate_tokens(user)
        return AuthResponse(user=UserResponse.model_validate(user), tokens=tokens)

    @staticmethod
    async def _get_apple_public_keys() -> dict:
        """Fetch Apple's public keys for verifying identity tokens."""
        async with httpx.AsyncClient() as client:
            resp = await client.get("https://appleid.apple.com/auth/keys")
            resp.raise_for_status()
            return resp.json()

    async def apple_sign_in(self, identity_token: str, name: str | None = None) -> AuthResponse:
        """Verify an Apple identity token and sign in or create a user."""
        try:
            # Decode header to find the key ID
            header = pyjwt.get_unverified_header(identity_token)
            kid = header.get("kid")

            # Fetch Apple's public keys
            apple_keys = await self._get_apple_public_keys()
            matching_key = None
            for key in apple_keys.get("keys", []):
                if key["kid"] == kid:
                    matching_key = key
                    break

            if not matching_key:
                raise ValueError("No matching Apple public key found")

            public_key = pyjwt.algorithms.RSAAlgorithm.from_jwk(matching_key)
            payload = pyjwt.decode(
                identity_token,
                public_key,
                algorithms=["RS256"],
                audience=settings.APPLE_BUNDLE_ID,
                issuer="https://appleid.apple.com",
            )
        except Exception as e:
            logger.error(f"Apple token verification failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid Apple identity token: {e}",
            )

        apple_id = payload["sub"]
        email = payload.get("email")
        apple_name = name or "User"

        if not email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Apple account has no email address",
            )

        # 1. Look up by apple_id (returning user)
        user = await self.repo.get_by_apple_id(apple_id)
        if user:
            await self.repo.update(user, last_login_at=datetime.now(timezone.utc))
            tokens = self._generate_tokens(user)
            return AuthResponse(user=UserResponse.model_validate(user), tokens=tokens)

        # 2. Look up by email (link existing account)
        user = await self.repo.get_by_email(email)
        if user:
            await self.repo.update(
                user,
                apple_id=apple_id,
                last_login_at=datetime.now(timezone.utc),
            )
            tokens = self._generate_tokens(user)
            return AuthResponse(user=UserResponse.model_validate(user), tokens=tokens)

        # 3. Reactivate a previously deleted account
        user = await self.repo.get_deleted_by_apple_id(apple_id)
        if not user:
            user = await self.repo.get_deleted_by_email(email)
        if user:
            await self.repo.update(
                user,
                deleted_at=None,
                name=apple_name,
                apple_id=apple_id,
                last_login_at=datetime.now(timezone.utc),
                tos_accepted_at=None,
            )
            tokens = self._generate_tokens(user)
            return AuthResponse(user=UserResponse.model_validate(user), tokens=tokens)

        # 4. Create new user
        user = await self.repo.create(
            email=email,
            name=apple_name,
            apple_id=apple_id,
        )
        tokens = self._generate_tokens(user)
        return AuthResponse(user=UserResponse.model_validate(user), tokens=tokens)

    async def google_sign_in(self, token: str, name: str | None = None) -> AuthResponse:
        # Verify the Google ID token against all valid audiences
        payload = None
        audiences = [settings.GOOGLE_CLIENT_ID, settings.GOOGLE_IOS_CLIENT_ID]
        last_error = None

        for audience in audiences:
            if not audience:
                continue
            try:
                payload = google_id_token.verify_oauth2_token(
                    token,
                    google_requests.Request(),
                    audience=audience,
                )
                break
            except ValueError as e:
                last_error = e
                continue

        if payload is None:
            logger.error(f"Google token verification failed: {last_error}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid Google ID token: {last_error}",
            )

        google_id = payload["sub"]
        email = payload.get("email")
        google_name = payload.get("name") or name or "User"

        if not email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Google account has no email address",
            )

        # 1. Look up by google_id (returning user)
        user = await self.repo.get_by_google_id(google_id)
        if user:
            await self.repo.update(user, last_login_at=datetime.now(timezone.utc))
            tokens = self._generate_tokens(user)
            return AuthResponse(user=UserResponse.model_validate(user), tokens=tokens)

        # 2. Look up by email (link existing account)
        user = await self.repo.get_by_email(email)
        if user:
            await self.repo.update(
                user,
                google_id=google_id,
                last_login_at=datetime.now(timezone.utc),
            )
            tokens = self._generate_tokens(user)
            return AuthResponse(user=UserResponse.model_validate(user), tokens=tokens)

        # 3. Reactivate a previously deleted account
        user = await self.repo.get_deleted_by_google_id(google_id)
        if not user:
            user = await self.repo.get_deleted_by_email(email)
        if user:
            await self.repo.update(
                user,
                deleted_at=None,
                name=google_name,
                google_id=google_id,
                last_login_at=datetime.now(timezone.utc),
                tos_accepted_at=None,
            )
            tokens = self._generate_tokens(user)
            return AuthResponse(user=UserResponse.model_validate(user), tokens=tokens)

        # 4. Create new user
        user = await self.repo.create(
            email=email,
            name=google_name,
            google_id=google_id,
        )
        tokens = self._generate_tokens(user)
        return AuthResponse(user=UserResponse.model_validate(user), tokens=tokens)

    async def refresh(self, refresh_token: str) -> Tokens:
        payload = decode_token(refresh_token)
        if not payload or payload.get("type") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

        user = await self.repo.get_by_id(payload["sub"])
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

        return self._generate_tokens(user)

    async def accept_tos(self, user_id) -> UserResponse:
        user = await self.repo.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        if not user.tos_accepted_at:
            await self.repo.update(user, tos_accepted_at=datetime.now(timezone.utc))
        return UserResponse.model_validate(user)

    async def delete_account(self, user_id, reason: str, feedback: str | None = None) -> None:
        user = await self.repo.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        # Gather usage stats before deleting data
        db = self.repo.db
        video_count = (await db.execute(
            select(func.count()).select_from(Video).where(Video.user_id == user_id, Video.deleted_at.is_(None))
        )).scalar() or 0
        total_searches = (await db.execute(
            select(func.count()).select_from(SearchHistory).where(SearchHistory.user_id == user_id)
        )).scalar() or 0
        sub_result = await db.execute(
            select(Subscription.product_id, Subscription.plan_type, Subscription.status, Subscription.purchased_at, Subscription.cancelled_at)
            .where(Subscription.user_id == user_id)
        )
        subscription_history = [
            {"product_id": s.product_id, "plan": s.plan_type, "status": s.status,
             "purchased_at": s.purchased_at.isoformat() if s.purchased_at else None,
             "cancelled_at": s.cancelled_at.isoformat() if s.cancelled_at else None}
            for s in sub_result.all()
        ]
        account_age_days = (datetime.now(timezone.utc) - user.created_at.replace(tzinfo=timezone.utc)).days if user.created_at else None

        # Save feedback with usage stats
        deletion_feedback = AccountDeletionFeedback(
            user_id=user.user_id,
            email=user.email,
            reason=reason,
            feedback=feedback,
            plan_type=user.plan_type,
            total_videos=video_count,
            total_searches=total_searches,
            storage_used_bytes=user.storage_used_bytes,
            account_age_days=account_age_days,
            subscription_history=subscription_history or None,
        )
        db.add(deletion_feedback)

        # Delete all videos (cascades to frames, jobs, clips, transcripts + files + GCS)
        video_service = VideoService(db)
        result = await db.execute(
            select(Video).where(Video.user_id == user_id, Video.deleted_at.is_(None))
        )
        videos = list(result.scalars().all())
        for video in videos:
            try:
                await video_service.delete_video(video.video_id, user_id)
            except Exception:
                logger.exception("Failed to delete video %s during account deletion", video.video_id)

        # Delete Qdrant collection for this user
        try:
            vector_db.delete_collection(str(user_id))
        except Exception:
            logger.exception("Failed to delete Qdrant collection for user %s", user_id)

        # Delete remaining data (folders, search history, analytics, subscriptions)
        await db.execute(delete(Folder).where(Folder.user_id == user_id))
        await db.execute(delete(SearchHistory).where(SearchHistory.user_id == user_id))
        await db.execute(delete(UserAnalytics).where(UserAnalytics.user_id == user_id))
        await db.execute(delete(Subscription).where(Subscription.user_id == user_id))

        # Soft-delete the user record
        await self.repo.update(
            user,
            deleted_at=datetime.now(timezone.utc),
            storage_used_bytes=0,
            monthly_search_count=0,
        )

    def _generate_tokens(self, user) -> Tokens:
        token_data = {"sub": str(user.user_id), "email": user.email, "name": user.name, "plan": user.plan_type}
        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token(token_data)
        return Tokens(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
