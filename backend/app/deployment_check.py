"""Explicit production smoke check; run as a manual Container Apps job.

Uses a disposable account and an eight-second synthetic clip. This checks deployed
infrastructure and the actual API, but does not replace Google browser sign-in QA.
Only this check's account, media and session are removed on completion.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import httpx
from sqlalchemy import delete, text

from app.config import settings
from app.database import async_session, engine
from app.models.user import User
from app.services.auth_service import AuthService
from app.services.video_service import VideoService
from app.repositories.vector_db import vector_db


async def run() -> None:
    settings.validate_runtime()
    uid = uuid4()
    video_id = None
    tokens = None
    finished = False
    async with async_session() as db:
        await db.execute(text("SELECT 1"))
        user = User(user_id=uid, email=f"smoke-{uid}@example.invalid", name="Deployment smoke check",
                    tos_accepted_at=datetime.now(timezone.utc))
        db.add(user)
        await db.commit()
        tokens = await AuthService(db).issue_session(user)
    print("PASS PostgreSQL TLS and Redis session issuance", flush=True)
    try:
        async with httpx.AsyncClient(base_url=settings.FRONTEND_URL, timeout=60,
                                    cookies={settings.ACCESS_COOKIE_NAME: tokens.access_token,
                                             settings.REFRESH_COOKIE_NAME: tokens.refresh_token}) as client:
            async def api(method, path, **kwargs):
                response = await client.request(method, f"/api/v1{path}", **kwargs)
                if response.status_code >= 400:
                    raise RuntimeError(f"API {method} {path} failed: HTTP {response.status_code}")
                return response.json()["data"]

            await api("GET", "/auth/me")
            await api("POST", "/auth/refresh")
            print("PASS same-origin API, cookies and session rotation", flush=True)
            content = (Path(__file__).parent / "assets" / "deployment-sample.mp4").read_bytes()
            upload = await api("POST", "/videos/upload-url", json={
                "filename": "deployment-smoke.mp4", "size_bytes": len(content), "content_type": "video/mp4"})
            from uuid import UUID
            video_id = UUID(upload["video_id"])
            async with httpx.AsyncClient(timeout=60) as storage:
                response = await storage.put(upload["upload_url"], content=content,
                                             headers={"Content-Type": "video/mp4", "x-ms-blob-type": "BlockBlob"})
                if response.status_code != 201:
                    raise RuntimeError(f"Blob upload failed: HTTP {response.status_code}")
            await api("POST", f"/videos/{video_id}/finalize")
            print("PASS delegated Blob upload and Service Bus enqueue", flush=True)
            for _ in range(120):
                video = (await api("GET", f"/videos/{video_id}"))["video"]
                if video["status"] == "error":
                    finished = True
                    raise RuntimeError("Video processing failed; inspect worker logs")
                if video["status"] == "ready":
                    finished = True
                    break
                await asyncio.sleep(5)
            else:
                raise RuntimeError(f"Worker timeout; retained check account {uid} and video {video_id} for diagnosis")
            if video["transcript_status"] != "completed":
                raise RuntimeError("Whisper transcription did not complete")
            print("PASS worker scaling, frame extraction, Vision embeddings and Whisper transcription", flush=True)
            result = await api("POST", "/search", json={"query": "red screen", "video_ids": [str(video_id)]})
            if not result["results"]:
                raise RuntimeError("Visual search returned no results")
            if result["results"][0]["timestamp_seconds"] < 4:
                raise RuntimeError("Visual search did not rank the red scene first")
            async with httpx.AsyncClient(timeout=30) as storage:
                response = await storage.get(video["video_url"], headers={"Range": "bytes=0-1023"})
                if response.status_code != 206:
                    raise RuntimeError(f"Video range request failed: HTTP {response.status_code}")
                response = await storage.get(result["results"][0]["frame_url"])
                if response.status_code != 200:
                    raise RuntimeError(f"Frame retrieval failed: HTTP {response.status_code}")
            print("PASS pgvector search, signed frame access and video byte-range playback", flush=True)
            await api("POST", "/auth/logout")
            print("PASS logout", flush=True)
    finally:
        # A timed-out worker may still own the video. Preserve it for diagnosis.
        if video_id is None or finished:
            async with async_session() as db:
                if video_id:
                    await VideoService(db).delete_video(video_id, uid)
                vector_db.delete_collection(str(uid))
                await db.execute(delete(User).where(User.user_id == uid))
                await db.commit()
                if tokens:
                    await AuthService(db).logout(tokens.refresh_token)
            print("Removed disposable smoke-check data", flush=True)
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run())
