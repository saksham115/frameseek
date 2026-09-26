"""Free plan: 50 searches a month; "Request more" adds 10, at most 3 times a month."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models.search_quota_request import SearchQuotaRequest

QUOTA = "/api/v1/search/quota"
MORE = "/api/v1/search/quota/request-more"
SEARCH = "/api/v1/search"


async def _use_up(db_session, user, count=50, when=None):
    user.monthly_search_count = count
    user.search_count_reset_at = when or datetime.now(timezone.utc)
    await db_session.commit()


class TestRequestMore:
    async def test_only_offered_when_exhausted(self, client, db_session, test_user):
        await _use_up(db_session, test_user["user"], count=49)
        data = (await client.get(QUOTA, headers=test_user["headers"])).json()["data"]
        assert (data["remaining"], data["can_request_more"]) == (1, False)
        resp = await client.post(MORE, headers=test_user["headers"])
        assert resp.status_code == 409

        await _use_up(db_session, test_user["user"], count=50)
        data = (await client.get(QUOTA, headers=test_user["headers"])).json()["data"]
        assert (data["remaining"], data["can_request_more"], data["requests_max"]) == (0, True, 3)

    async def test_grants_ten_searches_that_actually_work(self, client, db_session, test_user):
        await _use_up(db_session, test_user["user"])
        assert (await client.post(SEARCH, json={"query": "q"}, headers=test_user["headers"])).status_code == 429

        data = (await client.post(MORE, headers=test_user["headers"])).json()["data"]
        assert (data["limit"], data["remaining"], data["bonus_searches"], data["requests_used"]) == (60, 10, 10, 1)
        assert data["can_request_more"] is False  # searches available again

        assert (await client.post(SEARCH, json={"query": "q"}, headers=test_user["headers"])).status_code == 200

    async def test_three_times_a_month_at_most(self, client, db_session, test_user):
        user = test_user["user"]
        for n in range(1, 4):
            await db_session.refresh(user)
            await _use_up(db_session, user, count=50 + 10 * (n - 1))
            resp = await client.post(MORE, headers=test_user["headers"])
            assert resp.status_code == 200, resp.text
            assert resp.json()["data"]["requests_used"] == n

        await db_session.refresh(user)
        await _use_up(db_session, user, count=80)
        data = (await client.get(QUOTA, headers=test_user["headers"])).json()["data"]
        assert (data["remaining"], data["can_request_more"], data["requests_used"]) == (0, False, 3)
        assert (await client.post(MORE, headers=test_user["headers"])).status_code == 409

    async def test_each_click_is_recorded(self, client, db_session, test_user):
        await _use_up(db_session, test_user["user"])
        await client.post(MORE, headers=test_user["headers"])
        rows = (await db_session.execute(select(SearchQuotaRequest))).scalars().all()
        assert [(r.user_id, r.plan_type, r.searches_granted, r.request_number) for r in rows] == [
            (test_user["user_id"], "free", 10, 1)
        ]

    async def test_top_ups_reset_with_the_month(self, client, db_session, test_user):
        user = test_user["user"]
        user.search_bonus, user.search_bonus_requests = 30, 3
        last_month = datetime.now(timezone.utc).replace(day=1) - timedelta(days=1)
        await _use_up(db_session, user, count=80, when=last_month)
        data = (await client.get(QUOTA, headers=test_user["headers"])).json()["data"]
        assert (data["used"], data["limit"], data["requests_used"], data["bonus_searches"]) == (0, 50, 0, 0)

    async def test_paid_plans_cannot_request_more(self, client, db_session, test_user):
        user = test_user["user"]
        user.plan_type, user.monthly_search_limit = "pro", 100
        await _use_up(db_session, user, count=100)
        data = (await client.get(QUOTA, headers=test_user["headers"])).json()["data"]
        assert (data["can_request_more"], data["requests_max"]) == (False, 0)
        assert (await client.post(MORE, headers=test_user["headers"])).status_code == 403
