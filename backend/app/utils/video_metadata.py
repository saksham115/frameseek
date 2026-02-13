import json
import subprocess
from dataclasses import dataclass


@dataclass
class VideoMetadata:
    duration_seconds: float | None = None
    fps: float | None = None
    width: int | None = None
    height: int | None = None
    codec: str | None = None


def extract_metadata(file_path: str) -> VideoMetadata:
    """Extract video metadata using ffprobe."""
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                "-show_streams",
                file_path,
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        data = json.loads(result.stdout)

        video_stream = None
        for stream in data.get("streams", []):
            if stream.get("codec_type") == "video":
                video_stream = stream
                break

        if not video_stream:
            return VideoMetadata()

        fps = None
        r_frame_rate = video_stream.get("r_frame_rate", "")
        if "/" in r_frame_rate:
            num, den = r_frame_rate.split("/")
            if int(den) != 0:
                fps = round(int(num) / int(den), 4)

        return VideoMetadata(
            duration_seconds=float(data.get("format", {}).get("duration", 0)),
            fps=fps,
            width=int(video_stream.get("width", 0)) or None,
            height=int(video_stream.get("height", 0)) or None,
            codec=video_stream.get("codec_name"),
        )
    except Exception:
        return VideoMetadata()
