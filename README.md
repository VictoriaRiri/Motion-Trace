# MotionTrace

MotionTrace is a movement-analysis platform built around a hybrid computer-vision pipeline:

```text
Video
  -> YOLO person detection
  -> persistent multi-object tracking
  -> crop each tracked player
  -> MediaPipe Pose on each crop
  -> convert landmarks back to frame coordinates
  -> store trajectories by player ID
  -> compute movement analytics
  -> synchronized UI
```

YOLO is responsible for person detection only. MediaPipe is responsible for landmark estimation only. Tracking keeps stable player IDs so trajectories never mix between players.

## Project Structure

- `backend/detection/yolo_detector.py`: YOLO person-only detector.
- `backend/tracking/tracker.py`: ByteTrack-style persistent tracker with short occlusion recovery.
- `backend/pose/mediapipe_pose.py`: cropped-player MediaPipe Pose and global-coordinate conversion.
- `backend/trajectory/trajectory_manager.py`: `player_id -> joint_name -> [(x, y, z, t)]` storage.
- `backend/analytics/movement_metrics.py`: path length, velocity, acceleration, curvature, smoothness, symmetry, joint speed, duration.
- `backend/api/main.py`: FastAPI endpoints.
- `frontend/src`: React + TypeScript synchronized UI.

## Backend

```bash
cd motiontrace-mvp
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.api.main:app --reload
```

The default Render deployment uses `YOLO_MODEL=opencv-hog` so it can boot on Render's 512 MB free instance without installing Torch/CUDA. For a larger CPU/GPU service, install `ultralytics` and set `YOLO_MODEL` to a YOLO checkpoint such as `yolo11n.pt` or a YOLO26 person-capable checkpoint.

Render CPU-lite defaults:

```text
YOLO_MODEL=opencv-hog
TARGET_FPS=8
MAX_ANALYSIS_FRAMES=360
```

## Frontend

```bash
cd motiontrace-mvp/frontend
npm install
npm run dev
```

Set `VITE_API_BASE_URL` if the backend is not running at `http://127.0.0.1:8000`.

## API

- `GET /`
- `GET /health`
- `POST /upload`
- `POST /analyze`
- `GET /frame/{analysis_id}/{frame_number}`
- `GET /players/{analysis_id}`
- `GET /trajectory/{analysis_id}/{player_id}`
- `GET /metrics/{analysis_id}/{player_id}`

Each processed frame is stored as:

```json
{
  "frameNumber": 42,
  "timestamp": 1.75,
  "people": [
    {
      "trackId": 7,
      "bbox": { "x1": 100, "y1": 40, "x2": 220, "y2": 360 },
      "keypoints": [],
      "confidence": 0.91,
      "velocity": { "x": 12.4, "y": -1.2 },
      "acceleration": { "x": 0.8, "y": 0.3 }
    }
  ]
}
```

## Deployment

Vercel should build the frontend only:

- Build command: `npm run build`
- Output directory: `frontend/dist`

The Python backend should be deployed separately on a service suited for video inference.

### Backend URL for the frontend

Set this Vercel environment variable so the frontend can call the hosted backend:

```text
VITE_API_BASE_URL=https://motion-trace.onrender.com
```

For local development, the frontend will fall back to `http://127.0.0.1:8000` when no environment variable is set. In production, it falls back to `https://motion-trace.onrender.com`, matching the current Render service in `render.yaml`.
