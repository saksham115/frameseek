import uuid
from datetime import datetime, timedelta, timezone

from jose import jwt

from app.config import settings

URL = "/api/v1/auth"


# ── Register ────────────────────────────────────────────────────────────────

class TestRegister:
    async def test_register_success(self, client):
        resp = await client.post(f"{URL}/register", json={
            "email": "new@test.com", "password": "strongpass1", "name": "New User",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        data = body["data"]
        assert data["user"]["email"] == "new@test.com"
        assert data["user"]["name"] == "New User"
        assert "access_token" in data["tokens"]
        assert "refresh_token" in data["tokens"]

    async def test_register_returns_valid_jwt(self, client):
        resp = await client.post(f"{URL}/register", json={
            "email": "jwt@test.com", "password": "strongpass1", "name": "JWT User",
        })
        token = resp.json()["data"]["tokens"]["access_token"]
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        assert payload["type"] == "access"
        assert payload["email"] == "jwt@test.com"

    async def test_register_duplicate_email(self, client, test_user):
        resp = await client.post(f"{URL}/register", json={
            "email": "alice@test.com", "password": "strongpass1", "name": "Dup",
        })
        assert resp.status_code == 409

    async def test_register_short_password(self, client):
        resp = await client.post(f"{URL}/register", json={
            "email": "short@test.com", "password": "abc", "name": "Short",
        })
        assert resp.status_code == 422

    async def test_register_invalid_email(self, client):
        resp = await client.post(f"{URL}/register", json={
            "email": "not-an-email", "password": "strongpass1", "name": "Bad",
        })
        assert resp.status_code == 422

    async def test_register_empty_name(self, client):
        resp = await client.post(f"{URL}/register", json={
            "email": "empty@test.com", "password": "strongpass1", "name": "",
        })
        assert resp.status_code == 422

    async def test_register_missing_fields(self, client):
        resp = await client.post(f"{URL}/register", json={"email": "x@test.com"})
        assert resp.status_code == 422


# ── Login ───────────────────────────────────────────────────────────────────

class TestLogin:
    async def test_login_success(self, client, test_user):
        resp = await client.post(f"{URL}/login", json={
            "email": "alice@test.com", "password": test_user["password"],
        })
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["user"]["email"] == "alice@test.com"
        assert "access_token" in data["tokens"]

    async def test_login_wrong_password(self, client, test_user):
        resp = await client.post(f"{URL}/login", json={
            "email": "alice@test.com", "password": "wrongwrong",
        })
        assert resp.status_code == 401

    async def test_login_nonexistent_email(self, client):
        resp = await client.post(f"{URL}/login", json={
            "email": "nobody@test.com", "password": "whatever1",
        })
        assert resp.status_code == 401

    async def test_login_updates_last_login(self, client, db_session, test_user):
        before = test_user["user"].last_login_at
        await client.post(f"{URL}/login", json={
            "email": "alice@test.com", "password": test_user["password"],
        })
        await db_session.refresh(test_user["user"])
        assert test_user["user"].last_login_at is not None
        if before is not None:
            assert test_user["user"].last_login_at > before

    async def test_login_missing_fields(self, client):
        resp = await client.post(f"{URL}/login", json={"email": "x@test.com"})
        assert resp.status_code == 422


# ── Refresh ─────────────────────────────────────────────────────────────────

class TestRefresh:
    async def test_refresh_success(self, client, test_user):
        resp = await client.post(f"{URL}/refresh", json={
            "refresh_token": test_user["refresh_token"],
        })
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "access_token" in data
        assert "refresh_token" in data

    async def test_refresh_with_access_token_rejected(self, client, test_user):
        """Access tokens should NOT be accepted as refresh tokens."""
        resp = await client.post(f"{URL}/refresh", json={
            "refresh_token": test_user["access_token"],
        })
        assert resp.status_code == 401

    async def test_refresh_expired_token(self, client, test_user):
        expired_data = {
            "sub": str(test_user["user_id"]),
            "email": "alice@test.com",
            "name": "Alice",
            "plan": "free",
            "exp": datetime.now(timezone.utc) - timedelta(days=1),
            "type": "refresh",
        }
        expired_token = jwt.encode(expired_data, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
        resp = await client.post(f"{URL}/refresh", json={"refresh_token": expired_token})
        assert resp.status_code == 401

    async def test_refresh_invalid_string(self, client):
        resp = await client.post(f"{URL}/refresh", json={"refresh_token": "not.a.valid.token"})
        assert resp.status_code == 401

    async def test_refresh_deleted_user(self, client, db_session, test_user):
        """Soft-deleted user should not be able to refresh."""
        user = test_user["user"]
        user.deleted_at = datetime.now(timezone.utc)
        await db_session.flush()
        await db_session.commit()

        resp = await client.post(f"{URL}/refresh", json={
            "refresh_token": test_user["refresh_token"],
        })
        assert resp.status_code == 401


# ── Logout ──────────────────────────────────────────────────────────────────

class TestLogout:
    async def test_logout_success(self, client, test_user):
        resp = await client.post(f"{URL}/logout", json={
            "refresh_token": test_user["refresh_token"],
        })
        assert resp.status_code == 200
        assert resp.json()["data"]["success"] is True

    async def test_logout_not_validated(self, client):
        """Logout accepts any token without server-side validation."""
        resp = await client.post(f"{URL}/logout", json={
            "refresh_token": "whatever",
        })
        assert resp.status_code == 200
