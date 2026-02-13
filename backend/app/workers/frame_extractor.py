import os
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import cv2
from PIL import Image


@dataclass
class ExtractedFrame:
    frame_index: int
    timestamp_seconds: float
    local_path: str
    width: int = 0
    height: int = 0
    file_size_bytes: int = 0


class FrameExtractor:
    def __init__(self, output_base_dir: str):
        self.output_base_dir = Path(output_base_dir)

    def extract_frames(
        self,
        video_path: str,
        video_id: str,
        interval_seconds: float = 2.0,
        progress_callback: Callable | None = None,
    ) -> list[ExtractedFrame]:
        """Extract frames from video at specified interval."""
        output_dir = self.output_base_dir / video_id
        output_dir.mkdir(parents=True, exist_ok=True)

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            raise RuntimeError(f"Cannot open video: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_frames / fps if fps > 0 else 0
        frame_interval = int(fps * interval_seconds) if fps > 0 else 60

        frames: list[ExtractedFrame] = []
        frame_idx = 0
        extracted_idx = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_idx % frame_interval == 0:
                timestamp = frame_idx / fps if fps > 0 else 0
                filename = f"frame_{extracted_idx:06d}.jpg"
                filepath = output_dir / filename

                # Save frame
                cv2.imwrite(str(filepath), frame, [cv2.IMWRITE_JPEG_QUALITY, 85])

                # Generate thumbnail
                thumb_filename = f"thumb_{extracted_idx:06d}.jpg"
                thumb_path = output_dir / thumb_filename
                h, w = frame.shape[:2]
                thumb_w = 320
                thumb_h = int(h * (thumb_w / w))
                thumb = cv2.resize(frame, (thumb_w, thumb_h))
                cv2.imwrite(str(thumb_path), thumb, [cv2.IMWRITE_JPEG_QUALITY, 70])

                file_size = os.path.getsize(filepath)

                frames.append(ExtractedFrame(
                    frame_index=extracted_idx,
                    timestamp_seconds=round(timestamp, 3),
                    local_path=str(filepath),
                    width=w,
                    height=h,
                    file_size_bytes=file_size,
                ))

                extracted_idx += 1

                if progress_callback and total_frames > 0:
                    progress_callback(min(frame_idx / total_frames, 1.0))

            frame_idx += 1

        cap.release()
        return frames
