"""Creations API: drafts, captions, render queueing and plan limits, uploaded assets."""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select, text

from app.config import settings
from app.models.creation import Render
from app.models.transcript import TranscriptSegment


@pytest.fixture
def enqueue_render():
    mock = AsyncMock()
    with patch("app.utils.servicebus.enqueue_render", mock):
        yield mock


async def _create(client, user, video, template="hook-and-caption", moments=None):
    body = {"template_id": template, "moments": moments if moments is not None else [
        {"id": "m1", "video_id": str(video.video_id), "start": 5, "end": 20}
    ]}
    resp = await client.post("/api/v1/creations", json=body, headers=user["headers"])
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


async def test_templates_catalogue_and_effective_limits(client, test_user):
    resp = await client.get("/api/v1/templates", headers=test_user["headers"])
    data = resp.json()["data"]
    assert len(data["templates"]) == 10
    # Payments are off: a free account gets Pro template limits, no watermark.
    assert data["limits_enforced"] is False
    assert data["limits"]["monthly_renders"] == 50 and data["limits"]["watermark"] is False


async def test_create_creation_with_defaults(client, test_user, ready_video):
    creation = await _create(client, test_user, ready_video)
    assert creation["name"] == "Hook & Caption · Ready Video"
    assert creation["settings"]["format"] == "9:16"
    assert creation["settings"]["captions"]["style"] == "bold-pop"
    assert creation["recipe"]["version"] == 1
    listed = (await client.get("/api/v1/creations", headers=test_user["headers"])).json()["data"]["creations"]
    assert [c["creation_id"] for c in listed] == [creation["creation_id"]]


async def test_create_rejects_unknown_template_and_processing_videos(client, test_user, test_video):
    resp = await client.post("/api/v1/creations", json={"template_id": "nope"}, headers=test_user["headers"])
    assert resp.status_code == 404
    resp = await client.post("/api/v1/creations", json={"template_id": "clean-subtitles", "moments": [
        {"id": "m1", "video_id": str(test_video.video_id), "start": 0, "end": 5}]}, headers=test_user["headers"])
    assert resp.status_code == 400


async def test_other_users_cannot_see_or_use_a_creation(client, test_user, second_user, ready_video):
    creation = await _create(client, test_user, ready_video)
    url = f"/api/v1/creations/{creation['creation_id']}"
    assert (await client.get(url, headers=second_user["headers"])).status_code == 404
    # Nor can they put someone else's video in their own creation.
    resp = await client.post("/api/v1/creations", json={"template_id": "clean-subtitles", "moments": [
        {"id": "m1", "video_id": str(ready_video.video_id), "start": 0, "end": 5}]}, headers=second_user["headers"])
    assert resp.status_code == 404


async def test_update_settings_moments_and_caption_edits(client, test_user, ready_video):
    creation = await _create(client, test_user, ready_video)
    url = f"/api/v1/creations/{creation['creation_id']}"
    resp = await client.patch(url, json={
        "name": "My short",
        "settings": {"captions": {"style": "karaoke"}, "branding": {"primary": "#123456"}},
        "moments": [{"id": "m1", "video_id": str(ready_video.video_id), "start": 1, "end": 9},
                    {"id": "m2", "video_id": str(ready_video.video_id), "start": 30, "end": 40}],
        "caption_edits": {"m1": [{"start": 1, "end": 3, "text": "Edited"}], "gone": []},
    }, headers=test_user["headers"])
    data = resp.json()["data"]
    assert data["name"] == "My short"
    assert data["settings"]["captions"]["style"] == "karaoke"
    assert data["settings"]["captions"]["position"] == "lower-middle"  # untouched keys survive
    assert len(data["moments"]) == 2
    assert list(data["caption_edits"]) == ["m1"]

    bad = await client.patch(url, json={"settings": {"branding": {"accent": "orange"}}}, headers=test_user["headers"])
    assert bad.status_code == 422
    too_many = await client.patch(url, json={"moments": [
        {"id": f"m{i}", "video_id": str(ready_video.video_id), "start": i, "end": i + 1} for i in range(4)
    ]}, headers=test_user["headers"])
    assert too_many.status_code == 400


async def test_captions_come_from_the_transcript_unless_edited(client, db_session, test_user, ready_video):
    for i, (s, e, t) in enumerate([(2, 6, "before and inside"), (8, 12, "inside"), (40, 44, "outside")]):
        db_session.add(TranscriptSegment(video_id=ready_video.video_id, user_id=test_user["user_id"],
                                         segment_index=i, start_seconds=s, end_seconds=e, text=t))
    await db_session.commit()
    creation = await _create(client, test_user, ready_video)
    url = f"/api/v1/creations/{creation['creation_id']}/captions"
    caps = (await client.get(url, headers=test_user["headers"])).json()["data"]["captions"]["m1"]
    assert caps["edited"] is False
    assert [(l["start"], l["end"], l["text"]) for l in caps["lines"]] == [(5, 6, "before and inside"), (8, 12, "inside")]


async def test_render_is_queued_with_a_frozen_spec_and_counted(client, db_session, test_user, ready_video, enqueue_render):
    creation = await _create(client, test_user, ready_video)
    resp = await client.post(f"/api/v1/creations/{creation['creation_id']}/render", json={}, headers=test_user["headers"])
    assert resp.status_code == 200, resp.text
    render = resp.json()["data"]
    assert render["status"] == "queued" and render["resolution"] == 1080
    assert (render["width"], render["height"]) == (1080, 1920)
    enqueue_render.assert_awaited_once_with(render["render_id"])

    row = (await db_session.execute(select(Render))).scalar_one()
    assert row.spec["moments"][0]["id"] == "m1"
    assert str(ready_video.video_id) in row.spec["sources"]
    count = (await db_session.execute(text("SELECT monthly_render_count FROM users WHERE user_id = :u"),
                                      {"u": str(test_user["user_id"])})).scalar_one()
    assert count == 1

    again = await client.post(f"/api/v1/creations/{creation['creation_id']}/render", json={}, headers=test_user["headers"])
    assert again.status_code == 409


async def test_render_checks_length_and_moment_count(client, test_user, ready_video, enqueue_render):
    creation = await _create(client, test_user, ready_video, template="announcement-teaser", moments=[
        {"id": "m1", "video_id": str(ready_video.video_id), "start": 0, "end": 20}])
    resp = await client.post(f"/api/v1/creations/{creation['creation_id']}/render", headers=test_user["headers"])
    assert resp.status_code == 400 and "up to 8 seconds" in resp.json()["detail"]

    reel = await _create(client, test_user, ready_video, template="highlight-reel")
    resp = await client.post(f"/api/v1/creations/{reel['creation_id']}/render", headers=test_user["headers"])
    assert resp.status_code == 400 and "at least 3" in resp.json()["detail"]


async def test_free_plan_limits_apply_once_enforced(client, db_session, test_user, ready_video, enqueue_render):
    await db_session.execute(text("UPDATE users SET monthly_render_count = 5, render_count_reset_at = now() WHERE user_id = :u"),
                             {"u": str(test_user["user_id"])})
    await db_session.commit()
    creation = await _create(client, test_user, ready_video)
    url = f"/api/v1/creations/{creation['creation_id']}/render"
    with patch.object(settings, "TEMPLATE_LIMITS_ENFORCED", True):
        blocked = await client.post(url, headers=test_user["headers"])
        assert blocked.status_code == 403 and "5 renders" in blocked.json()["detail"]
        # A new month resets the count; Free renders are 720p with a watermark.
        await db_session.execute(text("UPDATE users SET render_count_reset_at = now() - interval '40 days' WHERE user_id = :u"),
                                 {"u": str(test_user["user_id"])})
        await db_session.commit()
        ok = await client.post(url, headers=test_user["headers"])
        assert ok.status_code == 200, ok.text
        assert ok.json()["data"]["resolution"] == 720 and ok.json()["data"]["watermarked"] is True


async def test_stalled_render_is_marked_failed(client, db_session, test_user, ready_video, enqueue_render):
    creation = await _create(client, test_user, ready_video)
    render = (await client.post(f"/api/v1/creations/{creation['creation_id']}/render", headers=test_user["headers"])).json()["data"]
    await db_session.execute(text("UPDATE renders SET status = 'rendering', updated_at = :t"),
                             {"t": datetime.now(timezone.utc) - timedelta(minutes=10)})
    await db_session.commit()
    got = (await client.get(f"/api/v1/renders/{render['render_id']}", headers=test_user["headers"])).json()["data"]
    assert got["status"] == "failed" and "Render again" in got["error_message"]


async def test_deleting_a_creation_cancels_active_renders(client, db_session, test_user, ready_video, enqueue_render):
    creation = await _create(client, test_user, ready_video)
    await client.post(f"/api/v1/creations/{creation['creation_id']}/render", headers=test_user["headers"])
    resp = await client.delete(f"/api/v1/creations/{creation['creation_id']}", headers=test_user["headers"])
    assert resp.status_code == 200
    row = (await db_session.execute(select(Render))).scalar_one()
    assert row.status == "cancelled"
    assert (await client.get(f"/api/v1/creations/{creation['creation_id']}", headers=test_user["headers"])).status_code == 404


async def test_music_upload_needs_rights_and_a_supported_type(client, test_user):
    url = "/api/v1/assets/upload-url"
    base = {"kind": "music", "filename": "song.mp3", "size_bytes": 1000, "content_type": "audio/mpeg"}
    assert (await client.post(url, json=base, headers=test_user["headers"])).status_code == 400
    assert (await client.post(url, json={**base, "rights_confirmed": True, "content_type": "video/mp4"},
                              headers=test_user["headers"])).status_code == 400
    ok = await client.post(url, json={**base, "rights_confirmed": True}, headers=test_user["headers"])
    assert ok.status_code == 200
    asset_id = ok.json()["data"]["asset_id"]
    done = await client.post(f"/api/v1/assets/{asset_id}/finalize", headers=test_user["headers"])
    assert done.status_code == 200 and done.json()["data"]["status"] == "ready"
    music = (await client.get("/api/v1/music", headers=test_user["headers"])).json()["data"]
    assert len(music["uploads"]) == 1


async def test_stock_music_library_is_listed_with_playable_urls(client, test_user):
    music = (await client.get("/api/v1/music", headers=test_user["headers"])).json()["data"]
    assert music["library_available"] is True and music["library_locked"] is False
    assert len(music["library"]) >= 20
    track = music["library"][0]
    assert track["licence"] == "CC0 1.0" and track["url"]
    assert {t["mood"] for t in music["library"]} == set(music["moods"])


async def test_render_with_a_library_track_freezes_its_source(client, db_session, test_user, ready_video, enqueue_render):
    from app.services.music_library import tracks

    track = tracks()[0]
    creation = await _create(client, test_user, ready_video)
    url = f"/api/v1/creations/{creation['creation_id']}"
    resp = await client.patch(url, json={"settings": {"music": {"track_id": track["id"]}}}, headers=test_user["headers"])
    assert resp.json()["data"]["settings"]["music"]["track_id"] == track["id"]
    assert (await client.post(f"{url}/render", headers=test_user["headers"])).status_code == 200
    spec = (await db_session.execute(select(Render.spec))).scalar_one()
    assert spec["music"]["source_url"] == track["source_url"]
    # The test blob mock reports every blob as present, so the worker reads our copy.
    assert spec["music"]["blob_path"] == f"clips/library/music/{track['id']}.mp3"


async def test_library_music_needs_pro_once_limits_are_enforced(client, test_user, ready_video, enqueue_render):
    from app.services.music_library import tracks

    creation = await _create(client, test_user, ready_video)
    url = f"/api/v1/creations/{creation['creation_id']}"
    await client.patch(url, json={"settings": {"music": {"track_id": tracks()[0]["id"]}}}, headers=test_user["headers"])
    with patch.object(settings, "TEMPLATE_LIMITS_ENFORCED", True):
        music = (await client.get("/api/v1/music", headers=test_user["headers"])).json()["data"]
        assert music["library_locked"] is True
        resp = await client.post(f"{url}/render", headers=test_user["headers"])
        assert resp.status_code == 403 and "music library" in resp.json()["detail"]
