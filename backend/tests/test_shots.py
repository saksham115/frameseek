import math
import uuid

import pytest
from sqlalchemy import text

from app.schemas.search import SearchResultItem
from app.services.search_service import collapse_into_shots
from app.services.shot_service import SHOT_SIMILARITY_THRESHOLD, ShotFrame, group_into_shots, shot_at
from tests.conftest import engine
from tests.factories import create_frame, create_video

URL = "/api/v1/videos"


def _frames(sims: list[float | None], step: float = 2.0) -> list[ShotFrame]:
    return [
        ShotFrame(
            frame_id=str(i), video_id="v", frame_index=i, timestamp_seconds=i * step,
            gcs_path=None, frame_path=None, similarity_to_previous=s,
        )
        for i, s in enumerate(sims)
    ]


def _unit(angle_degrees: float) -> list[float]:
    """A 3-d unit vector; cosine similarity between two is cos(angle difference)."""
    a = math.radians(angle_degrees)
    return [math.cos(a), math.sin(a), 0.0]


@pytest.fixture
async def embeddings_table(db_session):
    """A tiny pgvector table shaped like production's frame_embeddings (3-d vectors)."""
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.execute(text("DROP TABLE IF EXISTS frame_embeddings"))
        await conn.execute(text(
            "CREATE TABLE frame_embeddings (id TEXT PRIMARY KEY, user_id UUID NOT NULL, video_id UUID NOT NULL, "
            "source_type TEXT NOT NULL DEFAULT 'local', embedding vector(3) NOT NULL, payload JSONB NOT NULL DEFAULT '{}')"
        ))

    async def add(frame, vector, source_type="local"):
        async with engine.begin() as conn:
            await conn.execute(
                text("INSERT INTO frame_embeddings (id, user_id, video_id, source_type, embedding) "
                     "VALUES (:id, :u, :v, :s, CAST(:e AS vector))"),
                {"id": str(frame.frame_id), "u": str(frame.user_id), "v": str(frame.video_id),
                 "s": source_type, "e": "[" + ",".join(map(str, vector)) + "]"},
            )

    yield add
    async with engine.begin() as conn:
        await conn.execute(text("DROP TABLE IF EXISTS frame_embeddings"))


async def _video_with_frames(db_session, user_id, angles, add_embedding=None, duration=12.0):
    video = await create_video(db_session, user_id, status="ready", duration_seconds=duration)
    frames = []
    for i, angle in enumerate(angles):
        frame = await create_frame(db_session, video.video_id, user_id, frame_index=i, timestamp_seconds=i * 2.0)
        frames.append(frame)
        if add_embedding and angle is not None:
            await add_embedding(frame, _unit(angle))
    return video, frames


class TestGroupIntoShots:
    def test_splits_where_similarity_drops(self):
        shots = group_into_shots(_frames([None, 0.97, 0.96, 0.5, 0.95, 0.4]), duration_seconds=11.0)
        assert [s.frame_count for s in shots] == [3, 2, 1]
        # Boundaries sit halfway between the last frame of one shot and the first of the next.
        assert [(s.start_seconds, s.end_seconds) for s in shots] == [(0.0, 5.0), (5.0, 9.0), (9.0, 11.0)]

    def test_threshold_edge(self):
        just_below = SHOT_SIMILARITY_THRESHOLD - 0.001
        shots = group_into_shots(_frames([None, SHOT_SIMILARITY_THRESHOLD, just_below]))
        assert [s.frame_count for s in shots] == [2, 1]

    def test_missing_embedding_starts_a_new_shot(self):
        shots = group_into_shots(_frames([None, 0.99, None, 0.99]))
        assert [s.frame_count for s in shots] == [2, 2]

    def test_last_shot_runs_to_duration_or_last_frame(self):
        assert group_into_shots(_frames([None, 0.99]), duration_seconds=9.5)[-1].end_seconds == 9.5
        assert group_into_shots(_frames([None, 0.99]), duration_seconds=None)[-1].end_seconds == 2.0

    def test_empty(self):
        assert group_into_shots([]) == []

    def test_representative_is_middle_frame(self):
        shot = group_into_shots(_frames([None, 0.99, 0.99]))[0]
        assert shot.representative.frame_index == 1

    def test_shot_at(self):
        shots = group_into_shots(_frames([None, 0.97, 0.3, 0.95]), duration_seconds=8.0)
        assert shot_at(shots, 0).index == 0
        assert shot_at(shots, 2.99).index == 0
        assert shot_at(shots, 3.0).index == 1
        assert shot_at(shots, 8.0).index == 1  # the very end still belongs to the last shot
        assert shot_at([], 1.0) is None


def _item(video_id, t, score, frame_id=None):
    return SearchResultItem(
        frame_id=frame_id or uuid.uuid4(), video_id=video_id, video_title="V", timestamp_seconds=t,
        formatted_timestamp="", score=score, frame_url="",
    )


class TestCollapseIntoShots:
    def test_keeps_best_hit_per_shot_and_counts_matches(self):
        vid = uuid.uuid4()
        shots = {str(vid): group_into_shots(_frames([None, 0.97, 0.96, 0.2, 0.95]), 10.0)}
        results = [_item(vid, 2, 0.9), _item(vid, 6, 0.8), _item(vid, 0, 0.7), _item(vid, 8, 0.6)]
        collapsed = collapse_into_shots(results, shots)
        assert [(r.timestamp_seconds, r.match_count, r.shot_index) for r in collapsed] == [(2, 2, 0), (6, 2, 1)]
        assert (collapsed[0].shot_start_seconds, collapsed[0].shot_end_seconds) == (0.0, 5.0)
        assert collapsed[0].shot_frame_count == 3

    def test_frames_without_shots_stay_separate(self):
        vid = uuid.uuid4()
        collapsed = collapse_into_shots([_item(vid, 2, 0.9), _item(vid, 4, 0.8)], {})
        assert len(collapsed) == 2
        assert collapsed[0].shot_index is None


class TestShotsEndpoint:
    async def test_groups_similar_frames(self, client, db_session, test_user, embeddings_table):
        # 0°, 5°, 8° are near-identical; 70° is a new shot; 72° continues it.
        video, _ = await _video_with_frames(
            db_session, test_user["user_id"], [0, 5, 8, 70, 72], embeddings_table, duration=10.0
        )
        resp = await client.get(f"{URL}/{video.video_id}/shots", headers=test_user["headers"])
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert [(s["start_seconds"], s["end_seconds"], s["frame_count"]) for s in data["shots"]] == [
            (0.0, 5.0, 3), (5.0, 10.0, 2),
        ]
        assert data["shots"][0]["timestamp_seconds"] == 2.0  # middle frame represents the shot
        assert data["similarity_threshold"] == SHOT_SIMILARITY_THRESHOLD

    async def test_ignores_transcript_vectors(self, client, db_session, test_user, embeddings_table):
        video, frames = await _video_with_frames(db_session, test_user["user_id"], [0, 1], embeddings_table)
        # A transcript embedding for the same video must not affect frame similarity.
        async with engine.begin() as conn:
            await conn.execute(
                text("INSERT INTO frame_embeddings (id, user_id, video_id, source_type, embedding) "
                     "VALUES ('t1', :u, :v, 'transcript', '[0,0,1]')"),
                {"u": str(test_user["user_id"]), "v": str(video.video_id)},
            )
        resp = await client.get(f"{URL}/{video.video_id}/shots", headers=test_user["headers"])
        assert [s["frame_count"] for s in resp.json()["data"]["shots"]] == [2]

    async def test_frames_without_vectors_are_single_shots(self, client, db_session, test_user):
        # No frame_embeddings table at all (nothing indexed yet in this database).
        async with engine.begin() as conn:
            await conn.execute(text("DROP TABLE IF EXISTS frame_embeddings"))
        video, _ = await _video_with_frames(db_session, test_user["user_id"], [None, None])
        resp = await client.get(f"{URL}/{video.video_id}/shots", headers=test_user["headers"])
        assert resp.status_code == 200
        assert [s["frame_count"] for s in resp.json()["data"]["shots"]] == [1, 1]

    async def test_other_users_video(self, client, db_session, test_user, second_user):
        video = await create_video(db_session, second_user["user_id"])
        resp = await client.get(f"{URL}/{video.video_id}/shots", headers=test_user["headers"])
        assert resp.status_code == 404


class TestSearchCollapsesShots:
    async def test_hits_in_one_shot_become_one_result(self, client, db_session, test_user, embeddings_table):
        video, frames = await _video_with_frames(
            db_session, test_user["user_id"], [0, 5, 8, 70, 72], embeddings_table, duration=10.0
        )

        def hit(frame, score):
            r = type("Hit", (), {})()
            r.frame_id, r.video_id = str(frame.frame_id), str(video.video_id)
            r.timestamp, r.score = float(frame.timestamp_seconds), score
            r.payload = {"frame_id": str(frame.frame_id), "timestamp_seconds": float(frame.timestamp_seconds)}
            return r

        client.mock_vector_db.search.return_value = [
            hit(frames[1], 0.9), hit(frames[0], 0.8), hit(frames[4], 0.7), hit(frames[2], 0.6),
        ]
        resp = await client.post("/api/v1/search", json={"query": "q"}, headers=test_user["headers"])
        results = resp.json()["data"]["results"]
        assert [(r["timestamp_seconds"], r["match_count"], r["shot_start_seconds"], r["shot_end_seconds"])
                for r in results] == [(2.0, 3, 0.0, 5.0), (8.0, 1, 5.0, 10.0)]
