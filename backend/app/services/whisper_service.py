"""Transcription: Azure OpenAI Whisper (replaces the self-hosted Whisper model).

``extract_audio`` (ffmpeg) is unchanged; ``transcribe`` now calls the Azure OpenAI
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
        )
    return _client


class WhisperService:
    def extract_audio(self, video_path: str, output_dir: str) -> str | None:
        """Extract 16kHz mono WAV; returns None if the video has no audio track."""
        output_path = str(Path(output_dir) / "audio.wav")

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

        extract_cmd = [
            "ffmpeg", "-y", "-i", video_path, "-vn",
            "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", output_path,
        ]
        try:
            subprocess.run(extract_cmd, capture_output=True, text=True, timeout=300, check=True)
            return output_path
        except subprocess.CalledProcessError as e:
            logger.error("ffmpeg audio extraction failed: %s", e.stderr)
            raise RuntimeError(f"Audio extraction failed: {e.stderr}")
        except subprocess.TimeoutExpired:
            raise RuntimeError("Audio extraction timed out")

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
