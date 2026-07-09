# MotionTrace MVP

MotionTrace is a browser-based movement analysis MVP. It lets users upload a video, run lightweight frame analysis, label detected people by order of appearance, choose which person to follow, scrub synchronized playback, inspect pose and trajectory views, select tracked joints, and export trajectory data as CSV.

## What Works

- Video upload and synchronized playback
- Lightweight multi-person detection from sampled video frames
- Smoother identity tracking with short-gap prediction
- Person labels shown on the original video
- Person picker for choosing the tracked subject
- Pose skeleton view derived from the selected person's tracked video position
- Timestamp-synced trajectory view with persistent, fading, and hybrid trail modes
- Joint selection
- Football-oriented live metrics including speed, acceleration, stride estimate, confidence, and tracking state
- CSV export for the selected person and selected joints

## Notes

This MVP uses local browser-side video analysis and a pose approximation. It now tracks identities more consistently and smooths/predicts short gaps, but it does not call a cloud AI model or perform clinical-grade pose estimation. A production version should replace the approximation layer with MediaPipe, MoveNet, YOLO + ByteTrack/BoT-SORT, or another research-grade tracking stack.

## Local Preview

Open `index.html` in a browser, or serve the folder with any static file server.
