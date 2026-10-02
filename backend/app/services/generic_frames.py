"""Keep generic frames (black screens, end cards, title cards) out of the top results.

Image-text similarity has a known weakness: frames with little content embed close to
almost any caption, so a black screen scores about as well as a real match for every
query. We measure how "generic" each candidate frame is (its average similarity to a set
of everyday captions) and rank by how much more it matches the query than that. Real
matches stand out from their own baseline; generic frames don't. A query that really is
about them ("a black screen", "the end credits") still matches them well above baseline,
so they can still be found on purpose.

Tested on animated and live-action footage: black frames that ranked 2nd-5th for
unrelated queries ("a city street") dropped below 20th; the relevant top results stayed.
"""

from __future__ import annotations

import asyncio
import logging
import math

logger = logging.getLogger(__name__)

# Everyday captions; together they describe "an average frame". Keep these generic.
REFERENCE_CAPTIONS = [
    "a photo", "a picture of something", "a person", "people", "an object", "a room",
    "indoors", "outdoors", "a landscape", "an animal", "a vehicle", "a building", "nature",
    "a screenshot", "text on a screen", "a scene from a movie", "a cartoon", "the sky",
    "water", "a close-up",
]

_references: list[list[float]] | None = None
_lock = asyncio.Lock()


def _unit(v: list[float]) -> list[float]:
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def _dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


async def reference_vectors(embedding_service) -> list[list[float]] | None:
    """Caption embeddings, computed once per process. None if they can't be fetched,
    in which case search keeps its plain ranking."""
    global _references
    if _references is not None:
        return _references
    async with _lock:
        if _references is None:
            try:
                vectors = await asyncio.gather(
                    *(embedding_service.generate_text_embedding(c) for c in REFERENCE_CAPTIONS)
                )
                _references = [_unit(v) for v in vectors]
            except Exception:
                logger.warning("Couldn't load reference captions; search ranking unchanged", exc_info=True)
                return None
    return _references


def genericness(vector: list[float], references: list[list[float]]) -> float:
    """Average similarity of a frame to the everyday captions."""
    v = _unit(vector)
    return sum(_dot(v, r) for r in references) / len(references)


def rerank(results: list, references: list[list[float]] | None) -> list:
    """Order results by (similarity - genericness). Results without a vector, or no
    references, keep their order. Each result's displayed score is left unchanged."""
    if not references or not results or any(getattr(r, "vector", None) is None for r in results):
        return results
    return sorted(results, key=lambda r: r.score - genericness(r.vector, references), reverse=True)
