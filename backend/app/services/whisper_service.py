import logging
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)

_whisper_model = None


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


class WhisperService:
    """Self-hosted Whisper transcription with lazy-loaded singleton model."""

    def _get_model(self):
        global _whisper_model
        if _whisper_model is None:
            import whisper
            logger.info(f"Loading Whisper model: {settings.WHISPER_MODEL_SIZE} on {settings.WHISPER_DEVICE}")
            _whisper_model = whisper.load_model(settings.WHISPER_MODEL_SIZE, device=settings.WHISPER_DEVICE)
            logger.info("Whisper model loaded")
        return _whisper_model

    def extract_audio(self, video_path: str, output_dir: str) -> str | None:
        """Extract 16kHz mono WAV from video using ffmpeg.

        Returns the audio file path, or None if the video has no audio track.
        """
        output_path = str(Path(output_dir) / "audio.wav")

        # First check if video has an audio stream
        probe_cmd = [
            "ffprobe", "-v", "error",
            "-select_streams", "a",
            "-show_entries", "stream=codec_type",
            "-of", "csv=p=0",
            video_path,
        ]
        try:
            result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
            if not result.stdout.strip():
                logger.info(f"No audio track found in {video_path}")
                return None
        except (subprocess.TimeoutExpired, FileNotFoundError) as e:
            logger.warning(f"ffprobe failed: {e}")
            return None

        # Extract audio as 16kHz mono WAV
        extract_cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            output_path,
        ]
        try:
            subprocess.run(extract_cmd, capture_output=True, text=True, timeout=300, check=True)
            return output_path
        except subprocess.CalledProcessError as e:
            logger.error(f"ffmpeg audio extraction failed: {e.stderr}")
            raise RuntimeError(f"Audio extraction failed: {e.stderr}")
        except subprocess.TimeoutExpired:
            raise RuntimeError("Audio extraction timed out")

    def transcribe(self, audio_path: str, language: str | None = None) -> TranscriptionResult:
        """Run Whisper transcription on an audio file."""
        model = self._get_model()

        transcribe_kwargs = {
            "fp16": False,
            "verbose": False,
        }
        if language:
            transcribe_kwargs["language"] = language
        elif settings.WHISPER_LANGUAGE:
            transcribe_kwargs["language"] = settings.WHISPER_LANGUAGE

        result = model.transcribe(audio_path, **transcribe_kwargs)

        segments = []
        for seg in result.get("segments", []):
            segments.append(WhisperSegment(
                index=seg["id"],
                start=seg["start"],
                end=seg["end"],
                text=seg["text"].strip(),
                avg_logprob=seg.get("avg_logprob", 0.0),
            ))

        detected_language = result.get("language", "en")
        logger.info(f"Transcribed {len(segments)} segments, language: {detected_language}")

        return TranscriptionResult(segments=segments, language=detected_language)
