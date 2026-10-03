"""Admin dashboard API. Every route requires an admin (see dependencies.get_admin_user);
anyone else gets a plain 404, so the dashboard's existence isn't advertised."""

from __future__ import annotations

import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_admin_user
from app.models.admin import Admin
from app.models.user import User
from app.schemas.common import ApiResponse
from app.services import admin_stats

logger = logging.getLogger(__name__)
router = APIRouter()

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class AddAdminRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)


@router.get("/overview")
async def overview(
    days: int = Query(30, ge=7, le=365),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return ApiResponse(data=await admin_stats.overview(db, days))


@router.get("/users")
async def list_users(
    q: str | None = Query(None, max_length=200),
    sort: str = Query("joined"),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return ApiResponse(data=await admin_stats.users(db, q, sort, page, limit))


@router.get("/feedback")
async def list_feedback(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    return ApiResponse(data=await admin_stats.feedback(db, page, limit))


@router.get("/admins")
async def list_admins(admin: User = Depends(get_admin_user), db: AsyncSession = Depends(get_db)):
    return ApiResponse(data={"admins": await admin_stats.admins(db)})


@router.post("/admins")
async def add_admin(
    body: AddAdminRequest,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    email = body.email.strip().lower()
    if not _EMAIL.match(email):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    if email in settings.admin_emails:
        raise HTTPException(status_code=409, detail="That email is already an admin.")
    if (await db.execute(select(Admin.email).where(Admin.email == email))).first():
        raise HTTPException(status_code=409, detail="That email is already an admin.")
    db.add(Admin(email=email, added_by=admin.email.lower()))
    await db.flush()
    logger.warning("Admin %s added admin %s", admin.email, email)
    return ApiResponse(data={"admins": await admin_stats.admins(db)})


@router.delete("/admins/{email}")
async def remove_admin(
    email: str,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
):
    email = email.strip().lower()
    if email in settings.admin_emails:
        raise HTTPException(
            status_code=400,
            detail="This admin is set in the server configuration (ADMIN_EMAILS) and can only be removed there.",
        )
    if email == admin.email.lower():
        raise HTTPException(status_code=400, detail="You can’t remove yourself. Ask another admin.")
    result = await db.execute(delete(Admin).where(Admin.email == email))
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="That email isn’t an admin.")
    logger.warning("Admin %s removed admin %s", admin.email, email)
    return ApiResponse(data={"admins": await admin_stats.admins(db)})
