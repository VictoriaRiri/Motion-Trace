from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from backend.api.analysis_store import AnalysisStore
from backend.config import settings
from backend.utils.video_io import save_upload

settings.ensure_dirs()
app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Application state and lazy initialization
store = AnalysisStore(settings.analysis_dir)
app.state.analyzer = None
app.state.metrics_analyzer = None
app.state.models_ready = False
uploaded_videos: dict[str, Path] = {}


@app.on_event("startup")
async def initialize_models() -> None:
    """Keep startup light enough for constrained hosts.

    Heavy CV objects are created on first analysis instead of during deploy,
    so Render health checks pass before model memory is needed.
    """
    app.state.models_ready = True



@app.get("/health")
async def health() -> dict:
    """Basic health endpoint reporting whether ML models are ready."""
    return {
        "status": "ok",
        "ready": bool(app.state.models_ready),
        "detector": settings.yolo_model,
        "targetFps": settings.target_fps,
    }


def get_analyzer():
    if app.state.analyzer is None:
        from backend.api.video_analyzer import MotionTraceAnalyzer

        app.state.analyzer = MotionTraceAnalyzer()
    return app.state.analyzer


def get_metrics_analyzer():
    if app.state.metrics_analyzer is None:
        from backend.analytics.movement_metrics import MovementMetricsAnalyzer

        app.state.metrics_analyzer = MovementMetricsAnalyzer()
    return app.state.metrics_analyzer



@app.post("/upload")
async def upload_video(file: UploadFile = File(...)) -> dict[str, str]:
    video_id, path = await save_upload(file, settings.upload_dir)
    uploaded_videos[video_id] = path
    return {"videoId": video_id, "filename": file.filename or path.name}


@app.post("/analyze")
async def analyze_video(payload: dict) -> dict:
    video_id = payload.get("videoId")
    if not video_id:
        raise HTTPException(status_code=400, detail="videoId is required")
    video_path = uploaded_videos.get(video_id)
    if not video_path or not video_path.exists():
        raise HTTPException(status_code=404, detail="Uploaded video was not found")
    if not getattr(app.state, "models_ready", False):
        raise HTTPException(status_code=503, detail="Analysis models are not ready")
    analysis_id, metadata, frames, trajectories = get_analyzer().analyze(video_id, video_path)
    store.save(analysis_id, metadata, frames, trajectories)
    return metadata.model_dump(by_alias=True)


@app.get("/frame/{analysis_id}/{frame_number}")
async def get_frame(analysis_id: str, frame_number: int) -> dict:
    frames = store.frames(analysis_id)
    if frame_number < 0 or frame_number >= len(frames):
        raise HTTPException(status_code=404, detail="Frame not found")
    return frames[frame_number].model_dump(by_alias=True)


@app.get("/players/{analysis_id}")
async def get_players(analysis_id: str) -> dict:
    metadata = store.metadata(analysis_id)
    return {"players": [player.model_dump(by_alias=True) for player in metadata.players]}


@app.get("/trajectory/{analysis_id}/{player_id}")
async def get_trajectory(analysis_id: str, player_id: int) -> dict:
    trajectories = store.trajectories(analysis_id)
    return {"playerId": player_id, "trajectory": trajectories.get(str(player_id), trajectories.get(player_id, {}))}


@app.get("/metrics/{analysis_id}/{player_id}")
async def get_metrics(analysis_id: str, player_id: int) -> dict:
    frames = store.frames(analysis_id)
    if not getattr(app.state, "models_ready", False):
        raise HTTPException(status_code=503, detail="Metrics analyzer is not ready")
    metrics = get_metrics_analyzer().compute_for_player(player_id, frames)
    return metrics.model_dump(by_alias=True)
