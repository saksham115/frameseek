"""The platform is unusable until the Terms of Service and Privacy Policy are accepted."""

import pytest

from app.dependencies import TOS_REQUIRED_HEADER

GATED = [
    ("GET", "/api/v1/videos"),
    ("POST", "/api/v1/videos/upload-url"),
    ("POST", "/api/v1/search"),
    ("GET", "/api/v1/search/history"),
    ("GET", "/api/v1/folders"),
    ("GET", "/api/v1/clips"),
    ("GET", "/api/v1/storage/quota"),
    ("GET", "/api/v1/jobs"),
    ("GET", "/api/v1/subscriptions/status"),
]


class TestTermsGate:
    @pytest.mark.parametrize("method,url", GATED)
    async def test_platform_blocked_until_accepted(self, client, new_user, method, url):
        resp = await client.request(method, url, headers=new_user["headers"], json={})
        assert resp.status_code == 403
        assert resp.headers[TOS_REQUIRED_HEADER] == "tos"

    async def test_profile_readable_before_accepting(self, client, new_user):
        resp = await client.get("/api/v1/auth/me", headers=new_user["headers"])
        assert resp.status_code == 200
        assert resp.json()["data"]["tos_accepted_at"] is None

    async def test_accepting_unlocks_the_platform(self, client, new_user):
        resp = await client.post("/api/v1/auth/accept-tos", headers=new_user["headers"], json={"accepted": True})
        assert resp.status_code == 200
        assert resp.json()["data"]["tos_accepted_at"] is not None

        assert (await client.get("/api/v1/videos", headers=new_user["headers"])).status_code == 200

    async def test_declining_is_rejected(self, client, new_user):
        resp = await client.post("/api/v1/auth/accept-tos", headers=new_user["headers"], json={"accepted": False})
        assert resp.status_code == 400
        assert (await client.get("/api/v1/videos", headers=new_user["headers"])).status_code == 403

    async def test_first_acceptance_time_is_kept(self, client, new_user):
        first = await client.post("/api/v1/auth/accept-tos", headers=new_user["headers"], json={"accepted": True})
        again = await client.post("/api/v1/auth/accept-tos", headers=new_user["headers"], json={"accepted": True})
        assert again.json()["data"]["tos_accepted_at"] == first.json()["data"]["tos_accepted_at"]

    async def test_can_leave_without_accepting(self, client, new_user):
        # Someone who doesn't agree must still be able to sign out and delete their account.
        assert (await client.post("/api/v1/auth/logout", headers=new_user["headers"])).status_code == 200
        assert (await client.delete("/api/v1/auth/me", headers=new_user["headers"])).status_code == 200

    async def test_accepted_user_unaffected(self, client, test_user):
        assert (await client.get("/api/v1/videos", headers=test_user["headers"])).status_code == 200

    async def test_unauthenticated_is_still_401(self, client):
        assert (await client.get("/api/v1/videos")).status_code == 401
