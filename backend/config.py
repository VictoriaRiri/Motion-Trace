import os
from pathlib import Path
from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "MotionTrace"
    data_dir: Path = Path("backend/data")
    upload_dir: Path = Path("backend/data/uploads")
    analysis_dir: Path = Path("backend/data/analysis")
    yolo_model: str = os.getenv("YOLO_MODEL", "opencv-hog")
    detector_confidence: float = float(os.getenv("DETECTOR_CONFIDENCE", "0.35"))
    tracker_iou_threshold: float = 0.2
    tracker_max_lost_frames: int = 30
    target_fps: float = float(os.getenv("TARGET_FPS", "8.0"))
    max_analysis_frames: int = int(os.getenv("MAX_ANALYSIS_FRAMES", "360"))

    def ensure_dirs(self) -> None:
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.analysis_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
