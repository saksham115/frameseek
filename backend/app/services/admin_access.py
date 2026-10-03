"""Who is an admin: anyone in the ADMIN_EMAILS setting, or added from the dashboard."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.admin import Admin
from app.models.user import User


async def is_admin(db: AsyncSession, user: User | None) -> bool:
    # Admins sign in with Google, like everyone else; the email must be the account's own.
    if user is None or not user.google_id or not user.email:
        return False
    email = user.email.strip().lower()
    if email in settings.admin_emails:
        return True
    return (await db.execute(select(Admin.email).where(Admin.email == email))).first() is not None
