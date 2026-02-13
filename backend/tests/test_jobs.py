import uuid
from datetime import datetime, timezone

from tests.factories import create_job, create_video

URL = "/api/v1/jobs"


# ── List Jobs ───────────────────────────────────────────────────────────────

class TestListJobs:
    async def test_list_empty(self, client, test_user):
        resp = await client.get(URL, headers=test_user["headers"])
        assert resp.status_code == 200
        body = resp.json()["data"]
        assert body["jobs"] == []
        assert body["pagination"]["total"] == 0

    async def test_list_returns_jobs(self, client, db_session, test_user):
        video = await create_video(db_session, test_user["user_id"])
        await create_job(db_session, test_user["user_id"], video.video_id, status="queued")
        await create_job(db_session, test_user["user_id"], video.video_id, status="completed")

        resp = await client.get(URL, headers=test_user["headers"])
        assert len(resp.json()["data"]["jobs"]) == 2

    async def test_list_user_isolation(self, client, db_session, test_user, second_user):
        v1 = await create_video(db_session, test_user["user_id"])
        v2 = await create_video(db_session, second_user["user_id"])
        await create_job(db_session, test_user["user_id"], v1.video_id)
        await create_job(db_session, second_user["user_id"], v2.video_id)

        resp = await client.get(URL, headers=test_user["headers"])
        assert len(resp.json()["data"]["jobs"]) == 1

    async def test_list_filter_by_status(self, client, db_session, test_user):
        video = await create_video(db_session, test_user["user_id"])
        await create_job(db_session, test_user["user_id"], video.video_id, status="queued")
        await create_job(db_session, test_user["user_id"], video.video_id, status="completed")

        resp = await client.get(URL, params={"status": "queued"}, headers=test_user["headers"])
        jobs = resp.json()["data"]["jobs"]
        assert len(jobs) == 1
        assert jobs[0]["status"] == "queued"

    async def test_list_filter_by_video(self, client, db_session, test_user):
        v1 = await create_video(db_session, test_user["user_id"], title="V1")
        v2 = await create_video(db_session, test_user["user_id"], title="V2")
        await create_job(db_session, test_user["user_id"], v1.video_id)
        await create_job(db_session, test_user["user_id"], v2.video_id)

        resp = await client.get(URL, params={"video_id": str(v1.video_id)}, headers=test_user["headers"])
        jobs = resp.json()["data"]["jobs"]
        assert len(jobs) == 1

    async def test_list_pagination(self, client, db_session, test_user):
        video = await create_video(db_session, test_user["user_id"])
        for _ in range(5):
            await create_job(db_session, test_user["user_id"], video.video_id)

        resp = await client.get(URL, params={"page": 1, "limit": 2}, headers=test_user["headers"])
        body = resp.json()["data"]
        assert len(body["jobs"]) == 2
        assert body["pagination"]["total"] == 5


# ── Job Detail ──────────────────────────────────────────────────────────────

class TestJobDetail:
    async def test_detail_success(self, client, test_user, test_job):
        resp = await client.get(f"{URL}/{test_job.job_id}", headers=test_user["headers"])
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["job_id"] == str(test_job.job_id)
        assert data["status"] == "queued"

    async def test_detail_not_found(self, client, test_user):
        resp = await client.get(f"{URL}/{uuid.uuid4()}", headers=test_user["headers"])
        assert resp.status_code == 404

    async def test_detail_other_user(self, client, db_session, test_user, second_user):
        video = await create_video(db_session, second_user["user_id"])
        job = await create_job(db_session, second_user["user_id"], video.video_id)
        resp = await client.get(f"{URL}/{job.job_id}", headers=test_user["headers"])
        assert resp.status_code == 404


# ── Cancel Job ──────────────────────────────────────────────────────────────

class TestCancelJob:
    async def test_cancel_queued_job(self, client, test_user, test_job):
        resp = await client.post(f"{URL}/{test_job.job_id}/cancel", headers=test_user["headers"])
        assert resp.status_code == 200
        assert resp.json()["data"]["success"] is True
        assert resp.json()["data"]["job"]["status"] == "cancelled"

    async def test_cancel_processing_job(self, client, db_session, test_user):
        video = await create_video(db_session, test_user["user_id"], status="processing")
        job = await create_job(db_session, test_user["user_id"], video.video_id, status="processing")

        resp = await client.post(f"{URL}/{job.job_id}/cancel", headers=test_user["headers"])
        assert resp.status_code == 200
        assert resp.json()["data"]["job"]["status"] == "cancelled"

    async def test_cancel_completed_job(self, client, db_session, test_user):
        video = await create_video(db_session, test_user["user_id"])
        job = await create_job(db_session, test_user["user_id"], video.video_id, status="completed")

        resp = await client.post(f"{URL}/{job.job_id}/cancel", headers=test_user["headers"])
        assert resp.status_code == 400

    async def test_cancel_failed_job(self, client, db_session, test_user):
        video = await create_video(db_session, test_user["user_id"])
        job = await create_job(db_session, test_user["user_id"], video.video_id, status="failed")

        resp = await client.post(f"{URL}/{job.job_id}/cancel", headers=test_user["headers"])
        assert resp.status_code == 400

    async def test_cancel_already_cancelled(self, client, db_session, test_user):
        video = await create_video(db_session, test_user["user_id"])
        job = await create_job(db_session, test_user["user_id"], video.video_id, status="cancelled")

        resp = await client.post(f"{URL}/{job.job_id}/cancel", headers=test_user["headers"])
        assert resp.status_code == 400

    async def test_cancel_not_found(self, client, test_user):
        resp = await client.post(f"{URL}/{uuid.uuid4()}/cancel", headers=test_user["headers"])
        assert resp.status_code == 404

    async def test_cancel_other_user(self, client, db_session, test_user, second_user):
        video = await create_video(db_session, second_user["user_id"], status="queued")
        job = await create_job(db_session, second_user["user_id"], video.video_id, status="queued")

        resp = await client.post(f"{URL}/{job.job_id}/cancel", headers=test_user["headers"])
        assert resp.status_code == 404

    async def test_cancel_reverts_video_status(self, client, db_session, test_user, test_video, test_job):
        """Cancelling a job should revert the video status to 'uploaded'."""
        assert test_video.status == "queued"  # set by test_job fixture
        await client.post(f"{URL}/{test_job.job_id}/cancel", headers=test_user["headers"])

        await db_session.refresh(test_video)
        assert test_video.status == "uploaded"


# ── Progress SSE ────────────────────────────────────────────────────────────

class TestJobProgressSSE:
    async def test_progress_returns_stream(self, client, db_session, test_user):
        video = await create_video(db_session, test_user["user_id"], status="ready")
        job = await create_job(db_session, test_user["user_id"], video.video_id, status="completed")

        resp = await client.get(f"{URL}/{job.job_id}/progress", headers=test_user["headers"])
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        # Completed job should send final event and close
        assert "event: progress" in resp.text
        assert '"status": "completed"' in resp.text
