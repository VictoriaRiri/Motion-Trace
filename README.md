# MotionTrace MVP

MotionTrace is a browser-based movement analysis MVP. It lets users upload a video, run lightweight frame analysis, label detected people by order of appearance, choose which person to follow, scrub synchronized playback, inspect pose and trajectory views, select tracked joints, and export trajectory data as CSV.

## What Works

- Video upload and synchronized playback
- Modular video-processing pipeline
- Lightweight browser fallback for person detection from sampled video frames
- ByteTrack-inspired persistent identity tracking with short-gap prediction
- Person labels shown on the original video
- Person picker for choosing the tracked subject
- Cropped-person pose-estimation adapter with One Euro Filter smoothing
- Timestamp-synced trajectory view with persistent, fading, and hybrid trail modes
- Joint selection
- Football-oriented live metrics including speed, acceleration, stride estimate, confidence, and tracking state
- CSV export for the selected person and selected joints

## Architecture

The app is split into focused modules:

- `src/person_detector.js`: person-only detector boundary. Replace the browser fallback with YOLO11/ONNX or a backend API.
- `src/tracker.js`: ByteTrack-style persistent track IDs with prediction through short occlusions.
- `src/pose_estimator.js`: cropped-person pose estimator boundary. Replace the fallback with RTMPose, MoveNet, or MediaPipe.
- `src/oneEuroFilter.js`: per-joint temporal smoothing.
- `src/motion_analyzer.js`: stores `FrameData` history and computes velocity/acceleration foundations.
- `src/renderer.js`: shared drawing utilities.
- `src/video_processor.js`: orchestrates frame extraction, detection, tracking, pose estimation, smoothing, motion analysis, and history storage.

Each analyzed frame is stored as:

```js
{
  frameNumber,
  timestamp,
  people: [
    {
      trackId,
      bbox,
      keypoints,
      confidence,
      velocity,
      acceleration
    }
  ]
}
```

## Notes

This MVP now has a production-style architecture, persistent track history, and smoothing, but it still uses a local browser fallback instead of shipping YOLO/RTMPose model weights. A production deployment should replace `PersonDetector` with YOLO11 person detection and `PoseEstimator` with RTMPose or another model that runs on cropped person images.

## Local Preview

Open `index.html` in a browser, or serve the folder with any static file server.
