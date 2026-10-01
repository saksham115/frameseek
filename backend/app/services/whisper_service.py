"""Transcription: Azure OpenAI Whisper (replaces the self-hosted Whisper model).

``extract_audio`` (ffmpeg) splits audio into Whisper-sized MP3 pieces; ``transcribe`` calls the Azure OpenAI
Whisper deployment with verbose_json to get per-segment timings. No model weights ship
in the container. Auth via managed identity.
"""

from __future__ import annotations

import logging
import subprocess
from dataclasses import dataclass
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)

_TOKEN_SCOPE = "https://cognitiveservices.azure.com/.default"
_client = None


@dataclass
class WhisperSegment:
    index: int
    start: float
    end: float
    text: str
    avg_logprob: float


@dataclass
class TranscriptionResult:
    segments: list[WhisperSegment]
    language: str


def _get_client():
    global _client
    if _client is None:
        from azure.identity import DefaultAzureCredential, get_bearer_token_provider
        from openai import AzureOpenAI

        token_provider = get_bearer_token_provider(DefaultAzureCredential(), _TOKEN_SCOPE)
        _client = AzureOpenAI(
            azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
            azure_ad_token_provider=token_provider,
            api_version=settings.AZURE_OPENAI_API_VERSION,
            # The SDK default is 10 minutes per request with retries, so one stalled
            # request could hold a video for half an hour. A 10-minute audio piece
            # normally transcribes well within this.
            timeout=WHISPER_TIMEOUT_SECONDS,
            max_retries=2,
        )
    return _client


# Length of each audio piece sent to Whisper (about 2.4 MB at 32 kbps).
AUDIO_PIECE_SECONDS = 600
# Pieces shorter than this are dropped (Whisper rejects very short audio).
MIN_PIECE_SECONDS = 1.0
WHISPER_TIMEOUT_SECONDS = 120


def _duration_seconds(path: str) -> float | None:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
            capture_output=True, text=True, timeout=30,
        )
        return float(out.stdout.strip())
    except (ValueError, subprocess.TimeoutExpired, FileNotFoundError):
        return None


class WhisperService:
    def extract_audio(self, video_path: str, output_dir: str) -> list[tuple[str, float]] | None:
        """Extract speech-quality audio, split into pieces Whisper accepts.

        Returns [(path, start_seconds), ...] in order, or None if there's no audio track.
        Azure OpenAI Whisper rejects uploads over 25 MB, so the audio is encoded as 16 kHz
        mono MP3 at 32 kbps (about 14 MB an hour) and split every AUDIO_PIECE_SECONDS,
        which keeps every piece far below the limit for any video length.
        """
        probe_cmd = [
            "ffprobe", "-v", "error", "-select_streams", "a",
            "-show_entries", "stream=codec_type", "-of", "csv=p=0", video_path,
        ]
        try:
            result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
            if not result.stdout.strip():
                logger.info("No audio track found in %s", video_path)
                return None
        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            logger.warning("ffprobe failed: %s", e)
            return None

        pattern = str(Path(output_dir) / "audio_%04d.mp3")
        extract_cmd = [
            "ffmpeg", "-y", "-i", video_path, "-vn",
            "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "32k",
            "-f", "segment", "-segment_time", str(AUDIO_PIECE_SECONDS), "-reset_timestamps", "1",
            pattern,
        ]
        try:
            # Long videos take a while to decode; allow well beyond real time.
            subprocess.run(extract_cmd, capture_output=True, text=True, timeout=3600, check=True)
        except subprocess.CalledProcessError as e:
            logger.error("ffmpeg audio extraction failed: %s", e.stderr[-2000:])
            raise RuntimeError(f"Audio extraction failed: {e.stderr[-500:]}")
        except subprocess.TimeoutExpired:
            raise RuntimeError("Audio extraction timed out")

        pieces = sorted(Path(output_dir).glob("audio_*.mp3"))
        out: list[tuple[str, float]] = []
        offset = 0.0
        for piece in pieces:
            # Measure each piece: segment cuts land on audio frame boundaries, so
            # assuming exactly AUDIO_PIECE_SECONDS would drift on long videos.
            length = _duration_seconds(str(piece))
            # A video usually ends a moment past a piece boundary, leaving a sliver that
            # Whisper rejects ("audio_too_short") and that holds no usable speech. Such
            # slivers can be too short for ffprobe to measure at all (duration N/A).
            if length is None or length < MIN_PIECE_SECONDS:
                piece.unlink(missing_ok=True)
                continue
            out.append((str(piece), offset))
            offset += length
        return out

    def transcribe(self, audio_path: str, language: str | None = None) -> TranscriptionResult:
        client = _get_client()
        kwargs: dict = {"response_format": "verbose_json"}
        if language:
            kwargs["language"] = language

        with open(audio_path, "rb") as fh:
            result = client.audio.transcriptions.create(
                model=settings.AZURE_OPENAI_WHISPER_DEPLOYMENT,
                file=fh,
                **kwargs,
            )

        detected_language = getattr(result, "language", None) or language or "en"
        segments: list[WhisperSegment] = []
        for seg in getattr(result, "segments", None) or []:
            # Segments come back as objects or dicts depending on SDK version.
            get = (lambda k, d=None: seg.get(k, d)) if isinstance(seg, dict) else (lambda k, d=None: getattr(seg, k, d))
            segments.append(
                WhisperSegment(
                    index=int(get("id", 0)),
                    start=float(get("start", 0.0)),
                    end=float(get("end", 0.0)),
                    text=str(get("text", "")).strip(),
                    avg_logprob=float(get("avg_logprob", 0.0)),
                )
            )

        logger.info("Transcribed %d segments, language: %s", len(segments), detected_language)
        return TranscriptionResult(segments=segments, language=detected_language)
