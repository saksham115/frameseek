"""Admin dashboard: who gets in, managing admins, the stats, and where users are."""

from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from sqlalchemy import select, text

from app.config import settings
from app.models.admin import Admin, UserActiveDay
from app.services.geo import clean_timezone, client_ip
from tests.factories import create_video


@pytest.fixture
def as_admin(test_user):
    with patch.object(settings, "ADMIN_EMAILS", f"someone@else.com, {test_user['user'].email.upper()}"):
        yield test_user


async def test_non_admins_get_a_plain_404(client, test_user):
    for path in ("/api/v1/admin/overview", "/api/v1/admin/users", "/api/v1/admin/admins"):
        assert (await client.get(path, headers=test_user["headers"])).status_code == 404
    me = (await client.get("/api/v1/auth/me", headers=test_user["headers"])).json()["data"]
    assert me["is_admin"] is False


async def test_config_admins_get_in_case_insensitively(client, as_admin):
    me = (await client.get("/api/v1/auth/me", headers=as_admin["headers"])).json()["data"]
    assert me["is_admin"] is True
    assert (await client.get("/api/v1/admin/overview", headers=as_admin["headers"])).status_code == 200


async def test_admins_can_add_and_remove_admins(client, db_session, as_admin, second_user):
    url = "/api/v1/admin/admins"
    resp = await client.post(url, json={"email": " Bob@Test.com "}, headers=as_admin["headers"])
    assert resp.status_code == 200
    emails = {a["email"]: a for a in resp.json()["data"]["admins"]}
    assert emails["bob@test.com"]["source"] == "dashboard"
    assert emails["bob@test.com"]["has_account"] is True
    assert emails[as_admin["user"].email.lower()]["source"] == "config"

    # The added admin can now use the dashboard themselves.
    assert (await client.get("/api/v1/admin/users", headers=second_user["headers"])).status_code == 200
    # ...but can't remove an admin set in config, or themselves.
    resp = await client.delete(f"{url}/{as_admin['user'].email}", headers=second_user["headers"])
    assert resp.status_code == 400 and "ADMIN_EMAILS" in resp.json()["detail"]
    assert (await client.delete(f"{url}/bob@test.com", headers=second_user["headers"])).status_code == 400

    assert (await client.post(url, json={"email": "bob@test.com"}, headers=as_admin["headers"])).status_code == 409
    assert (await client.post(url, json={"email": "not-an-email"}, headers=as_admin["headers"])).status_code == 400
    assert (await client.delete(f"{url}/bob@test.com", headers=as_admin["headers"])).status_code == 200
    assert (await client.get("/api/v1/admin/users", headers=second_user["headers"])).status_code == 404


async def test_overview_counts_users_content_and_geography(client, db_session, as_admin, second_user):
    await db_session.execute(text("UPDATE users SET country_code = 'IN' WHERE email = 'alice@test.com'"))
    await db_session.execute(text("UPDATE users SET country_code = 'US' WHERE email = 'bob@test.com'"))
    await db_session.commit()
    await create_video(db_session, as_admin["user_id"], status="ready", duration_seconds=1800)
    await create_video(db_session, second_user["user_id"], status="error")

    data = (await client.get("/api/v1/admin/overview?days=30", headers=as_admin["headers"])).json()["data"]
    assert data["users"]["total"] == 2
    assert data["users"]["with_videos"] == 2
    assert {c["code"]: c["users"] for c in data["countries"]} == {"IN": 1, "US": 1}
    assert data["content"]["videos"] == 2 and data["content"]["failed"] == 1
    assert data["content"]["hours"] == pytest.approx(0.5)
    assert len(data["daily"]) == 30
    today = data["daily"][-1]
    assert today["signups"] == 2 and today["videos"] == 2
    # Requests mark the user active today.
    assert today["active"] >= 1


async def test_users_list_searches_and_sorts(client, as_admin, second_user, db_session):
    await create_video(db_session, second_user["user_id"], status="ready")
    data = (await client.get("/api/v1/admin/users?sort=videos", headers=as_admin["headers"])).json()["data"]
    assert data["total"] == 2
    assert data["users"][0]["email"] == "bob@test.com" and data["users"][0]["videos"] == 1
    found = (await client.get("/api/v1/admin/users?q=bob", headers=as_admin["headers"])).json()["data"]
    assert [u["email"] for u in found["users"]] == ["bob@test.com"]


async def test_me_records_country_and_timezone(client, db_session, test_user):
    with patch("app.services.geo.country_for_ip", return_value="IN"):
        await client.get("/api/v1/auth/me", headers={**test_user["headers"], "X-Timezone": "Asia/Kolkata"})
    row = (await db_session.execute(text(
        "SELECT country_code, timezone, last_seen_at FROM users WHERE email = 'alice@test.com'"))).mappings().one()
    assert row["country_code"] == "IN" and row["timezone"] == "Asia/Kolkata" and row["last_seen_at"] is not None
    days = (await db_session.execute(select(UserActiveDay.day))).scalars().all()
    assert days == [datetime.now(timezone.utc).date()]


def test_client_ip_takes_the_right_most_public_address():
    req = SimpleNamespace(headers={"x-forwarded-for": "1.2.3.4, 49.36.10.20, 10.0.0.7, 100.64.1.2"}, client=SimpleNamespace(host="10.0.0.9"))
    assert client_ip(req) == "49.36.10.20"
    assert client_ip(SimpleNamespace(headers={}, client=SimpleNamespace(host="127.0.0.1"))) is None
    assert clean_timezone("America/Argentina/Buenos_Aires") == "America/Argentina/Buenos_Aires"
    assert clean_timezone("<script>") is None
