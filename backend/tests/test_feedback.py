from sqlalchemy import select

from app.models.user_feedback import UserFeedback
from app.routers.feedback import MAX_PER_HOUR

URL = "/api/v1/feedback"


class TestFeedback:
    async def test_submit_is_stored(self, client, db_session, test_user):
        resp = await client.post(
            URL, headers={**test_user["headers"], "User-Agent": "pytest-browser"},
            json={"category": "idea", "message": "  Let me tag people in shots  ", "page": "/videos/abc"},
        )
        assert resp.status_code == 201
        stored = (await db_session.execute(select(UserFeedback))).scalars().all()
        assert len(stored) == 1
        f = stored[0]
        assert (f.category, f.message, f.page, f.email) == ("idea", "Let me tag people in shots", "/videos/abc", "alice@test.com")
        assert f.user_agent == "pytest-browser"
        assert resp.json()["data"]["feedback_id"] == str(f.feedback_id)

    async def test_rejects_blank_and_oversized(self, client, test_user):
        assert (await client.post(URL, headers=test_user["headers"], json={"message": "   "})).status_code == 422
        assert (await client.post(URL, headers=test_user["headers"], json={"message": "x" * 2001})).status_code == 422
        assert (await client.post(URL, headers=test_user["headers"], json={"message": "hi", "category": "rant"})).status_code == 422

    async def test_rate_limited(self, client, test_user):
        for _ in range(MAX_PER_HOUR):
            assert (await client.post(URL, headers=test_user["headers"], json={"message": "ok"})).status_code == 201
        resp = await client.post(URL, headers=test_user["headers"], json={"message": "one more"})
        assert resp.status_code == 429

    async def test_requires_sign_in_and_terms(self, client, new_user):
        assert (await client.post(URL, json={"message": "hi"})).status_code == 401
        assert (await client.post(URL, headers=new_user["headers"], json={"message": "hi"})).status_code == 403


class TestTour:
    async def test_new_user_has_not_seen_tour(self, client, test_user):
        me = await client.get("/api/v1/auth/me", headers=test_user["headers"])
        assert me.json()["data"]["tour_completed_at"] is None

    async def test_complete_is_recorded_once(self, client, test_user):
        first = await client.post("/api/v1/auth/tour-complete", headers=test_user["headers"])
        assert first.status_code == 200
        done_at = first.json()["data"]["tour_completed_at"]
        assert done_at is not None
        again = await client.post("/api/v1/auth/tour-complete", headers=test_user["headers"])
        assert again.json()["data"]["tour_completed_at"] == done_at
        me = await client.get("/api/v1/auth/me", headers=test_user["headers"])
        assert me.json()["data"]["tour_completed_at"] == done_at

    async def test_requires_terms_first(self, client, new_user):
        assert (await client.post("/api/v1/auth/tour-complete", headers=new_user["headers"])).status_code == 403


class TestFeedbackAfterAccountDeletion:
    async def test_feedback_is_kept_but_unlinked(self, client, db_session, test_user):
        await client.post(URL, headers=test_user["headers"], json={"message": "keep this"})
        assert (await client.delete("/api/v1/auth/me", headers=test_user["headers"])).status_code == 200
        db_session.expire_all()
        f = (await db_session.execute(select(UserFeedback))).scalar_one()
        assert (f.message, f.user_id, f.email) == ("keep this", None, None)


class TestFeedbackIsLogged:
    async def test_emitted_for_app_insights(self, client, test_user, caplog):
        # No caplog.at_level: the record must get through on the logger's own level, since
        # production leaves the root logger at its WARNING default.
        await client.post(URL, headers=test_user["headers"], json={"category": "issue", "message": "Search is slow"})
        records = [r for r in caplog.records if r.name == "app.feedback"]
        assert len(records) == 1
        assert "Search is slow" in records[0].getMessage()
        assert records[0].custom_dimensions["category"] == "issue"
