from __future__ import annotations

import cv2
import numpy as np

from backend.models.schemas import BoundingBox, Detection


class YoloPersonDetector:
    """Person detector with an optional YOLO backend and a CPU fallback.

    Render free instances cannot install/run Torch + CUDA-sized Ultralytics
    stacks inside 512 MB. When `ultralytics` is installed and `model_path` is a
    YOLO checkpoint, this class uses YOLO for person-only detection. Otherwise
    it falls back to OpenCV HOG so the API can deploy and remain functional on
    constrained CPU hosts.
    """

    PERSON_CLASS_ID = 0

    def __init__(self, model_path: str, confidence_threshold: float = 0.35) -> None:
        self.model_path = model_path
        self.confidence_threshold = confidence_threshold
        self.model = None
        self.hog = None
        try:
            self.hog = cv2.HOGDescriptor()
            self.hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
        except Exception:
            self.hog = None

        if model_path != "opencv-hog":
            try:
                from ultralytics import YOLO

                self.model = YOLO(model_path)
            except Exception:
                self.model = None

    def detect(self, frame_bgr: np.ndarray) -> list[Detection]:
        if self.model is not None:
            return self._detect_with_yolo(frame_bgr)
        return self._detect_with_hog(frame_bgr)

    def _detect_with_yolo(self, frame_bgr: np.ndarray) -> list[Detection]:
        results = self.model.predict(
            source=frame_bgr,
            classes=[self.PERSON_CLASS_ID],
            conf=self.confidence_threshold,
            verbose=False,
        )
        detections: list[Detection] = []
        if not results or results[0].boxes is None:
            return detections

        for box in results[0].boxes:
            class_id = int(box.cls.item())
            if class_id != self.PERSON_CLASS_ID:
                continue
            confidence = float(box.conf.item())
            x1, y1, x2, y2 = [float(value) for value in box.xyxy[0].tolist()]
            detections.append(
                Detection(
                    bbox=BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2),
                    confidence=confidence,
                    class_id=class_id,
                    class_name="person",
                )
            )
        return detections

    def _detect_with_hog(self, frame_bgr: np.ndarray) -> list[Detection]:
        if self.hog is None:
            return []
        height, width = frame_bgr.shape[:2]
        scale = min(1.0, 640 / max(width, height))
        resized = cv2.resize(frame_bgr, (int(width * scale), int(height * scale))) if scale < 1 else frame_bgr
        boxes, weights = self.hog.detectMultiScale(
            resized,
            winStride=(8, 8),
            padding=(8, 8),
            scale=1.05,
        )
        detections: list[Detection] = []
        inv_scale = 1 / scale
        for (x, y, w, h), weight in zip(boxes, weights):
            confidence = float(max(0.0, min(0.99, weight)))
            if confidence < self.confidence_threshold:
                continue
            detections.append(
                Detection(
                    bbox=BoundingBox(
                        x1=float(x * inv_scale),
                        y1=float(y * inv_scale),
                        x2=float((x + w) * inv_scale),
                        y2=float((y + h) * inv_scale),
                    ),
                    confidence=confidence,
                    class_id=self.PERSON_CLASS_ID,
                    class_name="person",
                )
            )
        return detections
