"""Refresh-token allowlist in Redis — enables real revocation and rotation.

A refresh token is only valid while its jti is present. Rotation deletes the old jti and
adds a new one; logout/account-deletion deletes it. This is what makes server-side logout
actually work (the old system's logout was a no-op).
"""

from __future__ import annotations

import redis.asyncio as aioredis

from app.config import settings

_redis: aioredis.Redis | None = None


def _client() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


def _key(jti: str) -> str:
    return f"refresh:{jti}"


async def register_refresh(jti: str, user_id: str) -> None:
    ttl = settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS * 24 * 3600
    await _client().set(_key(jti), user_id, ex=ttl)


async def is_refresh_valid(jti: str, user_id: str) -> bool:
    return (await _client().get(_key(jti))) == user_id


async def revoke_refresh(jti: str) -> None:
    await _client().delete(_key(jti))
