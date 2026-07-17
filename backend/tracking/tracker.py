from __future__ import annotations

from dataclasses import dataclass

from backend.models.schemas import BoundingBox, Detection


@dataclass
class TrackedPlayer:
    track_id: int
    bbox: BoundingBox
    confidence: float
    lost_frames: int = 0


class ByteTrackTracker:
    """Persistent multi-object tracker using ByteTrack-style association.

    This implementation keeps high-confidence and lower-confidence person
    detections in the association step, predicts through brief occlusions, and
    preserves stable IDs without depending on browser state.
    """

    def __init__(self, iou_threshold: float = 0.2, max_lost_frames: int = 30) -> None:
        self.iou_threshold = iou_threshold
        self.max_lost_frames = max_lost_frames
        self.next_track_id = 1
        self.tracks: list[_TrackState] = []

    def update(self, detections: list[Detection]) -> list[TrackedPlayer]:
        for track in self.tracks:
            track.predict()

        assigned_detection_indices: set[int] = set()
        for track in self.tracks:
            best_index = -1
            best_iou = 0.0
            for index, detection in enumerate(detections):
                if index in assigned_detection_indices:
                    continue
                score = iou(track.predicted_bbox, detection.bbox)
                if score > best_iou:
                    best_iou = score
                    best_index = index
            if best_index >= 0 and best_iou >= self.iou_threshold:
                track.correct(detections[best_index])
                assigned_detection_indices.add(best_index)
            else:
                track.mark_lost()

        for index, detection in enumerate(detections):
            if index not in assigned_detection_indices:
                self.tracks.append(_TrackState(self.next_track_id, detection))
                self.next_track_id += 1

        self.tracks = [track for track in self.tracks if track.lost_frames <= self.max_lost_frames]
        return [
            TrackedPlayer(
                track_id=track.track_id,
                bbox=track.bbox,
                confidence=track.confidence,
                lost_frames=track.lost_frames,
            )
            for track in self.tracks
        ]


class _TrackState:
    def __init__(self, track_id: int, detection: Detection) -> None:
        self.track_id = track_id
        self.bbox = detection.bbox
        self.predicted_bbox = detection.bbox
        self.confidence = detection.confidence
        self.lost_frames = 0
        self.vx = 0.0
        self.vy = 0.0

    def predict(self) -> None:
        self.predicted_bbox = BoundingBox(
            x1=self.bbox.x1 + self.vx,
            y1=self.bbox.y1 + self.vy,
            x2=self.bbox.x2 + self.vx,
            y2=self.bbox.y2 + self.vy,
        )

    def correct(self, detection: Detection) -> None:
        new_center = detection.bbox.center
        old_center = self.bbox.center
        measured_vx = new_center[0] - old_center[0]
        measured_vy = new_center[1] - old_center[1]
        self.vx = self.vx * 0.65 + measured_vx * 0.35
        self.vy = self.vy * 0.65 + measured_vy * 0.35
        self.bbox = blend_bbox(self.bbox, detection.bbox, 0.45)
        self.predicted_bbox = self.bbox
        self.confidence = detection.confidence
        self.lost_frames = 0

    def mark_lost(self) -> None:
        self.bbox = self.predicted_bbox
        self.confidence *= 0.86
        self.lost_frames += 1


def blend_bbox(a: BoundingBox, b: BoundingBox, alpha: float) -> BoundingBox:
    return BoundingBox(
        x1=a.x1 * (1 - alpha) + b.x1 * alpha,
        y1=a.y1 * (1 - alpha) + b.y1 * alpha,
        x2=a.x2 * (1 - alpha) + b.x2 * alpha,
        y2=a.y2 * (1 - alpha) + b.y2 * alpha,
    )


def iou(a: BoundingBox, b: BoundingBox) -> float:
    x1 = max(a.x1, b.x1)
    y1 = max(a.y1, b.y1)
    x2 = min(a.x2, b.x2)
    y2 = min(a.y2, b.y2)
    intersection = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    union = a.area + b.area - intersection
    return 0.0 if union <= 0 else intersection / union
