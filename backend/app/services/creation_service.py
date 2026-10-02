"""Creations (template drafts), their renders, and the logos and music used in them."""

from __future__ import annotations

import asyncio
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.creation import Creation, Render, UserAsset
from app.models.transcript import TranscriptSegment
from app.models.user import User
from app.models.video import Video
from app.plan_config import template_limits
from app.schemas.creation import (
    AssetUploadRequest,
    CreationCreateRequest,
    CreationUpdateRequest,
    Moment,
)
from app.services.framing import auto_frame_moment
from app.services.render.layout import output_size, video_box
from app.services.storage_service import StorageService
from app.services.template_catalog import default_settings, get_template, merge_settings
from app.utils.gcs_client import GCSClient

logger = logging.getLogger(__name__)

# A rendering row with no heartbeat for this long lost its worker; a queued one that
# never started within QUEUED_STALL is assumed lost too.
RENDER_STALL = timedelta(minutes=5)
QUEUED_STALL = timedelta(minutes=60)
RENDER_STALLED_MESSAGE = "Rendering stopped before it finished. Render again to retry."

ASSET_RULES = {
    "logo": {
        "max_bytes": 5 * 1024 * 1024,
        "types": {"image/png", "image/jpeg", "image/webp"},
        "label": "PNG, JPG or WebP up to 5 MB",
    },
    "music": {
        "max_bytes": 20 * 1024 * 1024,
        "types": {"audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/wave", "audio/mp4",
                  "audio/x-m4a", "audio/m4a", "audio/aac"},
        "label": "MP3, WAV or M4A up to 20 MB",
    },
}


def _not_found(what: str = "Creation") -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def _safe_filename(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._")[:100] or "file"


def _target_aspect(recipe: dict, fmt: str) -> float:
    w, h = output_size(fmt, 1080)
    return video_box(recipe.get("layout") or {}, w, h).aspect


def _month_start(now: datetime) -> datetime:
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


class CreationService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.storage = StorageService(db)

    # ------------------------------------------------------------------ lookups
    async def get(self, creation_id: UUID, user_id: UUID) -> Creation:
        creation = (await self.db.execute(
            select(Creation).where(
                Creation.creation_id == creation_id, Creation.user_id == user_id, Creation.deleted_at.is_(None)
            )
        )).scalar_one_or_none()
        if not creation:
            raise _not_found()
        return creation

    async def list(self, user_id: UUID) -> list[Creation]:
        return list((await self.db.execute(
            select(Creation)
            .where(Creation.user_id == user_id, Creation.deleted_at.is_(None))
            .order_by(Creation.updated_at.desc())
            .limit(200)
        )).scalars().all())

    async def latest_renders(self, creation_ids: list[UUID]) -> dict[UUID, Render]:
        if not creation_ids:
            return {}
        rows = (await self.db.execute(
            select(Render)
            .where(Render.creation_id.in_(creation_ids))
            .order_by(Render.creation_id, Render.created_at.desc())
            .distinct(Render.creation_id)
        )).scalars().all()
        return {r.creation_id: r for r in rows}

    async def renders(self, creation_id: UUID, user_id: UUID) -> list[Render]:
        return list((await self.db.execute(
            select(Render)
            .where(Render.creation_id == creation_id, Render.user_id == user_id)
            .order_by(Render.created_at.desc())
            .limit(20)
        )).scalars().all())

    async def get_render(self, render_id: UUID, user_id: UUID) -> Render:
        render = (await self.db.execute(
            select(Render).where(Render.render_id == render_id, Render.user_id == user_id)
        )).scalar_one_or_none()
        if not render:
            raise _not_found("Render")
        return render

    # ------------------------------------------------------------------ moments
    async def _videos(self, user_id: UUID, video_ids: set) -> dict[str, Video]:
        if not video_ids:
            return {}
        rows = (await self.db.execute(
            select(Video).where(
                Video.user_id == user_id, Video.video_id.in_(list(video_ids)), Video.deleted_at.is_(None)
            )
        )).scalars().all()
        return {str(v.video_id): v for v in rows}

    async def _check_moments(self, user_id: UUID, moments: list[Moment], recipe: dict) -> list[dict]:
        limits = recipe.get("moments") or {}
        if len(moments) > int(limits.get("max", 20)):
            raise HTTPException(status_code=400, detail=f"This template takes up to {limits['max']} moments.")
        if len({m.id for m in moments}) != len(moments):
            raise HTTPException(status_code=400, detail="Each moment needs its own id.")
        videos = await self._videos(user_id, {m.video_id for m in moments})
        out = []
        for m in moments:
            video = videos.get(str(m.video_id))
            if not video:
                raise HTTPException(status_code=404, detail="A video in this creation was not found.")
            if video.status != "ready":
                raise HTTPException(status_code=400, detail=f"“{video.title}” is still processing.")
            if video.duration_seconds and m.end > float(video.duration_seconds) + 0.5:
                raise HTTPException(status_code=400, detail="A moment ends after its video does.")
            out.append(m.model_dump(mode="json"))
        return out

    async def _auto_frame(self, user_id: UUID, recipe: dict, fmt: str, moments: list[dict], force: bool = False) -> list[dict]:
        """Centre unframed (or, with ``force``, all unlocked) moments on their subject."""
        if (recipe.get("layout") or {}).get("reframe") == "none":
            return moments
        aspect = _target_aspect(recipe, fmt)
        todo = [m for m in moments if not m.get("crop_locked") and (force or not m.get("crop"))]
        sem = asyncio.Semaphore(4)

        async def frame(m: dict) -> None:
            async with sem:
                crop = await auto_frame_moment(self.db, user_id, m, aspect)
            if crop:
                m["crop"] = crop

        await asyncio.gather(*(frame(m) for m in todo))
        return moments

    # ------------------------------------------------------------------ CRUD
    async def create(self, user: User, req: CreationCreateRequest) -> Creation:
        template = get_template(req.template_id)
        if not template:
            raise _not_found("Template")
        recipe = dict(template)
        moments = await self._check_moments(user.user_id, req.moments, recipe)
        settings = default_settings(recipe, req.format)
        moments = await self._auto_frame(user.user_id, recipe, settings["format"], moments)

        name = req.name
        if not name:
            first = (await self._videos(user.user_id, {req.moments[0].video_id})).get(str(req.moments[0].video_id)) if req.moments else None
            name = f"{template['name']} · {first.title}" if first else template["name"]
        creation = Creation(
            user_id=user.user_id, name=name[:200], template_id=template["id"],
            template_version=int(template["version"]), recipe=recipe, moments=moments,
            settings=settings, caption_edits={},
        )
        self.db.add(creation)
        await self.db.flush()
        return creation

    async def update(self, creation: Creation, user: User, req: CreationUpdateRequest) -> Creation:
        old_format = (creation.settings or {}).get("format")
        if req.name is not None:
            creation.name = req.name.strip()[:200] or creation.name
        if req.settings is not None:
            try:
                creation.settings = merge_settings(creation.recipe, creation.settings, req.settings)
            except ValidationError as exc:
                err = exc.errors()[0]
                where = ".".join(str(p) for p in err.get("loc", ()))
                raise HTTPException(status_code=422, detail=f"Invalid setting {where}: {err.get('msg')}")
        moments = creation.moments
        if req.moments is not None:
            moments = await self._check_moments(user.user_id, req.moments, creation.recipe)
        format_changed = creation.settings.get("format") != old_format
        if req.moments is not None or format_changed:
            creation.moments = await self._auto_frame(
                user.user_id, creation.recipe, creation.settings["format"], [dict(m) for m in moments],
                force=format_changed,
            )
        if req.caption_edits is not None:
            ids = {m["id"] for m in creation.moments}
            creation.caption_edits = {
                k: [line.model_dump() for line in v] for k, v in req.caption_edits.items() if k in ids
            }
        else:
            ids = {m["id"] for m in creation.moments}
            creation.caption_edits = {k: v for k, v in (creation.caption_edits or {}).items() if k in ids}
        creation.updated_at = datetime.now(timezone.utc)
        await self.db.flush()
        return creation

    async def delete(self, creation: Creation) -> None:
        renders = (await self.db.execute(
            select(Render).where(Render.creation_id == creation.creation_id)
        )).scalars().all()
        for render in renders:
            if render.status in ("queued", "rendering"):
                # The worker checks for this before saving and discards its output.
                render.status = "cancelled"
                render.error_message = "The creation was deleted."
            else:
                await self._delete_render_files(render)
                await self.db.delete(render)
        creation.deleted_at = datetime.now(timezone.utc)

    # ------------------------------------------------------------------ captions
    async def transcript_lines(self, user_id: UUID, moments: list[dict]) -> dict[str, list[dict]]:
        """Transcript lines inside each moment, in source-video seconds."""
        out: dict[str, list[dict]] = {}
        for m in moments:
            rows = (await self.db.execute(
                select(TranscriptSegment)
                .where(
                    TranscriptSegment.user_id == user_id,
                    TranscriptSegment.video_id == UUID(str(m["video_id"])),
                    TranscriptSegment.end_seconds > float(m["start"]),
                    TranscriptSegment.start_seconds < float(m["end"]),
                )
                .order_by(TranscriptSegment.start_seconds)
            )).scalars().all()
            out[m["id"]] = [
                {
                    "start": round(max(float(m["start"]), r.start_seconds), 3),
                    "end": round(min(float(m["end"]), r.end_seconds), 3),
                    "text": r.text.strip(),
                }
                for r in rows if r.text and r.text.strip()
            ]
        return out

    async def captions(self, creation: Creation) -> dict[str, dict]:
        transcript = await self.transcript_lines(creation.user_id, creation.moments)
        edits = creation.caption_edits or {}
        return {
            m["id"]: {
                "edited": m["id"] in edits,
                "lines": edits.get(m["id"], transcript.get(m["id"], [])),
            }
            for m in creation.moments
        }

    # ------------------------------------------------------------------ rendering
    async def _count_render(self, user: User, monthly_limit: int) -> None:
        now = datetime.now(timezone.utc)
        await self.db.execute(
            text(
                "UPDATE users SET monthly_render_count = 0, render_count_reset_at = :now "
                "WHERE user_id = :uid AND (render_count_reset_at IS NULL OR render_count_reset_at < :month)"
            ),
            {"uid": str(user.user_id), "now": now, "month": _month_start(now)},
        )
        counted = await self.db.execute(
            text(
                "UPDATE users SET monthly_render_count = monthly_render_count + 1 "
                "WHERE user_id = :uid AND monthly_render_count < :limit"
            ),
            {"uid": str(user.user_id), "limit": monthly_limit},
        )
        if counted.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You've used all {monthly_limit} renders for this month. They reset on the 1st.",
            )

    async def queue_render(self, user: User, creation: Creation, resolution: int | None) -> Render:
        recipe, settings, moments = creation.recipe, creation.settings, creation.moments
        limits = template_limits(user.plan_type)
        rules = recipe.get("moments") or {}

        if not moments:
            raise HTTPException(status_code=400, detail="Add at least one moment before rendering.")
        if len(moments) < int(rules.get("min", 1)):
            raise HTTPException(status_code=400, detail=f"This template needs at least {rules['min']} moments.")
        per_moment = rules.get("max_moment_seconds")
        if per_moment and any(float(m["end"]) - float(m["start"]) > per_moment + 0.05 for m in moments):
            raise HTTPException(status_code=400, detail=f"Each moment can be up to {per_moment} seconds in this template.")
        total = sum(float(m["end"]) - float(m["start"]) for m in moments)
        max_total = min(float(rules.get("max_total_seconds", 600)), float(limits.max_creation_seconds))
        if total > max_total + 0.05:
            raise HTTPException(
                status_code=400,
                detail=f"Moments add up to {total:.0f} seconds; the limit here is {max_total:.0f}. Trim a moment or remove one.",
            )

        active = (await self.db.execute(
            select(Render.render_id).where(Render.creation_id == creation.creation_id, Render.status.in_(["queued", "rendering"]))
        )).first()
        if active:
            raise HTTPException(status_code=409, detail="This creation is already rendering.")

        videos = await self._videos(user.user_id, {UUID(str(m["video_id"])) for m in moments})
        for m in moments:
            v = videos.get(str(m["video_id"]))
            if not v or v.status != "ready":
                raise HTTPException(status_code=400, detail="A video in this creation was deleted or isn't ready. Remove that moment and try again.")
        if user.storage_used_bytes >= user.storage_limit_bytes:
            raise HTTPException(status_code=403, detail="Your storage is full. Delete a video or creation to render.")

        assets: dict[str, UserAsset] = {}
        for key, kind in (("logo", "logo"), ("music", "music")):
            asset_id = (settings.get("branding") or {}).get("logo_asset_id") if key == "logo" else (settings.get("music") or {}).get("asset_id")
            if asset_id:
                asset = await self._asset(UUID(str(asset_id)), user.user_id)
                if asset and asset.kind == kind and asset.status == "ready":
                    assets[key] = asset

        res = min(int(resolution or (settings.get("export") or {}).get("resolution", 1080)), limits.max_resolution)
        await self._count_render(user, limits.monthly_renders)
        captions = await self.captions(creation) if (settings.get("captions") or {}).get("enabled") else {}
        width, height = output_size(settings["format"], res)
        spec = {
            "recipe": recipe,
            "settings": settings,
            "moments": moments,
            "captions": {mid: c["lines"] for mid, c in captions.items()},
            "resolution": res,
            "watermark": limits.watermark,
            "name": creation.name,
            "sources": {
                vid: {"gcs_path": v.gcs_path, "file_path": v.file_path, "title": v.title}
                for vid, v in videos.items()
            },
            "logo": {"blob_path": assets["logo"].blob_path} if "logo" in assets else None,
            "music": {"blob_path": assets["music"].blob_path} if "music" in assets else None,
        }
        render = Render(
            creation_id=creation.creation_id, user_id=user.user_id, status="queued", progress=0,
            current_step="Waiting to start", spec=spec, format=settings["format"], resolution=res,
            width=width, height=height, watermarked=limits.watermark,
        )
        self.db.add(render)
        await self.db.flush()
        # The worker reads the render on its own connection, so it must be committed first.
        await self.db.commit()
        try:
            from app.utils import servicebus

            await servicebus.enqueue_render(str(render.render_id))
        except Exception:
            logger.exception("Could not queue render %s", render.render_id)
            render.status = "failed"
            render.error_message = "Rendering couldn't start. Please try again."
            await self.db.execute(
                text("UPDATE users SET monthly_render_count = GREATEST(0, monthly_render_count - 1) WHERE user_id = :uid"),
                {"uid": str(user.user_id)},
            )
            await self.db.commit()
            raise HTTPException(status_code=503, detail="Rendering couldn't start. Please try again.")
        return render

    async def _delete_render_files(self, render: Render) -> None:
        if render.output_path and GCSClient.is_enabled():
            try:
                await asyncio.to_thread(GCSClient.get().delete_prefix, f"clips/renders/{render.user_id}/{render.render_id}/")
            except Exception:
                logger.exception("Could not delete files for render %s", render.render_id)
        if render.size_bytes and render.status == "ready":
            await self.storage.update_storage_used(render.user_id, -render.size_bytes)

    async def delete_render(self, render: Render) -> None:
        if render.status in ("queued", "rendering"):
            raise HTTPException(status_code=409, detail="Wait for this render to finish before deleting it.")
        await self._delete_render_files(render)
        await self.db.delete(render)

    async def mark_stalled_renders(self, user_id: UUID) -> None:
        now = datetime.now(timezone.utc)
        await self.db.execute(
            text(
                "UPDATE renders SET status = 'failed', error_message = :msg, completed_at = now() "
                "WHERE user_id = :uid AND ((status = 'rendering' AND updated_at < :stall) "
                "OR (status = 'queued' AND created_at < :queued))"
            ),
            {"uid": str(user_id), "msg": RENDER_STALLED_MESSAGE, "stall": now - RENDER_STALL, "queued": now - QUEUED_STALL},
        )

    # ------------------------------------------------------------------ assets
    async def _asset(self, asset_id: UUID, user_id: UUID) -> UserAsset | None:
        return (await self.db.execute(
            select(UserAsset).where(UserAsset.asset_id == asset_id, UserAsset.user_id == user_id, UserAsset.deleted_at.is_(None))
        )).scalar_one_or_none()

    async def get_asset(self, asset_id: UUID, user_id: UUID) -> UserAsset:
        asset = await self._asset(asset_id, user_id)
        if not asset:
            raise _not_found("File")
        return asset

    async def list_assets(self, user_id: UUID, kind: str | None) -> list[UserAsset]:
        query = select(UserAsset).where(
            UserAsset.user_id == user_id, UserAsset.deleted_at.is_(None), UserAsset.status == "ready"
        )
        if kind:
            query = query.where(UserAsset.kind == kind)
        return list((await self.db.execute(query.order_by(UserAsset.created_at.desc()).limit(100))).scalars().all())

    async def create_asset_upload(self, user: User, req: AssetUploadRequest) -> tuple[UserAsset, str]:
        rule = ASSET_RULES[req.kind]
        content_type = req.content_type.lower().split(";")[0].strip()
        if content_type not in rule["types"]:
            raise HTTPException(status_code=400, detail=f"Upload a {rule['label']}.")
        if req.size_bytes > rule["max_bytes"]:
            raise HTTPException(status_code=400, detail=f"That file is too large. Upload a {rule['label']}.")
        if req.kind == "music" and not req.rights_confirmed:
            raise HTTPException(status_code=400, detail="Confirm you have the rights to use this music.")
        if user.storage_used_bytes + req.size_bytes > user.storage_limit_bytes:
            raise HTTPException(status_code=403, detail="Not enough storage for this file.")
        if not GCSClient.is_enabled():
            raise HTTPException(status_code=503, detail="Uploads aren't available right now.")
        asset_id = uuid.uuid4()
        asset = UserAsset(
            asset_id=asset_id, user_id=user.user_id, kind=req.kind, filename=req.filename[:255],
            content_type=content_type, size_bytes=req.size_bytes, status="pending",
            blob_path=f"clips/assets/{user.user_id}/{asset_id}/{_safe_filename(req.filename)}",
            rights_confirmed_at=datetime.now(timezone.utc) if req.kind == "music" else None,
        )
        self.db.add(asset)
        await self.db.flush()
        return asset, GCSClient.get().generate_upload_sas(asset.blob_path)

    async def finalize_asset(self, asset: UserAsset) -> UserAsset:
        if asset.status == "ready":
            return asset
        client = GCSClient.get()
        if not await asyncio.to_thread(client.blob_exists, asset.blob_path):
            raise HTTPException(status_code=400, detail="The upload didn't finish. Try again.")
        size = await asyncio.to_thread(client.get_blob_size, asset.blob_path)
        if size > ASSET_RULES[asset.kind]["max_bytes"]:
            await asyncio.to_thread(client.delete_prefix, asset.blob_path)
            raise HTTPException(status_code=400, detail="That file is too large.")
        if not await self.storage.try_reserve_storage(asset.user_id, size):
            await asyncio.to_thread(client.delete_prefix, asset.blob_path)
            raise HTTPException(status_code=403, detail="Not enough storage for this file.")
        asset.size_bytes = size
        asset.status = "ready"
        await self.db.flush()
        return asset

    async def delete_asset(self, asset: UserAsset) -> None:
        if GCSClient.is_enabled():
            try:
                await asyncio.to_thread(GCSClient.get().delete_prefix, f"clips/assets/{asset.user_id}/{asset.asset_id}/")
            except Exception:
                logger.exception("Could not delete asset %s", asset.asset_id)
        if asset.status == "ready":
            await self.storage.update_storage_used(asset.user_id, -asset.size_bytes)
        asset.deleted_at = datetime.now(timezone.utc)
