import asyncio
from typing import Callable

from app.repositories.vector_db import EmbeddingPoint, vector_db
from app.services.embedding_service import EmbeddingService


class EmbeddingGenerator:
    def __init__(self):
        self.embedding_service = EmbeddingService()

    async def generate_and_store(
        self,
        user_id: str,
        video_id: str,
        video_title: str,
        frames: list[dict],
        progress_callback: Callable | None = None,
    ) -> int:
        """Generate embeddings for frames and store in Qdrant."""
        points: list[EmbeddingPoint] = []
        total = len(frames)

        for i, frame in enumerate(frames):
            image_path = frame["local_path"]
            embedding = await self.embedding_service.generate_image_embedding(image_path)

            # Relative path for storage URL
            rel_path = f"{video_id}/frame_{frame['frame_index']:06d}.jpg"
            thumb_rel = f"{video_id}/thumb_{frame['frame_index']:06d}.jpg"

            point = EmbeddingPoint(
                id=str(frame["frame_id"]),
                vector=embedding,
                payload={
                    "frame_id": str(frame["frame_id"]),
                    "video_id": video_id,
                    "user_id": user_id,
                    "timestamp_seconds": frame["timestamp_seconds"],
                    "frame_path": rel_path,
                    "thumbnail_path": thumb_rel,
                    "video_title": video_title,
                    "source_type": "local",
                },
            )
            points.append(point)

            if progress_callback:
                progress_callback((i + 1) / total)

        # Batch upsert to Qdrant
        if points:
            vector_db.upsert_embeddings(user_id, points)

        return len(points)
