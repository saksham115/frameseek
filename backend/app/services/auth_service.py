from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.repositories.user_repo import UserRepository
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest, Tokens, UserResponse
from app.utils.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password


class AuthService:
    def __init__(self, db: AsyncSession):
        self.repo = UserRepository(db)

    async def register(self, data: RegisterRequest) -> AuthResponse:
        existing = await self.repo.get_by_email(data.email)
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

        user = await self.repo.create(
            email=data.email,
            name=data.name,
            password_hash=hash_password(data.password),
        )

        tokens = self._generate_tokens(user)
        return AuthResponse(user=UserResponse.model_validate(user), tokens=tokens)

    async def login(self, data: LoginRequest) -> AuthResponse:
        user = await self.repo.get_by_email(data.email)
        if not user or not user.password_hash:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        if not verify_password(data.password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        await self.repo.update(user, last_login_at=datetime.now(timezone.utc))
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
