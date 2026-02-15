import logging
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from app.services.whisper_service import WhisperSegment, WhisperService

logger = logging.getLogger(__name__)


@dataclass
class TranscriptChunk:
    chunk_index: int
    start_seconds: float
    end_seconds: float
    text: str
    segment_indices: list[int] = field(default_factory=list)
    avg_confidence: float = 0.0


class AudioTranscriber:
    def __init__(self):
        self.whisper_service = WhisperService()

    def transcribe_video(self, video_path: str, output_dir: str) -> tuple[list[WhisperSegment], str] | None:
        """Extract audio and transcribe a video.

        Returns (segments, language) or None if the video has no audio track.
        """
        audio_path = self.whisper_service.extract_audio(video_path, output_dir)
        if audio_path is None:
            return None

        try:
            result = self.whisper_service.transcribe(audio_path)
            return result.segments, result.language
        finally:
            # Clean up temp audio file
            try:
                Path(audio_path).unlink(missing_ok=True)
            except OSError:
                pass

    @staticmethod
    def chunk_segments(
        segments: list[WhisperSegment],
        max_words: int = 150,
        max_seconds: float = 45.0,
        pause_threshold: float = 3.0,
    ) -> list[TranscriptChunk]:
        """Merge adjacent Whisper segments into embedding-friendly chunks.

        Breaks on:
        - Word count limit (~100-200 words)
        - Duration limit (~30-45s)
        - Long pause between segments (>3s = likely topic change)
        """
        if not segments:
            return []

        chunks: list[TranscriptChunk] = []
        current_texts: list[str] = []
        current_indices: list[int] = []
        current_logprobs: list[float] = []
        current_start: float = segments[0].start
        current_word_count: int = 0

        def flush_chunk():
            nonlocal current_texts, current_indices, current_logprobs, current_start, current_word_count
            if not current_texts:
                return
            text = " ".join(current_texts)
            avg_conf = sum(current_logprobs) / len(current_logprobs) if current_logprobs else 0.0
            end_seg = segments[current_indices[-1]] if current_indices else segments[0]
            chunks.append(TranscriptChunk(
                chunk_index=len(chunks),
                start_seconds=current_start,
                end_seconds=end_seg.end,
                text=text,
                segment_indices=list(current_indices),
                avg_confidence=avg_conf,
            ))
            current_texts = []
            current_indices = []
            current_logprobs = []
            current_word_count = 0

        prev_end: float = segments[0].start

        for seg in segments:
            # Skip empty segments
            if not seg.text.strip():
                continue

            seg_word_count = len(seg.text.split())
            pause = seg.start - prev_end
            duration = seg.end - current_start if current_texts else 0

            # Break conditions
            should_break = (
                current_texts and (
                    pause > pause_threshold
                    or current_word_count + seg_word_count > max_words
                    or duration + (seg.end - seg.start) > max_seconds
                )
            )

            if should_break:
                flush_chunk()
                current_start = seg.start

            current_texts.append(seg.text.strip())
            current_indices.append(seg.index)
            current_logprobs.append(seg.avg_logprob)
            current_word_count += seg_word_count
            prev_end = seg.end

        flush_chunk()
        return chunks
