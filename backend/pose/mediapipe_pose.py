from __future__ import annotations

import cv2
import mediapipe as mp
import numpy as np

from backend.models.schemas import BoundingBox, Landmark


LANDMARK_NAMES = [
    "nose",
    "left_eye_inner",
    "left_eye",
    "left_eye_outer",
    "right_eye_inner",
    "right_eye",
    "right_eye_outer",
    "left_ear",
    "right_ear",
    "mouth_left",
    "mouth_right",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_pinky",
    "right_pinky",
    "left_index",
    "right_index",
    "left_thumb",
    "right_thumb",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
    "left_heel",
    "right_heel",
    "left_foot_index",
    "right_foot_index",
]


class MediaPipePoseEstimator:
    """Runs MediaPipe Pose on cropped player images only."""

    def __init__(self) -> None:
        self.pose = mp.solutions.pose.Pose(
            static_image_mode=False,
            model_complexity=0,
            smooth_landmarks=True,
            enable_segmentation=False,
            min_detection_confidence=0.35,
            min_tracking_confidence=0.35,
        )

    def estimate(self, frame_bgr: np.ndarray, bbox: BoundingBox) -> tuple[list[Landmark], float]:
        height, width = frame_bgr.shape[:2]
        x1 = max(0, int(bbox.x1))
        y1 = max(0, int(bbox.y1))
        x2 = min(width, int(bbox.x2))
        y2 = min(height, int(bbox.y2))
        if x2 <= x1 or y2 <= y1:
            return [], 0.0

        crop = frame_bgr[y1:y2, x1:x2]
        crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        result = self.pose.process(crop_rgb)
        if not result.pose_landmarks:
            return [], 0.0

        crop_h, crop_w = crop.shape[:2]
        landmarks: list[Landmark] = []
        visibility_total = 0.0
        for index, landmark in enumerate(result.pose_landmarks.landmark):
            global_x = x1 + landmark.x * crop_w
            global_y = y1 + landmark.y * crop_h
            # MediaPipe z is relative to crop width; convert into frame-scale units.
            global_z = landmark.z * crop_w
            visibility = float(landmark.visibility)
            visibility_total += visibility
            landmarks.append(
                Landmark(
                    name=LANDMARK_NAMES[index],
                    x=float(global_x),
                    y=float(global_y),
                    z=float(global_z),
                    visibility=visibility,
                )
            )
        return landmarks, visibility_total / max(1, len(landmarks))
