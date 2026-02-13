import uuid
from datetime import datetime, timezone

from tests.factories import create_folder, create_video

URL = "/api/v1/folders"


# ── List Folders ────────────────────────────────────────────────────────────

class TestListFolders:
    async def test_list_empty(self, client, test_user):
        resp = await client.get(URL, headers=test_user["headers"])
        assert resp.status_code == 200
        assert resp.json()["data"]["folders"] == []

    async def test_list_returns_folders(self, client, db_session, test_user):
        await create_folder(db_session, test_user["user_id"], name="A")
        await create_folder(db_session, test_user["user_id"], name="B")

        resp = await client.get(URL, headers=test_user["headers"])
        folders = resp.json()["data"]["folders"]
        assert len(folders) == 2

    async def test_list_user_isolation(self, client, db_session, test_user, second_user):
        await create_folder(db_session, test_user["user_id"], name="Alice's")
        await create_folder(db_session, second_user["user_id"], name="Bob's")

        resp = await client.get(URL, headers=test_user["headers"])
        folders = resp.json()["data"]["folders"]
        assert len(folders) == 1
        assert folders[0]["name"] == "Alice's"

    async def test_list_video_count(self, client, db_session, test_user):
        folder = await create_folder(db_session, test_user["user_id"], name="With Videos")
        await create_video(db_session, test_user["user_id"], folder_id=folder.folder_id)
        await create_video(db_session, test_user["user_id"], folder_id=folder.folder_id)

        resp = await client.get(URL, headers=test_user["headers"])
        folders = resp.json()["data"]["folders"]
        assert folders[0]["video_count"] == 2

    async def test_list_excludes_deleted_videos_from_count(self, client, db_session, test_user):
        folder = await create_folder(db_session, test_user["user_id"], name="Mixed")
        await create_video(db_session, test_user["user_id"], folder_id=folder.folder_id, title="Active")
        await create_video(
            db_session, test_user["user_id"], folder_id=folder.folder_id,
            title="Deleted", deleted_at=datetime.now(timezone.utc),
        )

        resp = await client.get(URL, headers=test_user["headers"])
        folders = resp.json()["data"]["folders"]
        assert folders[0]["video_count"] == 1


# ── Create Folder ───────────────────────────────────────────────────────────

class TestCreateFolder:
    async def test_create_success(self, client, test_user):
        resp = await client.post(URL, json={"name": "New Folder"}, headers=test_user["headers"])
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["name"] == "New Folder"
        assert data["path"] == "/New Folder"
        assert data["video_count"] == 0

    async def test_create_with_parent(self, client, test_user, test_folder):
        resp = await client.post(
            URL,
            json={"name": "Child", "parent_folder_id": str(test_folder.folder_id)},
            headers=test_user["headers"],
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["name"] == "Child"
        assert data["parent_folder_id"] == str(test_folder.folder_id)
        assert test_folder.name in data["path"]

    async def test_create_nonexistent_parent(self, client, test_user):
        resp = await client.post(
            URL,
            json={"name": "Orphan", "parent_folder_id": str(uuid.uuid4())},
            headers=test_user["headers"],
        )
        assert resp.status_code == 404

    async def test_create_empty_name(self, client, test_user):
        resp = await client.post(URL, json={"name": ""}, headers=test_user["headers"])
        assert resp.status_code == 422

    async def test_create_long_name(self, client, test_user):
        resp = await client.post(URL, json={"name": "x" * 256}, headers=test_user["headers"])
        assert resp.status_code == 422

    async def test_create_parent_belongs_to_other_user(self, client, db_session, test_user, second_user):
        other_folder = await create_folder(db_session, second_user["user_id"], name="Bob's Folder")
        resp = await client.post(
            URL,
            json={"name": "Sneak", "parent_folder_id": str(other_folder.folder_id)},
            headers=test_user["headers"],
        )
        assert resp.status_code == 404


# ── Update Folder ───────────────────────────────────────────────────────────

class TestUpdateFolder:
    async def test_update_success(self, client, test_user, test_folder):
        resp = await client.put(
            f"{URL}/{test_folder.folder_id}",
            json={"name": "Renamed"},
            headers=test_user["headers"],
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["name"] == "Renamed"
        assert "/Renamed" in data["path"]

    async def test_update_not_found(self, client, test_user):
        resp = await client.put(
            f"{URL}/{uuid.uuid4()}",
            json={"name": "Nope"},
            headers=test_user["headers"],
        )
        assert resp.status_code == 404

    async def test_update_other_user(self, client, db_session, test_user, second_user):
        folder = await create_folder(db_session, second_user["user_id"])
        resp = await client.put(
            f"{URL}/{folder.folder_id}",
            json={"name": "Hijack"},
            headers=test_user["headers"],
        )
        assert resp.status_code == 404

    async def test_update_empty_name(self, client, test_user, test_folder):
        resp = await client.put(
            f"{URL}/{test_folder.folder_id}",
            json={"name": ""},
            headers=test_user["headers"],
        )
        assert resp.status_code == 422


# ── Delete Folder ───────────────────────────────────────────────────────────

class TestDeleteFolder:
    async def test_delete_success(self, client, test_user, test_folder):
        resp = await client.delete(f"{URL}/{test_folder.folder_id}", headers=test_user["headers"])
        assert resp.status_code == 200
        assert resp.json()["data"]["success"] is True

        # Verify it's gone
        list_resp = await client.get(URL, headers=test_user["headers"])
        assert len(list_resp.json()["data"]["folders"]) == 0

    async def test_delete_not_found(self, client, test_user):
        resp = await client.delete(f"{URL}/{uuid.uuid4()}", headers=test_user["headers"])
        assert resp.status_code == 404

    async def test_delete_other_user(self, client, db_session, test_user, second_user):
        folder = await create_folder(db_session, second_user["user_id"])
        resp = await client.delete(f"{URL}/{folder.folder_id}", headers=test_user["headers"])
        assert resp.status_code == 404

    async def test_delete_with_videos_sets_null(self, client, db_session, test_user, test_folder):
        """Deleting a folder should SET NULL on video folder_id."""
        video = await create_video(db_session, test_user["user_id"], folder_id=test_folder.folder_id)

        await client.delete(f"{URL}/{test_folder.folder_id}", headers=test_user["headers"])

        await db_session.refresh(video)
        assert video.folder_id is None

    async def test_delete_with_children_orphans(self, client, db_session, test_user, test_folder):
        """Deleting a parent folder orphans children (ORM nullifies FK before
        DB DELETE, so the DB-level CASCADE never fires).  Children survive
        with parent_folder_id = NULL."""
        from sqlalchemy import select
        from app.models.folder import Folder
        from tests.conftest import TestingSessionLocal

        child = await create_folder(
            db_session, test_user["user_id"], name="Child",
            path=f"{test_folder.path}/Child", parent_folder_id=test_folder.folder_id,
        )
        child_id = child.folder_id

        resp = await client.delete(f"{URL}/{test_folder.folder_id}", headers=test_user["headers"])
        assert resp.status_code == 200

        # Child still exists but with parent_folder_id = NULL
        async with TestingSessionLocal() as fresh:
            result = await fresh.execute(
                select(Folder).where(Folder.folder_id == child_id)
            )
            orphan = result.scalar_one_or_none()
            assert orphan is not None
            assert orphan.parent_folder_id is None
