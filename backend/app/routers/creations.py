"""Templates and creations: the catalogue, drafts, renders, and uploaded logos and music."""

from __future__ import annotations

import re
from dataclasses import asdict
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_active_user
from app.models.creation import Creation, Render, UserAsset
from app.models.user import User
from app.plan_config import template_limits
from app.schemas.common import ApiResponse
from app.schemas.creation import (
    AssetResponse,
    AssetUploadRequest,
    CreationCreateRequest,
    CreationResponse,
    CreationUpdateRequest,
    RenderRequest,
    RenderResponse,
)
from app.services.creation_service import CreationService
from app.services.template_catalog import load_catalog
from app.utils.gcs_client import GCSClient

router = APIRouter()


def _signed(path: str | None, **kwargs) -> str | None:
    if not path or not GCSClient.is_enabled():
        return None
    try:
        return GCSClient.get().generate_signed_url(path, **kwargs)
    except Exception:
        return None


def _render_response(render: Render | None) -> RenderResponse | None:
    if render is None:
        return None
    resp = RenderResponse.model_validate(render)
    if render.status == "ready":
        resp.video_url = _signed(render.output_path)
        resp.thumbnail_url = _signed(render.thumbnail_path)
    return resp


def _creation_response(creation: Creation, latest: Render | None = None) -> CreationResponse:
    resp = CreationResponse.model_validate(creation)
    resp.latest_render = _render_response(latest)
    if latest is not None and latest.status == "ready":
        resp.thumbnail_url = resp.latest_render.thumbnail_url
    return resp


def _asset_response(asset: UserAsset) -> AssetResponse:
    resp = AssetResponse.model_validate(asset)
    resp.url = _signed(asset.blob_path) if asset.status == "ready" else None
    return resp


# ---------------------------------------------------------------------- catalogue
@router.get("/templates")
async def list_templates(user: User = Depends(get_active_user)):
    catalog = load_catalog()
    return ApiResponse(data={
        "templates": catalog["templates"],
        "caption_styles": catalog["caption_styles"],
        "fonts": catalog["fonts"],
        "limits": asdict(template_limits(user.plan_type)),
        "limits_enforced": settings.TEMPLATE_LIMITS_ENFORCED,
        "renders_used": user.monthly_render_count or 0,
    })


@router.get("/music")
async def list_music(user: User = Depends(get_active_user), db: AsyncSession = Depends(get_db)):
    """The licensed library (not available until a licence is signed) and the user's own tracks."""
    uploads = await CreationService(db).list_assets(user.user_id, "music")
    return ApiResponse(data={
        "library_available": False,
        "library": [],
        "uploads": [_asset_response(a) for a in uploads],
    })


# ---------------------------------------------------------------------- creations
@router.get("/creations")
async def list_creations(user: User = Depends(get_active_user), db: AsyncSession = Depends(get_db)):
    service = CreationService(db)
    await service.mark_stalled_renders(user.user_id)
    creations = await service.list(user.user_id)
    latest = await service.latest_renders([c.creation_id for c in creations])
    return ApiResponse(data={"creations": [_creation_response(c, latest.get(c.creation_id)) for c in creations]})


@router.post("/creations")
async def create_creation(
    body: CreationCreateRequest, user: User = Depends(get_active_user), db: AsyncSession = Depends(get_db),
):
    creation = await CreationService(db).create(user, body)
    return ApiResponse(data=_creation_response(creation))


@router.get("/creations/{creation_id}")
async def get_creation(creation_id: UUID, user: User = Depends(get_active_user), db: AsyncSession = Depends(get_db)):
    service = CreationService(db)
    await service.mark_stalled_renders(user.user_id)
    creation = await service.get(creation_id, user.user_id)
    renders = await service.renders(creation_id, user.user_id)
    return ApiResponse(data=_creation_response(creation, renders[0] if renders else None))


@router.patch("/creations/{creation_id}")
async def update_creation(
    creation_id: UUID, body: CreationUpdateRequest,
    user: User = Depends(get_active_user), db: AsyncSession = Depends(get_db),
):
    service = CreationService(db)
    creation = await service.update(await service.get(creation_id, user.user_id), user, body)
    return ApiResponse(data=_creation_response(creation))


@router.delete("/creations/{creation_id}")
async def delete_creation(creation_id: UUID, user: User = Depends(get_active_user), db: AsyncSession = Depends(get_db)):
    service = CreationService(db)
    await service.delete(await service.get(creation_id, user.user_id))
    return ApiResponse(data={"success": True})


@router.get("/creations/{creation_id}/captions")
async def get_captions(creation_id: UUID, user: User = Depends(get_active_user), db: AsyncSession = Depends(get_db)):
    service = CreationService(db)
    creation = await service.get(creation_id, user.user_id)
    return ApiResponse(data={"captions": await service.captions(creation)})


@router.get("/creations/{creation_id}/renders")
async def list_renders(creation_id: UUID, user: User = Depends(get_active_user), db: AsyncSession = Depends(get_db)):
    service = CreationService(db)
    await service.get(creation_id, user.user_id)
    await service.mark_stalled_renders(user.user_id)
    return ApiResponse(data={"renders": [_render_response(r) for r in await service.renders(creation_id, user.user_id)]})


@router.post("/creations/{creation_id}/render")
async def render_creation(
    creation_id: UUID, body: RenderRequest | None = None,
    user: User = Depends(get_active_user), db: AsyncSession = Depends(get_db),
):
    service = CreationService(db)
    await service.mark_stalled_renders(user.user_id)
    creation = await service.get(creation_id, user.user_id)
    render = await service.queue_render(user, creation, body.resolution if body else None)
    return ApiResponse(data=_render_response(render))


# ---------------------------------------------------------------------- renders
@router.get("/renders/{render_id}")
async def get_render(render_id: UUID, user: User = Depends(get_active_user), db: AsyncSession = Depends(get_db)):
    service = CreationService(db)
    await service.mark_stalled_renders(user.user_id)
    return ApiResponse(data=_render_response(await service.get_render(render_id, user.user_id)))


@router.get("/renders/{render_id}/download-url")
async def download_render(render_id: UUID, user: User = Depends(get_active_user), db: AsyncSession = Depends(get_db)):
    from fastapi import HTTPException

    render = await CreationService(db).get_render(render_id, user.user_id)
    if render.status != "ready" or not render.output_path:
        raise HTTPException(status_code=409, detail="This render isn't ready to download.")
    name = (render.spec.get("settings", {}).get("export", {}) or {}).get("file_name") or render.spec.get("name") or "creation"
    stem = re.sub(r"[^A-Za-z0-9._ -]+", "_", name).strip(" .")[:120] or "creation"
    filename = f"{stem}.mp4"
    url = _signed(render.output_path, content_disposition=f'attachment; filename="{filename}"')
    if not url:
        raise HTTPException(status_code=409, detail="This render isn't available for download.")
    return ApiResponse(data={"download_url": url, "filename": filename})


@router.delete("/renders/{render_id}")
async def delete_render(render_id: UUID, user: User = Depends(get_active_user), db: AsyncSession = Depends(get_db)):
    service = CreationService(db)
    await service.delete_render(await service.get_render(render_id, user.user_id))
    return ApiResponse(data={"success": True})


# ---------------------------------------------------------------------- assets
@router.get("/assets")
async def list_assets(
    kind: str | None = Query(None, pattern="^(logo|music)$"),
    user: User = Depends(get_active_user), db: AsyncSession = Depends(get_db),
):
    assets = await CreationService(db).list_assets(user.user_id, kind)
    return ApiResponse(data={"assets": [_asset_response(a) for a in assets]})


@router.post("/assets/upload-url")
async def create_asset_upload(
    body: AssetUploadRequest, user: User = Depends(get_active_user), db: AsyncSession = Depends(get_db),
):
    asset, upload_url = await CreationService(db).create_asset_upload(user, body)
    return ApiResponse(data={"asset_id": str(asset.asset_id), "upload_url": upload_url})


@router.post("/assets/{asset_id}/finalize")
async def finalize_asset(asset_id: UUID, user: User = Depends(get_active_user), db: AsyncSession = Depends(get_db)):
    service = CreationService(db)
    asset = await service.finalize_asset(await service.get_asset(asset_id, user.user_id))
    return ApiResponse(data=_asset_response(asset))


@router.delete("/assets/{asset_id}")
async def delete_asset(asset_id: UUID, user: User = Depends(get_active_user), db: AsyncSession = Depends(get_db)):
    service = CreationService(db)
    await service.delete_asset(await service.get_asset(asset_id, user.user_id))
    return ApiResponse(data={"success": True})
