import io
import uuid
from datetime import datetime, timezone

from tests.factories import create_frame, create_job, create_video

URL = "/api/v1/videos"


def _upload_form(*, title: str | None = None, folder_id: str | None = None, auto_process: bool = False):
    """Helper to build multipart upload kwargs."""
    data = {"auto_process": str(auto_process).lower()}
    if title is not None:
        data["title"] = title
    if folder_id is not None:
        data["folder_id"] = folder_id
    files = {"file": ("sample.mp4", io.BytesIO(b"\x00" * 1024), "video/mp4")}
    return {"data": data, "files": files}


# ── List Videos ─────────────────────────────────────────────────────────────

class TestListVideos:
    async def test_list_empty(self, client, test_user):
        resp = await client.get(URL, headers=test_user["headers"])
        assert resp.status_code == 200
        body = resp.json()["data"]
        assert body["videos"] == []
        assert body["pagination"]["total"] == 0

    async def test_list_returns_user_videos(self, client, db_session, test_user):
        await create_video(db_session, test_user["user_id"], title="V1")
        await create_video(db_session, test_user["user_id"], title="V2")

        resp = await client.get(URL, headers=test_user["headers"])
        assert resp.status_code == 200
        videos = resp.json()["data"]["videos"]
        assert len(videos) == 2

    async def test_list_excludes_deleted(self, client, db_session, test_user):
        await create_video(db_session, test_user["user_id"], title="Active")
        await create_video(db_session, test_user["user_id"], title="Deleted", deleted_at=datetime.now(timezone.utc))

        resp = await client.get(URL, headers=test_user["headers"])
        videos = resp.json()["data"]["videos"]
        assert len(videos) == 1
        assert videos[0]["title"] == "Active"

    async def test_list_user_isolation(self, client, db_session, test_user, second_user):
        await create_video(db_session, test_user["user_id"], title="Alice's")
        await create_video(db_session, second_user["user_id"], title="Bob's")

        resp = await client.get(URL, headers=test_user["headers"])
        videos = resp.json()["data"]["videos"]
        assert len(videos) == 1
        assert videos[0]["title"] == "Alice's"

    async def test_list_filter_by_status(self, client, db_session, test_user):
        await create_video(db_session, test_user["user_id"], title="Uploaded", status="uploaded")
        await create_video(db_session, test_user["user_id"], title="Ready", status="ready")

        resp = await client.get(URL, params={"status": "ready"}, headers=test_user["headers"])
        videos = resp.json()["data"]["videos"]
        assert len(videos) == 1
        assert videos[0]["title"] == "Ready"

    async def test_list_filter_by_folder(self, client, db_session, test_user, test_folder):
        await create_video(db_session, test_user["user_id"], title="In folder", folder_id=test_folder.folder_id)
        await create_video(db_session, test_user["user_id"], title="No folder")

        resp = await client.get(URL, params={"folder_id": str(test_folder.folder_id)}, headers=test_user["headers"])
        videos = resp.json()["data"]["videos"]
        assert len(videos) == 1
        assert videos[0]["title"] == "In folder"

    async def test_list_filter_by_source_type(self, client, db_session, test_user):
        await create_video(db_session, test_user["user_id"], title="Local", source_type="local")
        await create_video(db_session, test_user["user_id"], title="YouTube", source_type="youtube")

        resp = await client.get(URL, params={"source_type": "youtube"}, headers=test_user["headers"])
        videos = resp.json()["data"]["videos"]
        assert len(videos) == 1
        assert videos[0]["title"] == "YouTube"

    async def test_list_pagination(self, client, db_session, test_user):
        for i in range(5):
            await create_video(db_session, test_user["user_id"], title=f"V{i}")

        resp = await client.get(URL, params={"page": 1, "limit": 2}, headers=test_user["headers"])
        body = resp.json()["data"]
        assert len(body["videos"]) == 2
        assert body["pagination"]["total"] == 5
        assert body["pagination"]["total_pages"] == 3

    async def test_list_sort(self, client, db_session, test_user):
        await create_video(db_session, test_user["user_id"], title="Bravo")
        await create_video(db_session, test_user["user_id"], title="Alpha")

        resp = await client.get(URL, params={"sort": "title", "order": "asc"}, headers=test_user["headers"])
        videos = resp.json()["data"]["videos"]
        assert videos[0]["title"] == "Alpha"
        assert videos[1]["title"] == "Bravo"

    async def test_list_unauthenticated(self, client):
        resp = await client.get(URL)
        assert resp.status_code == 403


# ── Upload ──────────────────────────────────────────────────────────────────

class TestUploadVideo:
    async def test_upload_success(self, client, test_user):
        resp = await client.post(URL, headers=test_user["headers"], **_upload_form())
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["video"]["status"] == "uploaded"
        assert data["video"]["original_filename"] == "sample.mp4"

    async def test_upload_custom_title(self, client, test_user):
        resp = await client.post(URL, headers=test_user["headers"], **_upload_form(title="My Title"))
        assert resp.json()["data"]["video"]["title"] == "My Title"

    async def test_upload_default_title_from_filename(self, client, test_user):
        resp = await client.post(URL, headers=test_user["headers"], **_upload_form())
        assert resp.json()["data"]["video"]["title"] == "sample"

    async def test_upload_with_folder(self, client, test_user, test_folder):
        resp = await client.post(
            URL, headers=test_user["headers"],
            **_upload_form(folder_id=str(test_folder.folder_id)),
        )
        assert resp.json()["data"]["video"]["folder_id"] == str(test_folder.folder_id)

    async def test_upload_with_auto_process(self, client, test_user):
        resp = await client.post(URL, headers=test_user["headers"], **_upload_form(auto_process=True))
        data = resp.json()["data"]
        assert data["job"] is not None
        assert data["job"]["status"] == "queued"

    async def test_upload_file_saved_to_disk(self, client, test_user):
        resp = await client.post(URL, headers=test_user["headers"], **_upload_form())
        assert resp.status_code == 200
        # Metadata extraction was called
        client.mock_extract_metadata.assert_called()

    async def test_upload_metadata_extracted(self, client, test_user):
        resp = await client.post(URL, headers=test_user["headers"], **_upload_form())
        video = resp.json()["data"]["video"]
        assert video["width"] == 1920
        assert video["height"] == 1080
        assert video["codec"] == "h264"

    async def test_upload_unauthenticated(self, client):
        resp = await client.post(URL, **_upload_form())
        assert resp.status_code == 403


# ── Video Detail ────────────────────────────────────────────────────────────

class TestVideoDetail:
    async def test_detail_success(self, client, test_user, test_video):
        resp = await client.get(f"{URL}/{test_video.video_id}", headers=test_user["headers"])
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["video"]["video_id"] == str(test_video.video_id)
        assert "frames_count" in data

    async def test_detail_not_found(self, client, test_user):
        fake_id = uuid.uuid4()
        resp = await client.get(f"{URL}/{fake_id}", headers=test_user["headers"])
        assert resp.status_code == 404

    async def test_detail_other_user(self, client, test_user, second_user, db_session):
        video = await create_video(db_session, second_user["user_id"], title="Bob's Video")
        resp = await client.get(f"{URL}/{video.video_id}", headers=test_user["headers"])
        assert resp.status_code == 404

    async def test_detail_with_active_job(self, client, test_user, test_video, test_job):
        resp = await client.get(f"{URL}/{test_video.video_id}", headers=test_user["headers"])
        data = resp.json()["data"]
        assert data["job"] is not None
        assert data["job"]["status"] == "queued"

    async def test_detail_frames_count(self, client, db_session, test_user, test_video):
        for i in range(3):
            await create_frame(db_session, test_video.video_id, test_user["user_id"], frame_index=i, timestamp_seconds=i * 2.0)
        resp = await client.get(f"{URL}/{test_video.video_id}", headers=test_user["headers"])
        assert resp.json()["data"]["frames_count"] == 3

    async def test_detail_deleted_not_found(self, client, db_session, test_user):
        video = await create_video(db_session, test_user["user_id"], title="Deleted", deleted_at=datetime.now(timezone.utc))
        resp = await client.get(f"{URL}/{video.video_id}", headers=test_user["headers"])
        assert resp.status_code == 404


# ── Delete Video ────────────────────────────────────────────────────────────

class TestDeleteVideo:
    async def test_delete_success(self, client, test_user, test_video):
        resp = await client.delete(f"{URL}/{test_video.video_id}", headers=test_user["headers"])
        assert resp.status_code == 200
        assert resp.json()["data"]["success"] is True

        # Verify it's gone from listing
        list_resp = await client.get(URL, headers=test_user["headers"])
        assert len(list_resp.json()["data"]["videos"]) == 0

    async def test_delete_not_found(self, client, test_user):
        resp = await client.delete(f"{URL}/{uuid.uuid4()}", headers=test_user["headers"])
        assert resp.status_code == 404

    async def test_delete_other_user(self, client, test_user, second_user, db_session):
        video = await create_video(db_session, second_user["user_id"])
        resp = await client.delete(f"{URL}/{video.video_id}", headers=test_user["headers"])
        assert resp.status_code == 404

    async def test_delete_idempotent(self, client, test_user, test_video):
        await client.delete(f"{URL}/{test_video.video_id}", headers=test_user["headers"])
        resp = await client.delete(f"{URL}/{test_video.video_id}", headers=test_user["headers"])
        assert resp.status_code == 404


# ── Process Video ───────────────────────────────────────────────────────────

class TestProcessVideo:
    async def test_process_success(self, client, test_user, test_video):
        resp = await client.post(f"{URL}/{test_video.video_id}/process", headers=test_user["headers"])
        assert resp.status_code == 200
        job = resp.json()["data"]["job"]
        assert job["status"] == "queued"

    async def test_process_custom_interval(self, client, test_user, test_video):
        resp = await client.post(
            f"{URL}/{test_video.video_id}/process",
            json={"frame_interval": 5.0},
            headers=test_user["headers"],
        )
        assert resp.status_code == 200

    async def test_process_already_processing(self, client, db_session, test_user):
        video = await create_video(db_session, test_user["user_id"], status="processing")
        resp = await client.post(f"{URL}/{video.video_id}/process", headers=test_user["headers"])
        assert resp.status_code == 409

    async def test_process_active_job_exists(self, client, test_user, test_video, test_job):
        # test_job already makes the video queued
        resp = await client.post(f"{URL}/{test_video.video_id}/process", headers=test_user["headers"])
        assert resp.status_code == 409

    async def test_process_not_found(self, client, test_user):
        resp = await client.post(f"{URL}/{uuid.uuid4()}/process", headers=test_user["headers"])
        assert resp.status_code == 404

    async def test_process_other_user(self, client, test_user, second_user, db_session):
        video = await create_video(db_session, second_user["user_id"])
        resp = await client.post(f"{URL}/{video.video_id}/process", headers=test_user["headers"])
        assert resp.status_code == 404

    async def test_process_invalid_interval(self, client, test_user, test_video):
        resp = await client.post(
            f"{URL}/{test_video.video_id}/process",
            json={"frame_interval": 0.1},
            headers=test_user["headers"],
        )
        assert resp.status_code == 422


# ── Frames ──────────────────────────────────────────────────────────────────

class TestListFrames:
    async def test_frames_success(self, client, db_session, test_user, test_video):
        for i in range(3):
            await create_frame(db_session, test_video.video_id, test_user["user_id"], frame_index=i, timestamp_seconds=i * 2.0)

        resp = await client.get(f"{URL}/{test_video.video_id}/frames", headers=test_user["headers"])
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data["frames"]) == 3
        assert data["pagination"]["total"] == 3

    async def test_frames_empty(self, client, test_user, test_video):
        resp = await client.get(f"{URL}/{test_video.video_id}/frames", headers=test_user["headers"])
        assert resp.status_code == 200
        assert resp.json()["data"]["frames"] == []

    async def test_frames_pagination(self, client, db_session, test_user, test_video):
        for i in range(5):
            await create_frame(db_session, test_video.video_id, test_user["user_id"], frame_index=i, timestamp_seconds=i * 2.0)

        resp = await client.get(f"{URL}/{test_video.video_id}/frames", params={"limit": 2}, headers=test_user["headers"])
        data = resp.json()["data"]
        assert len(data["frames"]) == 2
        assert data["pagination"]["total"] == 5

    async def test_frames_other_user(self, client, test_user, second_user, db_session):
        video = await create_video(db_session, second_user["user_id"])
        resp = await client.get(f"{URL}/{video.video_id}/frames", headers=test_user["headers"])
        assert resp.status_code == 404

    async def test_frames_ordered_by_index(self, client, db_session, test_user, test_video):
        # Insert out of order
        await create_frame(db_session, test_video.video_id, test_user["user_id"], frame_index=2, timestamp_seconds=4.0)
        await create_frame(db_session, test_video.video_id, test_user["user_id"], frame_index=0, timestamp_seconds=0.0)
        await create_frame(db_session, test_video.video_id, test_user["user_id"], frame_index=1, timestamp_seconds=2.0)

        resp = await client.get(f"{URL}/{test_video.video_id}/frames", headers=test_user["headers"])
        frames = resp.json()["data"]["frames"]
        indices = [f["frame_index"] for f in frames]
        assert indices == [0, 1, 2]
