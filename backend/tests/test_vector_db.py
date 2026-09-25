"""Exercise pgvector SQL against the dedicated local test database."""

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url

from app.config import settings
from app.repositories.vector_db import EmbeddingPoint, VectorDB, VECTOR_SIZE


@pytest.fixture
def vector_store():
    url = make_url(settings.DATABASE_URL).set(drivername="postgresql+psycopg2", database="frameseek_test")
    store = VectorDB()
    store._engine = create_engine(url)
    users = [str(uuid.uuid4()), str(uuid.uuid4())]
    try:
        yield store, users
    finally:
        for user in users:
            store.delete_collection(user)
        store._engine.dispose()


def test_vector_search_filters_video_and_user(vector_store):
    store, (user, other) = vector_store
    first_video, second_video = str(uuid.uuid4()), str(uuid.uuid4())
    vector = [1.0] + [0.0] * (VECTOR_SIZE - 1)

    def point(video):
        frame = str(uuid.uuid4())
        return EmbeddingPoint(frame, vector, {
            "video_id": video, "frame_id": frame, "source_type": "local", "timestamp_seconds": 2.5,
        })

    first, second, private = point(first_video), point(second_video), point(first_video)
    assert store.upsert_embeddings(user, [first, second]) == 2
    store.upsert_embeddings(other, [private])

    results = store.search(user, vector, video_ids=[first_video], source_type_filter="local")
    assert [result.frame_id for result in results] == [first.id]
    assert results[0].timestamp == 2.5
    assert results[0].score == pytest.approx(1.0)
    assert len(store.search(user, vector, video_ids=[first_video, second_video])) == 2
    assert store.search(user, vector, video_ids=[str(uuid.uuid4())]) == []
    assert [result.frame_id for result in store.search(other, vector)] == [private.id]
    store.delete_embeddings(user, [first.id])
    assert store.search(user, vector, video_ids=[first_video]) == []
