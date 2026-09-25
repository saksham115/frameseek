"""Auth tests for the web OAuth + cookie-session flow.

The Google authorization-code exchange hits Google's servers, so it isn't unit-tested
here; these cover the session dependency and the endpoints that don't require a live
Google round-trip. get_current_user accepts a Bearer header as a fallback to the cookie,
which is how the fixtures authenticate.
"""

import pytest
from unittest.mock import AsyncMock

from app.config import settings
from app.utils import sessions
from app.utils.security import decode_token


async def test_callback_cookie_session_refresh_and_logout(client, test_user, monkeypatch):
    from app.services.auth_service import AuthService

    allowlist = {}

    async def register(jti, user_id):
        allowlist[jti] = user_id

    async def valid(jti, user_id):
        return allowlist.get(jti) == user_id

    async def revoke(jti):
        allowlist.pop(jti, None)

    monkeypatch.setattr(sessions, "register_refresh", register)
    monkeypatch.setattr(sessions, "is_refresh_valid", valid)
    monkeypatch.setattr(sessions, "revoke_refresh", revoke)
    exchange = AsyncMock(return_value=test_user["user"])
    monkeypatch.setattr(AuthService, "exchange_google_code", exchange)
    client.cookies.set("fs_oauth_state", "test-state")

    invalid = await client.get("/api/v1/auth/google/callback", params={"code": "test-code", "state": "wrong-state"})
    assert invalid.status_code == 400
    exchange.assert_not_awaited()

    callback = await client.get("/api/v1/auth/google/callback", params={"code": "test-code", "state": "test-state"}, follow_redirects=False)
    assert callback.status_code in (302, 307)
    assert callback.headers["location"] == settings.FRONTEND_URL
    assert "HttpOnly" in callback.headers["set-cookie"]
    original_refresh = client.cookies.get(settings.REFRESH_COOKIE_NAME)
    assert original_refresh
    me = await client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["data"]["user_id"] == str(test_user["user_id"])

    refreshed = await client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200
    rotated_refresh = client.cookies.get(settings.REFRESH_COOKIE_NAME)
    assert rotated_refresh != original_refresh
    assert decode_token(original_refresh)["jti"] not in allowlist
    replay = await client.post("/api/v1/auth/refresh", headers={"Cookie": f"{settings.REFRESH_COOKIE_NAME}={original_refresh}"})
    assert replay.status_code == 401

    logout = await client.post("/api/v1/auth/logout")
    assert logout.status_code == 200
    assert decode_token(rotated_refresh)["jti"] not in allowlist
    assert (await client.get("/api/v1/auth/me")).status_code == 401


@pytest.mark.asyncio
async def test_me_requires_auth(client):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_returns_current_user(client, test_user):
    resp = await client.get("/api/v1/auth/me", headers=test_user["headers"])
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["email"] == "alice@test.com"
    assert data["user_id"] == str(test_user["user_id"])


@pytest.mark.asyncio
async def test_google_start_redirects_to_google(client):
    resp = await client.get("/api/v1/auth/google/start", follow_redirects=False)
    assert resp.status_code in (302, 307)
    assert "accounts.google.com" in resp.headers["location"]


@pytest.mark.asyncio
async def test_logout_ok(client, test_user):
    resp = await client.post("/api/v1/auth/logout", headers=test_user["headers"])
    assert resp.status_code == 200
