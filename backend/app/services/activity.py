"""Record that a user is active: last-seen time and one row per active day.

Throttled so a busy session writes at most once every few minutes.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User

TOUCH_EVERY = timedelta(minutes=10)


async def touch(db: AsyncSession, user: User) -> None:
    now = datetime.now(timezone.utc)
    seen = user.last_seen_at
    if seen is not None and seen.tzinfo is None:
        seen = seen.replace(tzinfo=timezone.utc)
    if seen is not None and now - seen < TOUCH_EVERY and seen.date() == now.date():
        return
    await db.execute(text("UPDATE users SET last_seen_at = :now WHERE user_id = :u"), {"now": now, "u": str(user.user_id)})
    await db.execute(
        text("INSERT INTO user_active_days (user_id, day) VALUES (:u, :d) ON CONFLICT DO NOTHING"),
        {"u": str(user.user_id), "d": now.date()},
    )
    await db.commit()
    user.last_seen_at = now
