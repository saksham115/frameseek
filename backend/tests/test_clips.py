from pathlib import Path
from unittest.mock import Mock

import pytest
from sqlalchemy import select

from app.models.clip import Clip
from app.models.user import User
from tests.factories import create_video


async def source_video(db, uid, seconds=8):
    video = await create_video(db, uid, status="ready", duration_seconds=seconds)
    video.file_path = None
    video.gcs_path = f"videos/{uid}/{video.video_id}/original.mp4"
    await db.commit()
    return video


@pytest.fixture
def renderer(client, monkeypatch):
    paths = []
    def download(source, destination):
        paths.append(Path(destination).parent)
        Path(destination).write_bytes(b"source")
    def render(command, **kwargs):
        Path(command[-1]).write_bytes(b"x" * (1024 if command[-1].endswith(".mp4") else 20))
    client.mock_blob.download_file.side_effect = download
    monkeypatch.setattr("app.services.clip_service.subprocess.run", Mock(side_effect=render))
    return paths


async def test_export_download_and_delete_are_owned_and_accounted(client, db_session, test_user, second_user, renderer):
    video = await source_video(db_session, test_user["user_id"])
    response = await client.post("/api/v1/clips", headers=test_user["headers"], json={
        "video_id": str(video.video_id), "title": 'Red scene\r\n"export', "start_time": 4, "end_time": 6,
    })
    assert response.status_code == 200
    clip = response.json()["data"]
    assert float(clip["duration_seconds"]) == 2
    assert clip["file_path"] is None
    assert all(not p.exists() for p in renderer)
    cid = clip["clip_id"]
    me = await client.get("/api/v1/auth/me", headers=test_user["headers"])
    assert me.json()["data"]["storage_used_bytes"] == 1024

    download = await client.get(f"/api/v1/clips/{cid}/download-url", headers=test_user["headers"])
    assert download.status_code == 200
    assert download.json()["data"]["filename"] == "Red scene_export.mp4"
    assert client.mock_blob.generate_signed_url.call_args.kwargs["content_disposition"] == 'attachment; filename="Red scene_export.mp4"'
    for path in (f"/api/v1/clips/{cid}", f"/api/v1/clips/{cid}/download-url"):
        assert (await client.get(path, headers=second_user["headers"])).status_code == 404
    assert (await client.delete(f"/api/v1/clips/{cid}", headers=second_user["headers"])).status_code == 404
    assert (await client.get(f"/api/v1/clips/{cid}/download-url")).status_code == 401
    assert (await client.delete(f"/api/v1/clips/{cid}", headers=test_user["headers"])).status_code == 200
    me = await client.get("/api/v1/auth/me", headers=test_user["headers"])
    assert me.json()["data"]["storage_used_bytes"] == 0
    assert (await client.get(f"/api/v1/clips/{cid}/download-url", headers=test_user["headers"])).status_code == 404


@pytest.mark.parametrize("start,end,expected", [(-1, 2, 422), (4, 4, 400), (6, 4, 400), (0, 121, 400), (0, 201, 400)])
async def test_invalid_range_never_downloads_source(client, db_session, test_user, start, end, expected):
    video = await source_video(db_session, test_user["user_id"], seconds=200)
    response = await client.post("/api/v1/clips", headers=test_user["headers"], json={
        "video_id": str(video.video_id), "title": "Test", "start_time": start, "end_time": end,
    })
    assert response.status_code == expected
    client.mock_blob.download_file.assert_not_called()


async def test_export_respects_storage_quota(client, db_session, test_user, renderer):
    video = await source_video(db_session, test_user["user_id"])
    user = await db_session.get(User, test_user["user_id"])
    user.storage_limit_bytes = 10
    await db_session.commit()
    response = await client.post("/api/v1/clips", headers=test_user["headers"], json={
        "video_id": str(video.video_id), "title": "Test", "start_time": 4, "end_time": 6,
    })
    assert response.status_code == 403
    client.mock_blob.upload_file.assert_not_called()
    assert (await db_session.execute(select(Clip).where(Clip.video_id == video.video_id))).scalars().all() == []
    await db_session.refresh(user)
    assert user.storage_used_bytes == 0
    assert all(not p.exists() for p in renderer)


async def test_failed_blob_upload_rolls_back_clip_and_quota(client, db_session, test_user, renderer):
    video = await source_video(db_session, test_user["user_id"])
    client.mock_blob.upload_file.side_effect = RuntimeError("Storage unavailable")
    response = await client.post("/api/v1/clips", headers=test_user["headers"], json={
        "video_id": str(video.video_id), "title": "Test", "start_time": 4, "end_time": 6,
    })
    assert response.status_code == 503
    client.mock_blob.delete_prefix.assert_called_once()
    assert (await db_session.execute(select(Clip).where(Clip.video_id == video.video_id))).scalars().all() == []
    user = await db_session.get(User, test_user["user_id"])
    await db_session.refresh(user)
    assert user.storage_used_bytes == 0
    assert all(not p.exists() for p in renderer)
