from dataclasses import dataclass
from typing import Any

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, FieldCondition, Filter, MatchValue, PointStruct, VectorParams

from app.config import settings

VECTOR_SIZE = 1408


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


class VectorDB:
    def __init__(self):
        self.client = QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT)

    def _collection_name(self, user_id: str) -> str:
        return f"user_{user_id}"

    def create_collection(self, user_id: str) -> bool:
        collection_name = self._collection_name(user_id)
        collections = [c.name for c in self.client.get_collections().collections]
        if collection_name in collections:
            return True
        self.client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
        )
        return True

    def upsert_embeddings(self, user_id: str, points: list[EmbeddingPoint]) -> int:
        collection_name = self._collection_name(user_id)
        self.create_collection(user_id)
        qdrant_points = [
            PointStruct(id=p.id, vector=p.vector, payload=p.payload) for p in points
        ]
        self.client.upsert(collection_name=collection_name, points=qdrant_points)
        return len(qdrant_points)

    def search(
        self, user_id: str, query_vector: list[float], top_k: int = 20,
        video_ids: list[str] | None = None, min_score: float = 0.05
    ) -> list[SearchResult]:
        collection_name = self._collection_name(user_id)
        collections = [c.name for c in self.client.get_collections().collections]
        if collection_name not in collections:
            return []

        query_filter = None
        if video_ids:
            query_filter = Filter(
                must=[FieldCondition(key="video_id", match=MatchValue(value=vid)) for vid in video_ids]
            )

        results = self.client.query_points(
            collection_name=collection_name,
            query=query_vector,
            limit=top_k,
            query_filter=query_filter,
            score_threshold=min_score,
        )

        return [
            SearchResult(
                frame_id=str(r.payload.get("frame_id", "")),
                video_id=str(r.payload.get("video_id", "")),
                timestamp=float(r.payload.get("timestamp_seconds", 0)),
                score=r.score,
                payload=r.payload,
            )
            for r in results.points
        ]

    def delete_embeddings(self, user_id: str, ids: list[str]) -> int:
        collection_name = self._collection_name(user_id)
        self.client.delete(collection_name=collection_name, points_selector=ids)
        return len(ids)

    def delete_by_video_id(self, user_id: str, video_id: str) -> None:
        collection_name = self._collection_name(user_id)
        collections = [c.name for c in self.client.get_collections().collections]
        if collection_name not in collections:
            return
        self.client.delete(
            collection_name=collection_name,
            points_selector=Filter(
                must=[FieldCondition(key="video_id", match=MatchValue(value=video_id))]
            ),
        )

    def delete_collection(self, user_id: str) -> bool:
        collection_name = self._collection_name(user_id)
        self.client.delete_collection(collection_name=collection_name)
        return True


vector_db = VectorDB()
