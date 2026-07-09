export class ByteTrackLite {
  constructor({ maxMissingFrames = 24, iouThreshold = 0.08 } = {}) {
    this.maxMissingFrames = maxMissingFrames;
    this.iouThreshold = iouThreshold;
    this.nextTrackId = 1;
    this.tracks = [];
  }

  update(detections, frameNumber, timestamp) {
    const assignments = new Map();
    const usedDetections = new Set();

    this.tracks.forEach((track) => {
      track.predict(timestamp);
      let bestIndex = -1;
      let bestScore = 0;
      detections.forEach((detection, index) => {
        if (usedDetections.has(index)) return;
        const score = iou(track.predictedBbox, detection.bbox);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      });
      if (bestIndex >= 0 && bestScore >= this.iouThreshold) {
        assignments.set(track.trackId, detections[bestIndex]);
        usedDetections.add(bestIndex);
      }
    });

    this.tracks.forEach((track) => {
      const detection = assignments.get(track.trackId);
      if (detection) track.correct(detection, frameNumber, timestamp);
      else track.markMissing();
    });

    detections.forEach((detection, index) => {
      if (usedDetections.has(index)) return;
      this.tracks.push(new Track(this.nextTrackId, detection, frameNumber, timestamp));
      this.nextTrackId += 1;
    });

    this.tracks = this.tracks.filter((track) => track.missingFrames <= this.maxMissingFrames);
    return this.tracks.map((track) => track.toObservation(frameNumber, timestamp));
  }
}

class Track {
  constructor(trackId, detection, frameNumber, timestamp) {
    this.trackId = trackId;
    this.bbox = detection.bbox;
    this.predictedBbox = detection.bbox;
    this.confidence = detection.confidence;
    this.lastTimestamp = timestamp;
    this.lastFrame = frameNumber;
    this.missingFrames = 0;
    this.vx = 0;
    this.vy = 0;
  }

  predict(timestamp) {
    const dt = Math.max(0.001, timestamp - this.lastTimestamp);
    this.predictedBbox = {
      ...this.bbox,
      x: this.bbox.x + this.vx * dt,
      y: this.bbox.y + this.vy * dt,
    };
  }

  correct(detection, frameNumber, timestamp) {
    const dt = Math.max(0.001, timestamp - this.lastTimestamp);
    const measuredVx = (detection.bbox.x - this.bbox.x) / dt;
    const measuredVy = (detection.bbox.y - this.bbox.y) / dt;
    this.vx = this.vx * 0.6 + measuredVx * 0.4;
    this.vy = this.vy * 0.6 + measuredVy * 0.4;
    this.bbox = blendBbox(this.bbox, detection.bbox, 0.42);
    this.predictedBbox = this.bbox;
    this.confidence = detection.confidence;
    this.lastTimestamp = timestamp;
    this.lastFrame = frameNumber;
    this.missingFrames = 0;
  }

  markMissing() {
    this.bbox = this.predictedBbox;
    this.confidence = Math.max(0.12, this.confidence * 0.86);
    this.missingFrames += 1;
  }

  toObservation(frameNumber, timestamp) {
    return {
      trackId: this.trackId,
      frameNumber,
      timestamp,
      bbox: this.bbox,
      confidence: this.confidence,
      predicted: this.missingFrames > 0,
      missingFrames: this.missingFrames,
    };
  }
}

function blendBbox(a, b, alpha) {
  return {
    x: a.x * (1 - alpha) + b.x * alpha,
    y: a.y * (1 - alpha) + b.y * alpha,
    width: a.width * (1 - alpha) + b.width * alpha,
    height: a.height * (1 - alpha) + b.height * alpha,
  };
}

function iou(a, b) {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(ax2, bx2);
  const y2 = Math.min(ay2, by2);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union <= 0 ? 0 : intersection / union;
}
