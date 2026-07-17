from __future__ import annotations

import math
import numpy as np

from backend.models.schemas import FrameData, MovementMetrics


class MovementMetricsAnalyzer:
    def compute_for_player(self, player_id: int, frames: list[FrameData]) -> MovementMetrics:
        samples = [
            (frame.timestamp, person)
            for frame in frames
            for person in frame.people
            if person.track_id == player_id
        ]
        if len(samples) < 2:
            return MovementMetrics(
                playerId=player_id,
                pathLength=0.0,
                movementDuration=0.0,
                averageSpeed=0.0,
                maxSpeed=0.0,
                averageAcceleration=0.0,
                curvature=0.0,
                smoothness=0.0,
                symmetry=0.0,
                jointSpeed={},
            )

        centers = np.array([person.bbox.center for _, person in samples], dtype=float)
        times = np.array([timestamp for timestamp, _ in samples], dtype=float)
        segment_lengths = np.linalg.norm(np.diff(centers, axis=0), axis=1)
        duration = max(0.001, float(times[-1] - times[0]))
        path_length = float(segment_lengths.sum())
        speeds = segment_lengths / np.maximum(0.001, np.diff(times))
        accelerations = np.abs(np.diff(speeds)) / np.maximum(0.001, np.diff(times)[1:]) if len(speeds) > 1 else np.array([0.0])

        return MovementMetrics(
            playerId=player_id,
            pathLength=path_length,
            movementDuration=duration,
            averageSpeed=float(np.mean(speeds)),
            maxSpeed=float(np.max(speeds)),
            averageAcceleration=float(np.mean(accelerations)),
            curvature=self._curvature(centers),
            smoothness=self._smoothness(centers),
            symmetry=self._symmetry(samples),
            jointSpeed=self._joint_speeds(samples),
        )

    def _curvature(self, centers: np.ndarray) -> float:
        if len(centers) < 3:
            return 0.0
        direction_changes = []
        for index in range(1, len(centers) - 1):
            a = centers[index] - centers[index - 1]
            b = centers[index + 1] - centers[index]
            denom = np.linalg.norm(a) * np.linalg.norm(b)
            if denom > 0:
                cos_angle = float(np.clip(np.dot(a, b) / denom, -1.0, 1.0))
                direction_changes.append(math.acos(cos_angle))
        return float(np.mean(direction_changes)) if direction_changes else 0.0

    def _smoothness(self, centers: np.ndarray) -> float:
        if len(centers) < 3:
            return 1.0
        second_difference = np.diff(centers, n=2, axis=0)
        jitter = float(np.linalg.norm(second_difference, axis=1).mean())
        return 1.0 / (1.0 + jitter)

    def _symmetry(self, samples: list[tuple[float, object]]) -> float:
        left = self._joint_path(samples, "left_ankle")
        right = self._joint_path(samples, "right_ankle")
        if left == 0 and right == 0:
            return 0.0
        return 1.0 - abs(left - right) / max(left, right)

    def _joint_path(self, samples: list[tuple[float, object]], joint_name: str) -> float:
        points = []
        for _, person in samples:
            joint = next((item for item in person.keypoints if item.name == joint_name), None)
            if joint:
                points.append((joint.x, joint.y))
        if len(points) < 2:
            return 0.0
        return float(np.linalg.norm(np.diff(np.array(points), axis=0), axis=1).sum())

    def _joint_speeds(self, samples: list[tuple[float, object]]) -> dict[str, float]:
        joint_names = sorted({joint.name for _, person in samples for joint in person.keypoints})
        speeds: dict[str, float] = {}
        for joint_name in joint_names:
            values = []
            last = None
            for timestamp, person in samples:
                joint = next((item for item in person.keypoints if item.name == joint_name), None)
                if not joint:
                    continue
                current = (timestamp, joint.x, joint.y)
                if last:
                    dt = max(0.001, current[0] - last[0])
                    values.append(math.hypot(current[1] - last[1], current[2] - last[2]) / dt)
                last = current
            if values:
                speeds[joint_name] = float(np.mean(values))
        return speeds
