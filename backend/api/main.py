from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from backend.analytics.movement_metrics import MovementMetricsAnalyzer
from backend.api.analysis_store import AnalysisStore
from backend.api.video_analyzer import MotionTraceAnalyzer
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
    """Initialize heavy ML models on startup and mark readiness.

    Deferring model construction to startup prevents import-time failures
    when the runtime environment is missing native dependencies or model
    files. If initialization fails, the app stays up but reports not ready.
    """
    try:
        # Instantiate model-backed components here so import-time code
        # doesn't attempt to load models.
        app.state.analyzer = MotionTraceAnalyzer()
        app.state.metrics_analyzer = MovementMetricsAnalyzer()
        app.state.models_ready = True
    except Exception:
        # Keep the app running but mark models as not ready; logs will
        # help diagnose the cause on the host.
        import traceback

        traceback.print_exc()
        app.state.models_ready = False



@app.get("/health")
async def health() -> dict:
    """Basic health endpoint reporting whether ML models are ready."""
    return {"status": "ok", "ready": bool(app.state.models_ready)}



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
    if not getattr(app.state, "models_ready", False) or app.state.analyzer is None:
        raise HTTPException(status_code=503, detail="Analysis models are not ready")
    analysis_id, metadata, frames, trajectories = app.state.analyzer.analyze(video_id, video_path)
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
    if not getattr(app.state, "models_ready", False) or app.state.metrics_analyzer is None:
        raise HTTPException(status_code=503, detail="Metrics analyzer is not ready")
    metrics = app.state.metrics_analyzer.compute_for_player(player_id, frames)
    return metrics.model_dump(by_alias=True)
