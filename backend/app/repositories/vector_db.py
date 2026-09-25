"""Vector store — pgvector in Postgres (replaces Qdrant).

Keeps the ``VectorDB`` surface (create_collection/upsert_embeddings/search/
delete_by_video_id/delete_collection, plus ``EmbeddingPoint``/``SearchResult``/
``VECTOR_SIZE``) so existing callers are unchanged. Per-user isolation that Qdrant did
with one collection per user is now a ``user_id`` column filtered on every query.

Callers use this synchronously (worker + search service), so it owns a small sync engine
separate from the app's async engine.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from threading import Lock
from typing import Any

from sqlalchemy import create_engine, text

from app.config import settings

# Azure AI Vision multimodal embeddings are 1024-dimensional (Vertex was 1408).
VECTOR_SIZE = 1024

_TABLE = "frame_embeddings"


def _sync_url() -> str:
    url = settings.DATABASE_URL
    return url.replace("+asyncpg", "+psycopg2").replace("postgresql://", "postgresql+psycopg2://")


@dataclass
class SearchResult:
    frame_id: str
    video_id: str
    timestamp: float
    score: float
    payload: dict[str, Any]


@dataclass
class EmbeddingPoint:
    id: str
    vector: list[float]
    payload: dict[str, Any]


def _vec_literal(vector: list[float]) -> str:
    return "[" + ",".join(repr(float(x)) for x in vector) + "]"


class VectorDB:
    def __init__(self):
        self._engine = None
        self._schema_ready = False
        self._lock = Lock()

    def _get_engine(self):
        if self._engine is None:
            with self._lock:
                if self._engine is None:
                    self._engine = create_engine(_sync_url(), pool_size=5, max_overflow=5, pool_pre_ping=True)
        return self._engine

    def _ensure_schema(self) -> None:
        if self._schema_ready:
            return
        with self._get_engine().begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            conn.execute(
                text(
                    f"""
                    CREATE TABLE IF NOT EXISTS {_TABLE} (
                        id           TEXT PRIMARY KEY,
                        user_id      UUID NOT NULL,
                        video_id     UUID NOT NULL,
                        source_type  TEXT NOT NULL DEFAULT 'frame',
                        embedding    vector({VECTOR_SIZE}) NOT NULL,
                        payload      JSONB NOT NULL DEFAULT '{{}}'::jsonb
                    )
                    """
                )
            )
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{_TABLE}_user ON {_TABLE} (user_id)"))
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_{_TABLE}_video ON {_TABLE} (video_id)"))
            conn.execute(
                text(
                    f"CREATE INDEX IF NOT EXISTS idx_{_TABLE}_vec ON {_TABLE} "
                    f"USING hnsw (embedding vector_cosine_ops)"
                )
            )
        self._schema_ready = True

    # ------------------------------------------------------------------ API
    def create_collection(self, user_id: str) -> bool:
        # No per-user collections in pgvector; ensure the shared table exists.
        self._ensure_schema()
        return True

    def upsert_embeddings(self, user_id: str, points: list[EmbeddingPoint]) -> int:
        if not points:
            return 0
        self._ensure_schema()
        with self._get_engine().begin() as conn:
            for p in points:
                conn.execute(
                    text(
                        f"""
                        INSERT INTO {_TABLE} (id, user_id, video_id, source_type, embedding, payload)
                        VALUES (:id, :user_id, :video_id, :source_type, :embedding, CAST(:payload AS jsonb))
                        ON CONFLICT (id) DO UPDATE
                        SET embedding = EXCLUDED.embedding, payload = EXCLUDED.payload,
                            video_id = EXCLUDED.video_id, source_type = EXCLUDED.source_type
                        """
                    ),
                    {
                        "id": str(p.id),
                        "user_id": str(user_id),
                        "video_id": str(p.payload.get("video_id", "")),
                        "source_type": str(p.payload.get("source_type", "frame")),
                        "embedding": _vec_literal(p.vector),
                        "payload": json.dumps(p.payload),
                    },
                )
        return len(points)

    def search(
        self,
        user_id: str,
        query_vector: list[float],
        top_k: int = 20,
        video_ids: list[str] | None = None,
        min_score: float = 0.05,
        source_type_filter: str | None = None,
    ) -> list[SearchResult]:
        self._ensure_schema()
        params: dict[str, Any] = {"user_id": str(user_id), "qvec": _vec_literal(query_vector), "top_k": top_k}
        where = ["user_id = :user_id"]
        if video_ids:
            where.append("video_id = ANY(CAST(:video_ids AS uuid[]))")
            params["video_ids"] = [str(v) for v in video_ids]
        if source_type_filter:
            where.append("source_type = :source_type")
            params["source_type"] = source_type_filter

        sql = f"""
            SELECT id, video_id, payload,
                   1 - (embedding <=> CAST(:qvec AS vector)) AS score
            FROM {_TABLE}
            WHERE {' AND '.join(where)}
            ORDER BY embedding <=> CAST(:qvec AS vector)
            LIMIT :top_k
        """
        with self._get_engine().connect() as conn:
            rows = conn.execute(text(sql), params).mappings().all()

        results: list[SearchResult] = []
        for r in rows:
            score = float(r["score"])
            if score < min_score:
                continue
            payload = r["payload"] if isinstance(r["payload"], dict) else json.loads(r["payload"])
            results.append(
                SearchResult(
                    frame_id=str(payload.get("frame_id", "")),
                    video_id=str(r["video_id"]),
                    timestamp=float(payload.get("timestamp_seconds", 0)),
                    score=score,
                    payload=payload,
                )
            )
        return results

    def delete_embeddings(self, user_id: str, ids: list[str]) -> int:
        if not ids:
            return 0
        self._ensure_schema()
        with self._get_engine().begin() as conn:
            conn.execute(
                text(f"DELETE FROM {_TABLE} WHERE user_id = :user_id AND id = ANY(:ids)"),
                {"user_id": str(user_id), "ids": [str(i) for i in ids]},
            )
        return len(ids)

    def delete_by_video_id(self, user_id: str, video_id: str) -> None:
        self._ensure_schema()
        with self._get_engine().begin() as conn:
            conn.execute(
                text(f"DELETE FROM {_TABLE} WHERE user_id = :user_id AND video_id = :video_id"),
                {"user_id": str(user_id), "video_id": str(video_id)},
            )

    def delete_collection(self, user_id: str) -> bool:
        self._ensure_schema()
        with self._get_engine().begin() as conn:
            conn.execute(text(f"DELETE FROM {_TABLE} WHERE user_id = :user_id"), {"user_id": str(user_id)})
        return True


vector_db = VectorDB()
