"""Long videos: live progress, stalled-job recovery, chunked transcription, parallel indexing."""

import asyncio
import shutil
import subprocess
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select, text

from app.models.job import Job
from app.models.video import Video
from app.services.whisper_service import TranscriptionResult, WhisperSegment
from app.workers import embedding_generator as eg
from app.workers.audio_transcriber import AudioTranscriber
from app.workers.progress import STALLED_AFTER_SECONDS, ProgressReporter, VideoDeleted
from tests.factories import create_job, create_video


async def _processing_video(db_session, user_id, idle_seconds):
    video = await create_video(db_session, user_id, status="processing")
    await create_job(db_session, user_id, video.video_id, status="processing")
    await db_session.execute(
        text("UPDATE videos SET updated_at = :t WHERE video_id = :v"),
        {"t": datetime.now(timezone.utc) - timedelta(seconds=idle_seconds), "v": str(video.video_id)},
    )
    await db_session.commit()
    return video


class TestStalledVideos:
    async def test_video_without_heartbeat_becomes_retryable(self, client, db_session, test_user):
        stalled = await _processing_video(db_session, test_user["user_id"], STALLED_AFTER_SECONDS + 60)
        live = await _processing_video(db_session, test_user["user_id"], 30)

        resp = await client.get("/api/v1/videos", headers=test_user["headers"])
        statuses = {v["video_id"]: v["status"] for v in resp.json()["data"]["videos"]}
        assert statuses[str(stalled.video_id)] == "error"
        assert statuses[str(live.video_id)] == "processing"

        job = (await db_session.execute(
            select(Job).where(Job.video_id == stalled.video_id).execution_options(populate_existing=True)
        )).scalar_one()
        assert job.status == "failed"
        video = (await db_session.execute(
            select(Video).where(Video.video_id == stalled.video_id).execution_options(populate_existing=True)
        )).scalar_one()
        assert "Retry" in video.error_message

    async def test_detail_view_also_recovers_it(self, client, db_session, test_user):
        stalled = await _processing_video(db_session, test_user["user_id"], STALLED_AFTER_SECONDS + 60)
        resp = await client.get(f"/api/v1/videos/{stalled.video_id}", headers=test_user["headers"])
        assert resp.json()["data"]["video"]["status"] == "error"

    async def test_only_the_readers_videos_are_touched(self, client, db_session, test_user, second_user):
        theirs = await _processing_video(db_session, second_user["user_id"], STALLED_AFTER_SECONDS + 60)
        await client.get("/api/v1/videos", headers=test_user["headers"])
        video = (await db_session.execute(
            select(Video).where(Video.video_id == theirs.video_id).execution_options(populate_existing=True)
        )).scalar_one()
        assert video.status == "processing"


class TestProgressReporter:
    def test_stage_maps_fraction_onto_range(self):
        r = ProgressReporter(job_id=None, video_id=None)
        report = r.stage(55, 80, lambda f: f"indexing_frames:{round(f * 10)}/10")
        report(0.5)
        assert (r.progress, r.step) == (67, "indexing_frames:5/10")
        report(1.0)
        assert (r.progress, r.step) == (80, "indexing_frames:10/10")

    def test_reporting_after_deletion_stops_the_pipeline(self):
        r = ProgressReporter(job_id=None, video_id=None)
        r.deleted = True
        with pytest.raises(VideoDeleted):
            r.stage(0, 25, "extracting_frames")(0.3)


class TestChunkedTranscription:
    def test_pieces_are_stitched_with_their_offsets(self, monkeypatch, tmp_path):
        t = AudioTranscriber.__new__(AudioTranscriber)

        class FakeWhisper:
            languages_requested = []

            def extract_audio(self, video_path, output_dir):
                return [(str(tmp_path / "a.mp3"), 0.0), (str(tmp_path / "b.mp3"), 600.2)]

            def transcribe(self, path, language=None):
                self.languages_requested.append(language)
                return TranscriptionResult(
                    segments=[WhisperSegment(index=0, start=1.0, end=3.0, text=f"in {path[-5]}", avg_logprob=-0.1)],
                    language="hi",
                )

        t.whisper_service = FakeWhisper()
        progress = []
        segments, language = t.transcribe_video("video.mp4", str(tmp_path), progress.append)
        assert [(s.index, s.start, s.end, s.text) for s in segments] == [
            (0, 1.0, 3.0, "in a"),
            (1, 601.2, 603.2, "in b"),
        ]
        assert language == "hi"
        # Never pass a detected name like "hindi" back in: Whisper only accepts codes.
        assert FakeWhisper.languages_requested == [None, None]
        assert progress == [0.5, 1.0]

    def test_one_failed_piece_keeps_the_rest(self, tmp_path):
        t = AudioTranscriber.__new__(AudioTranscriber)

        class FlakyWhisper:
            def extract_audio(self, video_path, output_dir):
                return [(str(tmp_path / "a.mp3"), 0.0), (str(tmp_path / "b.mp3"), 600.0)]

            def transcribe(self, path, language=None):
                if path.endswith("a.mp3"):
                    raise RuntimeError("timed out")
                return TranscriptionResult(
                    segments=[WhisperSegment(index=0, start=2.0, end=4.0, text="hello", avg_logprob=-0.1)],
                    language="en",
                )

        t.whisper_service = FlakyWhisper()
        segments, language = t.transcribe_video("video.mp4", str(tmp_path))
        assert [(s.start, s.text) for s in segments] == [(602.0, "hello")]

    def test_all_pieces_failing_is_an_error(self, tmp_path):
        t = AudioTranscriber.__new__(AudioTranscriber)

        class DeadWhisper:
            def extract_audio(self, video_path, output_dir):
                return [(str(tmp_path / "a.mp3"), 0.0)]

            def transcribe(self, path, language=None):
                raise RuntimeError("service down")

        t.whisper_service = DeadWhisper()
        with pytest.raises(RuntimeError, match="service down"):
            t.transcribe_video("video.mp4", str(tmp_path))

    @pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg not installed")
    def test_audio_is_split_into_small_pieces(self, monkeypatch, tmp_path):
        from app.services import whisper_service as ws

        def tone(seconds: float):
            src = tmp_path / f"tone-{seconds}.mp4"
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error",
                 "-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}",
                 "-f", "lavfi", "-i", f"color=c=black:s=64x64:d={seconds}",
                 "-shortest", "-c:a", "aac", str(src)],
                check=True,
            )
            out = tmp_path / f"out-{seconds}"
            out.mkdir()
            return ws.WhisperService().extract_audio(str(src), str(out))

        monkeypatch.setattr(ws, "AUDIO_PIECE_SECONDS", 2)
        pieces = tone(5.5)
        assert len(pieces) == 3
        offsets = [round(o, 1) for _, o in pieces]
        assert offsets[0] == 0.0 and 1.8 <= offsets[1] <= 2.2 and 3.8 <= offsets[2] <= 4.2
        assert all(p.endswith(".mp3") for p, _ in pieces)

        # A sub-second tail (Whisper rejects it as too short) is dropped.
        assert len(tone(4.3)) == 2


class TestParallelFrameIndexing:
    async def test_bounded_concurrency_and_order(self, monkeypatch):
        in_flight = peak = 0

        async def fake_embed(path):
            nonlocal in_flight, peak
            in_flight += 1
            peak = max(peak, in_flight)
            await asyncio.sleep(0.01)
            in_flight -= 1
            return [float(path.split("_")[-1])]

        stored = []
        monkeypatch.setattr(eg.vector_db, "upsert_embeddings", lambda user, points: stored.extend(points))
        gen = eg.EmbeddingGenerator.__new__(eg.EmbeddingGenerator)
        gen.embedding_service = type("S", (), {"generate_image_embedding": staticmethod(fake_embed)})()

        frames = [
            {"frame_id": f"f{i}", "frame_index": i, "timestamp_seconds": i * 2.0, "local_path": f"frame_{i}", "gcs_path": None}
            for i in range(30)
        ]
        progress = []
        count = await gen.generate_and_store("u", "v", "t", frames, progress.append)

        assert count == 30
        assert 1 < peak <= eg.FRAME_CONCURRENCY
        assert [p.vector[0] for p in stored] == [float(i) for i in range(30)]
        assert progress[-1] == 1.0 and len(progress) == 30
