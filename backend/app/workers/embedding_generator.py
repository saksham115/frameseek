import uuid
from typing import Callable

from app.repositories.vector_db import EmbeddingPoint, vector_db
from app.services.embedding_service import EmbeddingService
from app.workers.audio_transcriber import TranscriptChunk


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

            gcs_frame = frame.get("gcs_path")
            gcs_thumb = gcs_frame.replace("frame_", "thumb_") if gcs_frame else None

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
                    "gcs_frame_path": gcs_frame,
                    "gcs_thumb_path": gcs_thumb,
                },
            )
            points.append(point)

            if progress_callback:
                progress_callback((i + 1) / total)

        # Batch upsert to Qdrant
        if points:
            vector_db.upsert_embeddings(user_id, points)

        return len(points)

    async def generate_and_store_transcripts(
        self,
        user_id: str,
        video_id: str,
        video_title: str,
        chunks: list[TranscriptChunk],
        frames: list[dict],
        progress_callback: Callable | None = None,
    ) -> int:
        """Generate embeddings for transcript chunks and store in Qdrant."""
        if not chunks:
            return 0

        points: list[EmbeddingPoint] = []
        total = len(chunks)

        for i, chunk in enumerate(chunks):
            embedding = await self.embedding_service.generate_text_embedding(chunk.text)

            # Find nearest frame by timestamp midpoint
            midpoint = (chunk.start_seconds + chunk.end_seconds) / 2
            nearest_frame = self._find_nearest_frame(frames, midpoint)

            nearest_frame_id = nearest_frame["frame_id"] if nearest_frame else None
            nearest_frame_rel = (
                f"{video_id}/frame_{nearest_frame['frame_index']:06d}.jpg"
                if nearest_frame else ""
            )
            nearest_thumb_rel = (
                f"{video_id}/thumb_{nearest_frame['frame_index']:06d}.jpg"
                if nearest_frame else ""
            )

            gcs_frame = nearest_frame.get("gcs_path") if nearest_frame else None
            gcs_thumb = gcs_frame.replace("frame_", "thumb_") if gcs_frame else None

            point_id = str(uuid.uuid4())
            point = EmbeddingPoint(
                id=point_id,
                vector=embedding,
                payload={
                    "segment_id": point_id,
                    "video_id": video_id,
                    "user_id": user_id,
                    "timestamp_seconds": midpoint,
                    "segment_start": chunk.start_seconds,
                    "segment_end": chunk.end_seconds,
                    "transcript_text": chunk.text,
                    "video_title": video_title,
                    "source_type": "transcript",
                    "frame_path": nearest_frame_rel,
                    "thumbnail_path": nearest_thumb_rel,
                    "frame_id": nearest_frame_id,
                    "gcs_frame_path": gcs_frame,
                    "gcs_thumb_path": gcs_thumb,
                },
            )
            points.append(point)

            if progress_callback:
                progress_callback((i + 1) / total)

        if points:
            vector_db.upsert_embeddings(user_id, points)

        return len(points)

    @staticmethod
    def _find_nearest_frame(frames: list[dict], target_seconds: float) -> dict | None:
        """Find the frame closest to the target timestamp."""
        if not frames:
            return None
        return min(frames, key=lambda f: abs(float(f["timestamp_seconds"]) - target_seconds))
