"""Generic frames (black screens, end cards) shouldn't outrank real matches."""

import uuid

import pytest

from app.services import generic_frames


def _hit(score, vector, video_id=None, t=0.0):
    class Hit:
        pass

    h = Hit()
    h.frame_id = str(uuid.uuid4())
    h.video_id = video_id or str(uuid.uuid4())
    h.timestamp = t
    h.score = score
    h.vector = vector
    h.payload = {"frame_id": h.frame_id, "timestamp_seconds": t, "video_title": "V"}
    return h


# Two "everyday caption" directions; a generic frame sits between them (close to both),
# a specific frame points somewhere else.
REFS = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]
GENERIC = [1.0, 1.0, 1.2]
SPECIFIC = [0.0, 0.1, 1.0]


@pytest.fixture(autouse=True)
def _fresh_cache():
    generic_frames._references = None
    yield
    generic_frames._references = None


class TestRerank:
    def test_generic_frame_drops_below_a_real_match(self):
        black_screen = _hit(0.34, GENERIC)
        real_match = _hit(0.33, SPECIFIC)
        ranked = generic_frames.rerank([black_screen, real_match], REFS)
        assert ranked == [real_match, black_screen]
        # Displayed similarity isn't altered.
        assert (black_screen.score, real_match.score) == (0.34, 0.33)

    def test_a_much_stronger_match_still_wins(self):
        # Searching for the generic thing itself: it beats its own baseline by a lot.
        black_screen = _hit(0.95, GENERIC)
        other = _hit(0.33, SPECIFIC)
        assert generic_frames.rerank([other, black_screen], REFS)[0] is black_screen

    def test_unchanged_without_references_or_vectors(self):
        a, b = _hit(0.34, GENERIC), _hit(0.33, SPECIFIC)
        assert generic_frames.rerank([a, b], None) == [a, b]
        c = _hit(0.30, None)
        assert generic_frames.rerank([a, b, c], REFS) == [a, b, c]

    async def test_reference_failure_means_plain_ranking(self):
        class Broken:
            async def generate_text_embedding(self, text):
                raise RuntimeError("vision down")

        assert await generic_frames.reference_vectors(Broken()) is None

    async def test_references_are_fetched_once(self):
        calls = 0

        class Counting:
            async def generate_text_embedding(self, text):
                nonlocal calls
                calls += 1
                return [1.0, 0.0, 0.0]

        await generic_frames.reference_vectors(Counting())
        await generic_frames.reference_vectors(Counting())
        assert calls == len(generic_frames.REFERENCE_CAPTIONS)


class TestSearchUsesIt:
    async def test_search_results_are_reranked(self, client, test_user, monkeypatch):
        async def refs(_svc):
            return REFS

        monkeypatch.setattr(generic_frames, "reference_vectors", refs)
        vid = str(uuid.uuid4())
        black_screen = _hit(0.34, GENERIC, vid, t=900.0)
        real_match = _hit(0.33, SPECIFIC, vid, t=12.0)
        client.mock_vector_db.search.return_value = [black_screen, real_match]

        resp = await client.post("/api/v1/search", json={"query": "a city street"}, headers=test_user["headers"])
        results = resp.json()["data"]["results"]
        assert [r["timestamp_seconds"] for r in results] == [12.0, 900.0]
        assert client.mock_vector_db.search.call_args.kwargs["include_vectors"] is True
