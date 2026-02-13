from datetime import datetime, timezone

from tests.factories import create_frame, create_search_history, create_video

URL = "/api/v1/analytics/dashboard"


class TestDashboard:
    async def test_dashboard_empty(self, client, test_user):
        resp = await client.get(URL, headers=test_user["headers"])
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["total_videos"] == 0
        assert data["total_frames"] == 0
        assert data["total_searches"] == 0

    async def test_dashboard_with_videos(self, client, db_session, test_user):
        await create_video(db_session, test_user["user_id"], status="uploaded")
        await create_video(db_session, test_user["user_id"], status="ready")
        await create_video(db_session, test_user["user_id"], status="queued")

        resp = await client.get(URL, headers=test_user["headers"])
        data = resp.json()["data"]
        assert data["total_videos"] == 3
        assert data["ready_videos"] == 1
        assert data["processing_videos"] == 1  # queued counts as processing

    async def test_dashboard_with_frames(self, client, db_session, test_user):
        video = await create_video(db_session, test_user["user_id"])
        for i in range(5):
            await create_frame(db_session, video.video_id, test_user["user_id"], frame_index=i, timestamp_seconds=i * 2.0)

        resp = await client.get(URL, headers=test_user["headers"])
        assert resp.json()["data"]["total_frames"] == 5

    async def test_dashboard_with_searches(self, client, db_session, test_user):
        await create_search_history(db_session, test_user["user_id"])
        await create_search_history(db_session, test_user["user_id"])

        resp = await client.get(URL, headers=test_user["headers"])
        assert resp.json()["data"]["total_searches"] == 2

    async def test_dashboard_storage_percentage(self, client, db_session, test_user):
        user = test_user["user"]
        user.storage_used_bytes = 1073741824  # 1 GB
        user.storage_limit_bytes = 5368709120  # 5 GB
        await db_session.flush()
        await db_session.commit()

        resp = await client.get(URL, headers=test_user["headers"])
        data = resp.json()["data"]
        assert data["storage_used_bytes"] == 1073741824
        assert data["storage_used_percentage"] == 20.0

    async def test_dashboard_excludes_deleted(self, client, db_session, test_user):
        await create_video(db_session, test_user["user_id"], title="Active")
        await create_video(db_session, test_user["user_id"], title="Deleted", deleted_at=datetime.now(timezone.utc))

        resp = await client.get(URL, headers=test_user["headers"])
        assert resp.json()["data"]["total_videos"] == 1

    async def test_dashboard_unauthenticated(self, client):
        resp = await client.get(URL)
        assert resp.status_code == 403
