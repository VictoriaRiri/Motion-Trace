from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import cv2

from backend.analytics.movement_metrics import MovementMetricsAnalyzer
from backend.config import settings
from backend.detection.yolo_detector import YoloPersonDetector
from backend.models.schemas import AnalysisMetadata, FrameData, PlayerFrame, PlayerSummary, Vector2
from backend.pose.mediapipe_pose import MediaPipePoseEstimator
from backend.tracking.tracker import ByteTrackTracker
from backend.trajectory.trajectory_manager import TrajectoryManager
from backend.utils.video_io import video_metadata


class MotionTraceAnalyzer:
    def __init__(self) -> None:
        self.detector = YoloPersonDetector(settings.yolo_model, settings.detector_confidence)
        self.pose_estimator = MediaPipePoseEstimator()
        self.metrics = MovementMetricsAnalyzer()

    def analyze(self, video_id: str, video_path: Path) -> tuple[str, AnalysisMetadata, list[FrameData], dict]:
        source_fps, source_frame_count, duration = video_metadata(video_path)
        stride = max(1, round(source_fps / settings.target_fps))
        tracker = ByteTrackTracker(settings.tracker_iou_threshold, settings.tracker_max_lost_frames)
        trajectories = TrajectoryManager()
        frames: list[FrameData] = []
        previous_by_track: dict[int, tuple[float, tuple[float, float], Vector2]] = {}

        capture = cv2.VideoCapture(str(video_path))
        frame_index = 0
        processed_index = 0
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            if frame_index % stride != 0:
                frame_index += 1
                continue

            timestamp = frame_index / source_fps if source_fps > 0 else processed_index / settings.target_fps
            detections = self.detector.detect(frame)
            tracked = tracker.update(detections)
            people: list[PlayerFrame] = []

            for tracked_player in tracked:
                landmarks, pose_confidence = self.pose_estimator.estimate(frame, tracked_player.bbox)
                if landmarks:
                    trajectories.add_landmarks(tracked_player.track_id, landmarks, timestamp)
                center = tracked_player.bbox.center
                velocity, acceleration = self._kinematics(tracked_player.track_id, timestamp, center, previous_by_track)
                people.append(
                    PlayerFrame(
                        trackId=tracked_player.track_id,
                        bbox=tracked_player.bbox,
                        keypoints=landmarks,
                        confidence=tracked_player.confidence,
                        poseConfidence=pose_confidence,
                        velocity=velocity,
                        acceleration=acceleration,
                    )
                )

            frames.append(FrameData(frameNumber=processed_index, timestamp=timestamp, people=people))
            processed_index += 1
            frame_index += 1

        capture.release()
        analysis_id = uuid4().hex
        players = self._summaries(frames)
        metadata = AnalysisMetadata(
            analysisId=analysis_id,
            videoId=video_id,
            fps=source_fps / stride if stride else source_fps,
            frameCount=len(frames),
            duration=duration,
            players=players,
        )
        return analysis_id, metadata, frames, trajectories.all()

    def _kinematics(
        self,
        track_id: int,
        timestamp: float,
        center: tuple[float, float],
        previous_by_track: dict[int, tuple[float, tuple[float, float], Vector2]],
    ) -> tuple[Vector2, Vector2]:
        previous = previous_by_track.get(track_id)
        if not previous:
            velocity = Vector2()
            acceleration = Vector2()
            previous_by_track[track_id] = (timestamp, center, velocity)
            return velocity, acceleration
        previous_timestamp, previous_center, previous_velocity = previous
        dt = max(0.001, timestamp - previous_timestamp)
        velocity = Vector2(
            x=(center[0] - previous_center[0]) / dt,
            y=(center[1] - previous_center[1]) / dt,
        )
        acceleration = Vector2(
            x=(velocity.x - previous_velocity.x) / dt,
            y=(velocity.y - previous_velocity.y) / dt,
        )
        previous_by_track[track_id] = (timestamp, center, velocity)
        return velocity, acceleration

    def _summaries(self, frames: list[FrameData]) -> list[PlayerSummary]:
        by_player: dict[int, dict[str, float]] = {}
        for frame in frames:
            for person in frame.people:
                item = by_player.setdefault(
                    person.track_id,
                    {
                        "first_frame": frame.frame_number,
                        "last_frame": frame.frame_number,
                        "first_time": frame.timestamp,
                        "last_time": frame.timestamp,
                        "max_area": 0.0,
                    },
                )
                item["last_frame"] = frame.frame_number
                item["last_time"] = frame.timestamp
                item["max_area"] = max(item["max_area"], person.bbox.area)
        return [
            PlayerSummary(
                trackId=track_id,
                firstFrame=int(values["first_frame"]),
                lastFrame=int(values["last_frame"]),
                duration=float(values["last_time"] - values["first_time"]),
                maxBboxArea=float(values["max_area"]),
            )
            for track_id, values in sorted(by_player.items())
        ]
