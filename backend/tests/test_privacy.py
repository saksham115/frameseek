"""Data protection: re-accepting updated terms, video retention, and forgetting deleted accounts."""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from sqlalchemy import select, update

from app.legal import TERMS_EFFECTIVE_AT
from app.models.account_deletion_feedback import AccountDeletionFeedback
from app.models.user import User
from app.models.video import Video
from app.workers import retention_cleanup
from tests.conftest import TestingSessionLocal
from tests.factories import create_user, create_video

_LONG_AGO = datetime(2026, 1, 1, tzinfo=timezone.utc)


class TestUpdatedTerms:
    async def test_older_acceptance_must_be_renewed(self, client, db_session):
        user = await create_user(db_session, tos_accepted_at=TERMS_EFFECTIVE_AT - timedelta(days=1))
        from tests.conftest import _make_tokens

        headers = _make_tokens(user)["headers"]
        me = await client.get("/api/v1/auth/me", headers=headers)
        assert me.json()["data"]["tos_accepted_at"] is None
        assert (await client.get("/api/v1/videos", headers=headers)).status_code == 403

        accepted = await client.post("/api/v1/auth/accept-tos", headers=headers, json={"accepted": True})
        assert accepted.json()["data"]["tos_accepted_at"] is not None
        assert (await client.get("/api/v1/videos", headers=headers)).status_code == 200


class TestRetention:
    async def _old_video(self, db_session, user_id):
        video = await create_video(db_session, user_id, status="ready")
        await db_session.execute(update(Video).where(Video.video_id == video.video_id).values(created_at=_LONG_AGO))
        await db_session.commit()
        return video

    async def _exists(self, video_id) -> bool:
        async with TestingSessionLocal() as db:
            return (await db.get(Video, video_id)) is not None

    async def test_old_videos_get_a_full_period_from_enforcement(self, client, db_session, test_user):
        video = await self._old_video(db_session, test_user["user_id"])
        enforced = datetime.now(timezone.utc) - timedelta(days=3)
        with (
            patch.object(retention_cleanup, "async_session", TestingSessionLocal),
            patch.object(retention_cleanup, "RETENTION_ENFORCED_FROM", enforced),
        ):
            await retention_cleanup.cleanup_expired_content()
        assert await self._exists(video.video_id)

    async def test_expired_videos_are_deleted(self, client, db_session, test_user):
        video = await self._old_video(db_session, test_user["user_id"])
        with (
            patch.object(retention_cleanup, "async_session", TestingSessionLocal),
            patch.object(retention_cleanup, "RETENTION_ENFORCED_FROM", _LONG_AGO),
        ):
            await retention_cleanup.cleanup_expired_content()
        assert not await self._exists(video.video_id)


class TestDeletedAccounts:
    async def _delete(self, client, user, days_ago):
        from tests.conftest import _make_tokens

        resp = await client.request("DELETE", "/api/v1/auth/me", headers=_make_tokens(user)["headers"], json={})
        assert resp.status_code == 200
        when = datetime.now(timezone.utc) - timedelta(days=days_ago)
        async with TestingSessionLocal() as db:
            await db.execute(update(User).where(User.user_id == user.user_id).values(deleted_at=when))
            await db.execute(
                update(AccountDeletionFeedback)
                .where(AccountDeletionFeedback.user_id == user.user_id)
                .values(created_at=when)
            )
            await db.commit()

    async def test_identity_removed_after_grace_period(self, client, db_session):
        old = await create_user(db_session, email="gone@test.com", name="Gone")
        recent = await create_user(db_session, email="recent@test.com", name="Recent")
        await self._delete(client, old, days_ago=31)
        await self._delete(client, recent, days_ago=2)

        with patch.object(retention_cleanup, "async_session", TestingSessionLocal):
            await retention_cleanup.purge_deleted_accounts()
            await retention_cleanup.purge_deleted_accounts()  # idempotent

        async with TestingSessionLocal() as db:
            gone = await db.get(User, old.user_id)
            assert gone.email == f"{old.user_id}@deleted.invalid"
            assert gone.name == "Deleted user"
            assert gone.google_id is None
            still = await db.get(User, recent.user_id)
            assert still.email == "recent@test.com"  # can still come back by signing in
            records = {
                r.user_id: r.email
                for r in (await db.execute(select(AccountDeletionFeedback))).scalars()
            }
            assert records[old.user_id] == f"{old.user_id}@deleted.invalid"
            assert records[recent.user_id] == "recent@test.com"

    async def test_deleting_drops_google_tokens(self, client, db_session):
        user = await create_user(db_session)
        async with TestingSessionLocal() as db:
            await db.execute(
                update(User).where(User.user_id == user.user_id).values(google_refresh_token="secret")
            )
            await db.commit()
        await self._delete(client, user, days_ago=0)
        async with TestingSessionLocal() as db:
            assert (await db.get(User, user.user_id)).google_refresh_token is None
