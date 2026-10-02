"""Warn before re-uploading a file that's already in the library."""

from sqlalchemy import select

from app.models.video import Video
from tests.factories import create_video

URL = "/api/v1/videos"
FP_A = "a" * 64
FP_B = "b" * 64


async def _upload(client, user, name="clip.mp4", size=2048, fingerprint=FP_A, finalize=True):
    client.mock_blob.get_blob_size.return_value = size
    body = {"filename": name, "size_bytes": size, "content_type": "video/mp4"}
    if fingerprint:
        body["fingerprint"] = fingerprint
    vid = (await client.post(f"{URL}/upload-url", headers=user["headers"], json=body)).json()["data"]["video_id"]
    if finalize:
        await client.post(f"{URL}/{vid}/finalize", headers=user["headers"])
    return vid


async def _check(client, user, *files):
    resp = await client.post(f"{URL}/duplicates", headers=user["headers"], json={"files": list(files)})
    assert resp.status_code == 200
    return {d["index"]: d["video"]["video_id"] for d in resp.json()["data"]["duplicates"]}


class TestDuplicates:
    async def test_fingerprint_is_stored(self, client, db_session, test_user):
        vid = await _upload(client, test_user)
        video = (await db_session.execute(select(Video).where(Video.video_id == vid))).scalar_one()
        assert video.content_fingerprint == FP_A

    async def test_same_file_is_flagged(self, client, test_user):
        vid = await _upload(client, test_user, name="videoplayback.mp4")
        found = await _check(
            client, test_user,
            {"name": "renamed.mp4", "size_bytes": 2048, "fingerprint": FP_A},  # same content, new name
            {"name": "other.mp4", "size_bytes": 2048, "fingerprint": FP_B},    # same size, different content
            {"name": "new.mp4", "size_bytes": 9999, "fingerprint": FP_A},
        )
        assert found == {0: vid}

    async def test_unfinished_upload_does_not_count(self, client, test_user):
        await _upload(client, test_user, finalize=False)
        assert await _check(client, test_user, {"name": "clip.mp4", "size_bytes": 2048, "fingerprint": FP_A}) == {}

    async def test_older_videos_match_on_name_and_size(self, client, db_session, test_user):
        legacy = await create_video(
            db_session, test_user["user_id"], title="videoplayback", status="ready", file_size_bytes=62_700_000
        )
        legacy.original_filename = "videoplayback.mp4"
        await db_session.commit()
        found = await _check(
            client, test_user,
            {"name": "videoplayback.mp4", "size_bytes": 62_700_000, "fingerprint": FP_A},
            {"name": "something-else.mp4", "size_bytes": 62_700_000, "fingerprint": FP_A},
        )
        assert found == {0: str(legacy.video_id)}

    async def test_only_your_own_library(self, client, test_user, second_user):
        await _upload(client, second_user)
        assert await _check(client, test_user, {"name": "clip.mp4", "size_bytes": 2048, "fingerprint": FP_A}) == {}

    async def test_bad_fingerprint_rejected(self, client, test_user):
        resp = await client.post(
            f"{URL}/duplicates", headers=test_user["headers"],
            json={"files": [{"name": "x.mp4", "size_bytes": 1, "fingerprint": "not-hex"}]},
        )
        assert resp.status_code == 422
