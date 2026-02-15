import asyncio
import logging
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import async_session
from app.models.frame import Frame
from app.models.job import Job
from app.models.transcript import TranscriptSegment
from app.models.video import Video
from app.utils.gcs_client import GCSClient
from app.workers.audio_transcriber import AudioTranscriber
from app.workers.embedding_generator import EmbeddingGenerator
from app.workers.frame_extractor import FrameExtractor

logger = logging.getLogger(__name__)


async def process_video(job_id: str):
    """Main video processing pipeline (5 steps)."""
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

            # Step 1: Extract frames (0 → 30%)
            extractor = FrameExtractor(str(settings.storage_path / "frames"))

            extracted = extractor.extract_frames(
                video_path=video.file_path,
                video_id=str(video.video_id),
                interval_seconds=job.frame_interval_seconds,
            )

            job.total_frames = len(extracted)
            job.progress = 30
            job.current_step = "saving_frames"
            video.processing_progress = 30
            await db.commit()

            # Upload frames to GCS if enabled
            frame_gcs_paths: dict[int, str] = {}
            if GCSClient.is_enabled():
                gcs = GCSClient.get()
                for ef in extracted:
                    frame_gcs = f"frames/{video.video_id}/frame_{ef.frame_index:06d}.jpg"
                    gcs.upload_file(ef.local_path, frame_gcs, content_type="image/jpeg")
                    frame_gcs_paths[ef.frame_index] = frame_gcs
                    # Upload thumbnail
                    thumb_local = ef.local_path.replace("frame_", "thumb_")
                    thumb_gcs = f"frames/{video.video_id}/thumb_{ef.frame_index:06d}.jpg"
                    if Path(thumb_local).exists():
                        gcs.upload_file(thumb_local, thumb_gcs, content_type="image/jpeg")

            # Step 2: Save frame records to DB (30 → 40%)
            frame_dicts = []
            for ef in extracted:
                frame = Frame(
                    video_id=video.video_id,
                    user_id=video.user_id,
                    frame_index=ef.frame_index,
                    timestamp_seconds=ef.timestamp_seconds,
                    frame_path=ef.local_path,
                    thumbnail_path=ef.local_path.replace("frame_", "thumb_"),
                    gcs_path=frame_gcs_paths.get(ef.frame_index),
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
                    "gcs_path": frame_gcs_paths.get(ef.frame_index),
                })

            job.progress = 40
            job.current_step = "transcribing_audio"
            video.processing_progress = 40
            await db.commit()

            # Step 3: Transcribe audio (40 → 55%)
            transcript_chunks = []
            await _transcribe_audio(db, video, frame_dicts, transcript_chunks)

            job.progress = 55
            job.current_step = "generating_embeddings"
            video.processing_progress = 55
            await db.commit()

            # Step 4: Generate frame embeddings (55 → 80%)
            generator = EmbeddingGenerator()

            stored = await generator.generate_and_store(
                user_id=str(video.user_id),
                video_id=str(video.video_id),
                video_title=video.title,
                frames=frame_dicts,
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

            job.progress = 80
            job.current_step = "embedding_transcripts"
            video.processing_progress = 80
            await db.commit()

            # Step 5: Generate transcript embeddings (80 → 100%)
            transcript_stored = 0
            if video.transcript_status == "completed" and transcript_chunks:
                transcript_stored = await generator.generate_and_store_transcripts(
                    user_id=str(video.user_id),
                    video_id=str(video.video_id),
                    video_title=video.title,
                    chunks=transcript_chunks,
                    frames=frame_dicts,
                )

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

            # Clean up local files when GCS is the source of truth
            if GCSClient.is_enabled() and video.gcs_path:
                frames_dir = Path(settings.STORAGE_BASE_PATH) / "frames" / str(video.video_id)
                if frames_dir.exists():
                    shutil.rmtree(frames_dir, ignore_errors=True)
                if video.file_path:
                    video_dir = Path(video.file_path).parent
                    if video_dir.exists():
                        shutil.rmtree(video_dir, ignore_errors=True)

                # Null out stale local paths in DB
                video.file_path = None
                result = await db.execute(
                    select(Frame).where(Frame.video_id == video.video_id)
                )
                for frame in result.scalars().all():
                    frame.frame_path = None
                    frame.thumbnail_path = None
                await db.commit()

                logger.info(f"Job {job_id}: cleaned up local files and DB paths (GCS is source of truth)")

            logger.info(
                f"Job {job_id} completed: {len(extracted)} frames, {stored} frame embeddings, "
                f"{transcript_stored} transcript embeddings"
            )

        except Exception as e:
            logger.exception(f"Job {job_id} failed: {e}")
            job.status = "failed"
            job.error_message = str(e)
            job.completed_at = datetime.now(timezone.utc)
            video.status = "error"
            video.processing_progress = 0
            video.error_message = str(e)
            await db.commit()


async def _transcribe_audio(
    db: AsyncSession,
    video: Video,
    frame_dicts: list[dict],
    transcript_chunks_out: list,
    max_retries: int = 1,
    video_path: str | None = None,
):
    """Run transcription with retry. Non-blocking — failures don't stop the pipeline."""
    transcriber = AudioTranscriber()
    source_path = video_path or video.file_path

    for attempt in range(max_retries + 1):
        try:
            video.transcript_status = "processing"
            await db.commit()

            with tempfile.TemporaryDirectory() as tmp_dir:
                result = transcriber.transcribe_video(source_path, tmp_dir)

            if result is None:
                # No audio track
                video.transcript_status = "skipped"
                await db.commit()
                logger.info(f"Video {video.video_id}: no audio track, skipping transcription")
                return

            segments, language = result

            if not segments:
                video.transcript_status = "skipped"
                await db.commit()
                logger.info(f"Video {video.video_id}: no speech detected")
                return

            # Save transcript segments to DB
            for seg in segments:
                # Find nearest frame for this segment
                midpoint = (seg.start + seg.end) / 2
                nearest = EmbeddingGenerator._find_nearest_frame(frame_dicts, midpoint)
                nearest_frame_id = UUID(nearest["frame_id"]) if nearest else None

                ts = TranscriptSegment(
                    video_id=video.video_id,
                    user_id=video.user_id,
                    segment_index=seg.index,
                    start_seconds=seg.start,
                    end_seconds=seg.end,
                    text=seg.text,
                    language=language,
                    confidence=seg.avg_logprob,
                    nearest_frame_id=nearest_frame_id,
                )
                db.add(ts)

            await db.flush()

            # Chunk segments for embedding
            chunks = AudioTranscriber.chunk_segments(segments)
            transcript_chunks_out.extend(chunks)

            # Assign chunk groups to segment records
            for chunk in chunks:
                for seg_idx in chunk.segment_indices:
                    # Find the segment record by index and update chunk_group
                    pass  # chunk_group is informational; not critical

            video.has_transcript = True
            video.transcript_status = "completed"
            video.transcript_language = language
            video.transcript_segment_count = len(segments)
            video.transcript_error = None
            await db.commit()

            logger.info(
                f"Video {video.video_id}: transcribed {len(segments)} segments "
                f"into {len(chunks)} chunks, language: {language}"
            )
            return

        except Exception as e:
            logger.warning(
                f"Transcription attempt {attempt + 1}/{max_retries + 1} failed "
                f"for video {video.video_id}: {e}"
            )
            if attempt < max_retries:
                continue
            # Final failure — non-blocking, pipeline continues
            video.transcript_status = "failed"
            video.transcript_error = str(e)[:2000]
            await db.commit()
            logger.error(f"Video {video.video_id}: transcription failed after retries: {e}")
            return


async def transcribe_video_standalone(video_id: str):
    """Re-run just the transcription + transcript embedding steps for a video.

    Used by the retry-transcript endpoint.
    """
    async with async_session() as db:
        result = await db.execute(select(Video).where(Video.video_id == UUID(video_id)))
        video = result.scalar_one_or_none()
        if not video:
            logger.error(f"Video {video_id} not found for transcript retry")
            return

        # Load existing frames for nearest-frame lookup
        result = await db.execute(
            select(Frame).where(Frame.video_id == video.video_id).order_by(Frame.frame_index)
        )
        frames = result.scalars().all()
        frame_dicts = [
            {
                "frame_id": str(f.frame_id),
                "frame_index": f.frame_index,
                "timestamp_seconds": float(f.timestamp_seconds),
                "local_path": f.frame_path,
                "gcs_path": f.gcs_path,
            }
            for f in frames
        ]

        if not frame_dicts:
            logger.error(f"Video {video_id}: no frames found, cannot retry transcription")
            return

        # Clear any previous transcript segments
        from sqlalchemy import delete
        await db.execute(
            delete(TranscriptSegment).where(TranscriptSegment.video_id == video.video_id)
        )
        await db.commit()

        # Resolve video source — download from GCS if local file is gone
        video_path = video.file_path
        tmp_dir = None
        try:
            local_missing = not video_path or not Path(video_path).exists()
            if local_missing and GCSClient.is_enabled() and video.gcs_path:
                tmp_dir = tempfile.mkdtemp()
                ext = Path(video.file_path).suffix if video.file_path else ".mp4"
                video_path = os.path.join(tmp_dir, f"source_video{ext}")
                GCSClient.get().download_file(video.gcs_path, video_path)
                logger.info(f"Video {video_id}: downloaded from GCS for transcript retry")
            elif local_missing:
                logger.error(f"Video {video_id}: no local file and GCS not available, cannot retry")
                video.transcript_status = "failed"
                video.transcript_error = "Video file not available for transcription"
                await db.commit()
                return

            # Run transcription
            transcript_chunks: list = []
            await _transcribe_audio(db, video, frame_dicts, transcript_chunks, video_path=video_path)

            # Generate transcript embeddings if successful
            if video.transcript_status == "completed" and transcript_chunks:
                generator = EmbeddingGenerator()
                stored = await generator.generate_and_store_transcripts(
                    user_id=str(video.user_id),
                    video_id=str(video.video_id),
                    video_title=video.title,
                    chunks=transcript_chunks,
                    frames=frame_dicts,
                )
                logger.info(f"Video {video_id}: retry stored {stored} transcript embeddings")

            await db.commit()
        finally:
            if tmp_dir and Path(tmp_dir).exists():
                shutil.rmtree(tmp_dir, ignore_errors=True)
