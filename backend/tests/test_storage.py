URL = "/api/v1/storage/quota"


class TestStorageQuota:
    async def test_quota_default(self, client, test_user):
        resp = await client.get(URL, headers=test_user["headers"])
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["used_bytes"] == 0
        assert data["limit_bytes"] == 5368709120
        assert data["used_percentage"] == 0

    async def test_quota_with_usage(self, client, db_session, test_user):
        user = test_user["user"]
        user.storage_used_bytes = 2684354560  # 2.5 GB
        await db_session.flush()
        await db_session.commit()

        resp = await client.get(URL, headers=test_user["headers"])
        data = resp.json()["data"]
        assert data["used_bytes"] == 2684354560
        assert data["used_percentage"] == 50.0

    async def test_quota_unauthenticated(self, client):
        resp = await client.get(URL)
        assert resp.status_code == 403
