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

store = AnalysisStore(settings.analysis_dir)
analyzer = MotionTraceAnalyzer()
metrics_analyzer = MovementMetricsAnalyzer()
uploaded_videos: dict[str, Path] = {}


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
    analysis_id, metadata, frames, trajectories = analyzer.analyze(video_id, video_path)
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
    metrics = metrics_analyzer.compute_for_player(player_id, frames)
    return metrics.model_dump(by_alias=True)
