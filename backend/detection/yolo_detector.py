from __future__ import annotations

import numpy as np
from ultralytics import YOLO

from backend.models.schemas import BoundingBox, Detection


class YoloPersonDetector:
    """YOLO detector restricted to the person class.

    The model name is configurable. Use a YOLO26 person-capable checkpoint when
    it is available in your Ultralytics environment; the code only depends on
    the stable Ultralytics inference interface.
    """

    PERSON_CLASS_ID = 0

    def __init__(self, model_path: str, confidence_threshold: float = 0.35) -> None:
        self.model_path = model_path
        self.confidence_threshold = confidence_threshold
        self.model = YOLO(model_path)

    def detect(self, frame_bgr: np.ndarray) -> list[Detection]:
        results = self.model.predict(
            source=frame_bgr,
            classes=[self.PERSON_CLASS_ID],
            conf=self.confidence_threshold,
            verbose=False,
        )
        detections: list[Detection] = []
        if not results:
            return detections

        boxes = results[0].boxes
        if boxes is None:
            return detections

        for box in boxes:
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
