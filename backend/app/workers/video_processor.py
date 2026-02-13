import asyncio
import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session
from app.models.frame import Frame
from app.models.job import Job
from app.models.video import Video
from app.workers.embedding_generator import EmbeddingGenerator
from app.workers.frame_extractor import FrameExtractor

logger = logging.getLogger(__name__)


async def process_video(job_id: str):
    """Main video processing pipeline."""
    async with async_session() as db:
        # Load job
        result = await db.execute(select(Job).where(Job.job_id == UUID(job_id)))
        job = result.scalar_one_or_none()
        if not job:
            logger.error(f"Job {job_id} not found")
            return

        # Load video
        result = await db.execute(select(Video).where(Video.video_id == job.video_id))
        video = result.scalar_one_or_none()
        if not video:
            logger.error(f"Video {job.video_id} not found")
            return

        try:
            # Update status
            job.status = "processing"
            job.started_at = datetime.now(timezone.utc)
            job.current_step = "extracting_frames"
            video.status = "processing"
            await db.commit()

            # Step 1: Extract frames
            extractor = FrameExtractor(str(settings.storage_path / "frames"))

            def frame_progress(pct: float):
                # We'll update DB in batches, not per-frame for performance
                pass

            extracted = extractor.extract_frames(
                video_path=video.file_path,
                video_id=str(video.video_id),
                interval_seconds=job.frame_interval_seconds,
                progress_callback=frame_progress,
            )

            job.total_frames = len(extracted)
            job.progress = 40
            job.current_step = "saving_frames"
            video.processing_progress = 40
            await db.commit()

            # Step 2: Save frame records to DB
            frame_dicts = []
            for ef in extracted:
                frame = Frame(
                    video_id=video.video_id,
                    user_id=video.user_id,
                    frame_index=ef.frame_index,
                    timestamp_seconds=ef.timestamp_seconds,
                    frame_path=ef.local_path,
                    thumbnail_path=ef.local_path.replace("frame_", "thumb_"),
                    width=ef.width,
                    height=ef.height,
                    file_size_bytes=ef.file_size_bytes,
                )
                db.add(frame)
                await db.flush()

                frame_dicts.append({
                    "frame_id": str(frame.frame_id),
                    "frame_index": ef.frame_index,
                    "timestamp_seconds": ef.timestamp_seconds,
                    "local_path": ef.local_path,
                })

            job.progress = 60
            job.current_step = "generating_embeddings"
            video.processing_progress = 60
            await db.commit()

            # Step 3: Generate embeddings and store in Qdrant
            generator = EmbeddingGenerator()

            def embed_progress(pct: float):
                pass

            stored = await generator.generate_and_store(
                user_id=str(video.user_id),
                video_id=str(video.video_id),
                video_title=video.title,
                frames=frame_dicts,
                progress_callback=embed_progress,
            )

            # Update embedding IDs on frame records
            for fd in frame_dicts:
                result = await db.execute(
                    select(Frame).where(Frame.frame_id == UUID(fd["frame_id"]))
                )
                frame_record = result.scalar_one_or_none()
                if frame_record:
                    frame_record.embedding_id = fd["frame_id"]
                    frame_record.embedding_generated_at = datetime.now(timezone.utc)

            # Complete
            job.status = "completed"
            job.progress = 100
            job.current_step = "done"
            job.processed_frames = len(extracted)
            job.completed_at = datetime.now(timezone.utc)
            video.status = "ready"
            video.processing_progress = 100
            video.frame_count = len(extracted)
            video.processed_at = datetime.now(timezone.utc)
            await db.commit()

            logger.info(f"Job {job_id} completed: {len(extracted)} frames, {stored} embeddings")

        except Exception as e:
            logger.exception(f"Job {job_id} failed: {e}")
            job.status = "failed"
            job.error_message = str(e)
            job.completed_at = datetime.now(timezone.utc)
            video.status = "error"
            video.processing_progress = 0
            video.error_message = str(e)
            await db.commit()
