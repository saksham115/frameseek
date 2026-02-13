from datetime import datetime, timezone

from fastapi import HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.repositories.user_repo import UserRepository
from app.schemas.auth import AuthResponse, Tokens, UserResponse
from app.utils.security import create_access_token, create_refresh_token, decode_token


class AuthService:
    def __init__(self, db: AsyncSession):
        self.repo = UserRepository(db)

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
            import logging
            logging.error(f"Google token verification failed: {last_error}")
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

        # 3. Create new user
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

    def _generate_tokens(self, user) -> Tokens:
        token_data = {"sub": str(user.user_id), "email": user.email, "name": user.name, "plan": user.plan_type}
        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token(token_data)
        return Tokens(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
