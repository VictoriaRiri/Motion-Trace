from pathlib import Path
from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "MotionTrace"
    data_dir: Path = Path("backend/data")
    upload_dir: Path = Path("backend/data/uploads")
    analysis_dir: Path = Path("backend/data/analysis")
    yolo_model: str = "yolo11n.pt"
    detector_confidence: float = 0.35
    tracker_iou_threshold: float = 0.2
    tracker_max_lost_frames: int = 30
    target_fps: float = 24.0

    def ensure_dirs(self) -> None:
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.analysis_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
