from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile


async def save_upload(upload: UploadFile, upload_dir: Path) -> tuple[str, Path]:
    suffix = Path(upload.filename or "video.mp4").suffix or ".mp4"
    video_id = uuid4().hex
    target = upload_dir / f"{video_id}{suffix}"
    with target.open("wb") as output:
        while chunk := await upload.read(1024 * 1024):
            output.write(chunk)
    return video_id, target


def video_metadata(video_path: Path) -> tuple[float, int, float]:
    import cv2

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise ValueError("Unsupported or unreadable video file.")
    fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = frame_count / fps if fps > 0 else 0.0
    capture.release()
    return fps, frame_count, duration
