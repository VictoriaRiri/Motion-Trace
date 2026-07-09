export class MotionAnalyzer {
  constructor() {
    this.frames = [];
    this.lastByTrack = new Map();
  }

  reset() {
    this.frames = [];
    this.lastByTrack.clear();
  }

  addFrame(frameNumber, timestamp, trackedPeople) {
    const people = trackedPeople.map((person) => {
      const previous = this.lastByTrack.get(person.trackId);
      const center = bboxCenter(person.bbox);
      const velocity = previous ? vectorScale(vectorSubtract(center, previous.center), 1 / Math.max(0.001, timestamp - previous.timestamp)) : { x: 0, y: 0 };
      const acceleration = previous ? vectorScale(vectorSubtract(velocity, previous.velocity), 1 / Math.max(0.001, timestamp - previous.timestamp)) : { x: 0, y: 0 };
      this.lastByTrack.set(person.trackId, { timestamp, center, velocity });
      return {
        trackId: person.trackId,
        frameNumber,
        timestamp,
        bbox: person.bbox,
        keypoints: person.keypoints,
        confidence: person.confidence,
        poseConfidence: person.poseConfidence,
        velocity,
        acceleration,
        predicted: person.predicted,
        missingFrames: person.missingFrames,
      };
    });

    const frameData = { frameNumber, timestamp, people };
    this.frames.push(frameData);
    return frameData;
  }

  getFrameByNumber(frameNumber) {
    return this.frames[Math.max(0, Math.min(this.frames.length - 1, frameNumber))] || null;
  }

  getTrackHistory(trackId) {
    return this.frames.flatMap((frame) => frame.people.filter((person) => person.trackId === trackId));
  }
}

export function bboxCenter(bbox) {
  return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
}

function vectorSubtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function vectorScale(vector, scale) {
  return { x: vector.x * scale, y: vector.y * scale };
}
