import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

from tests.factories import create_search_history, create_user, create_video

URL = "/api/v1/search"


def _make_mock_result(video_id: str | None = None, score: float = 0.85):
    """Create a mock Qdrant search result."""
    vid = video_id or str(uuid.uuid4())
    r = MagicMock()
    r.frame_id = str(uuid.uuid4())
    r.video_id = vid
    r.timestamp = 12.5
    r.score = score
    r.payload = {
        "video_title": "Test Video",
        "frame_path": "test/frame.jpg",
        "source_type": "local",
        "frame_id": r.frame_id,
        "video_id": vid,
        "timestamp_seconds": 12.5,
    }
    return r


# ── Search ──────────────────────────────────────────────────────────────────

class TestSearch:
    async def test_search_empty_results(self, client, test_user):
        resp = await client.post(URL, json={"query": "find a dog"}, headers=test_user["headers"])
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["results"] == []
        assert data["count"] == 0

    async def test_search_with_mock_results(self, client, test_user):
        client.mock_vector_db.search.return_value = [_make_mock_result(), _make_mock_result()]
        resp = await client.post(URL, json={"query": "sunset beach"}, headers=test_user["headers"])
        data = resp.json()["data"]
        assert data["count"] == 2
        assert len(data["results"]) == 2
        assert data["results"][0]["score"] > 0

    async def test_search_increments_quota(self, client, db_session, test_user):
        await client.post(URL, json={"query": "test search"}, headers=test_user["headers"])
        await db_session.refresh(test_user["user"])
        assert test_user["user"].daily_search_count >= 1

    async def test_search_records_history(self, client, db_session, test_user):
        await client.post(URL, json={"query": "recorded query"}, headers=test_user["headers"])

        hist_resp = await client.get(f"{URL}/history", headers=test_user["headers"])
        history = hist_resp.json()["data"]["history"]
        assert len(history) >= 1
        assert any(h["query"] == "recorded query" for h in history)

    async def test_search_quota_exceeded(self, client, db_session, test_user):
        user = test_user["user"]
        user.daily_search_count = 50
        user.daily_search_limit = 50
        user.search_count_reset_at = datetime.now(timezone.utc)
        await db_session.flush()
        await db_session.commit()

        resp = await client.post(URL, json={"query": "over limit"}, headers=test_user["headers"])
        assert resp.status_code == 429

    async def test_search_daily_reset(self, client, db_session, test_user):
        """Quota resets when the date rolls over."""
        user = test_user["user"]
        user.daily_search_count = 50
        user.daily_search_limit = 50
        # Set reset_at to yesterday
        user.search_count_reset_at = datetime.now(timezone.utc) - timedelta(days=1)
        await db_session.flush()
        await db_session.commit()

        resp = await client.post(URL, json={"query": "should work"}, headers=test_user["headers"])
        assert resp.status_code == 200

    async def test_search_video_ids_filter(self, client, test_user):
        vid = str(uuid.uuid4())
        client.mock_vector_db.search.return_value = [_make_mock_result(video_id=vid)]
        resp = await client.post(URL, json={"query": "test", "video_ids": [vid]}, headers=test_user["headers"])
        assert resp.status_code == 200

    async def test_search_min_score(self, client, test_user):
        resp = await client.post(URL, json={"query": "test", "min_score": 0.5}, headers=test_user["headers"])
        assert resp.status_code == 200

    async def test_search_empty_query(self, client, test_user):
        resp = await client.post(URL, json={"query": ""}, headers=test_user["headers"])
        assert resp.status_code == 422

    async def test_search_too_long_query(self, client, test_user):
        resp = await client.post(URL, json={"query": "x" * 501}, headers=test_user["headers"])
        assert resp.status_code == 422

    async def test_search_unauthenticated(self, client):
        resp = await client.post(URL, json={"query": "test"})
        assert resp.status_code == 403


# ── History ─────────────────────────────────────────────────────────────────

class TestSearchHistory:
    async def test_history_empty(self, client, test_user):
        resp = await client.get(f"{URL}/history", headers=test_user["headers"])
        assert resp.status_code == 200
        assert resp.json()["data"]["history"] == []

    async def test_history_returns_entries(self, client, db_session, test_user):
        await create_search_history(db_session, test_user["user_id"], query="query 1")
        await create_search_history(db_session, test_user["user_id"], query="query 2")

        resp = await client.get(f"{URL}/history", headers=test_user["headers"])
        history = resp.json()["data"]["history"]
        assert len(history) == 2

    async def test_history_limit(self, client, db_session, test_user):
        for i in range(5):
            await create_search_history(db_session, test_user["user_id"], query=f"q{i}")

        resp = await client.get(f"{URL}/history", params={"limit": 2}, headers=test_user["headers"])
        assert len(resp.json()["data"]["history"]) == 2

    async def test_history_user_isolation(self, client, db_session, test_user, second_user):
        await create_search_history(db_session, test_user["user_id"], query="alice query")
        await create_search_history(db_session, second_user["user_id"], query="bob query")

        resp = await client.get(f"{URL}/history", headers=test_user["headers"])
        history = resp.json()["data"]["history"]
        assert len(history) == 1
        assert history[0]["query"] == "alice query"


# ── Quota ───────────────────────────────────────────────────────────────────

class TestSearchQuota:
    async def test_quota_fresh_user(self, client, test_user):
        resp = await client.get(f"{URL}/quota", headers=test_user["headers"])
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["used"] == 0
        assert data["limit"] == 50
        assert data["remaining"] == 50

    async def test_quota_after_searches(self, client, db_session, test_user):
        user = test_user["user"]
        user.daily_search_count = 10
        user.search_count_reset_at = datetime.now(timezone.utc)
        await db_session.flush()
        await db_session.commit()

        resp = await client.get(f"{URL}/quota", headers=test_user["headers"])
        data = resp.json()["data"]
        assert data["used"] == 10
        assert data["remaining"] == 40

    async def test_quota_daily_reset(self, client, db_session, test_user):
        user = test_user["user"]
        user.daily_search_count = 30
        user.search_count_reset_at = datetime.now(timezone.utc) - timedelta(days=1)
        await db_session.flush()
        await db_session.commit()

        resp = await client.get(f"{URL}/quota", headers=test_user["headers"])
        data = resp.json()["data"]
        assert data["used"] == 0
        assert data["remaining"] == 50
