import { KeypointSmoother } from "./oneEuroFilter.js";

export const JOINTS = [
  "nose",
  "leftShoulder",
  "rightShoulder",
  "leftElbow",
  "rightElbow",
  "leftWrist",
  "rightWrist",
  "leftHip",
  "rightHip",
  "leftKnee",
  "rightKnee",
  "leftAnkle",
  "rightAnkle",
];

export class PoseEstimator {
  constructor() {
    this.smoother = new KeypointSmoother();
    this.initialized = false;
  }

  async init() {
    // Adapter boundary: replace this with RTMPose/MoveNet/MediaPipe on cropped person images.
    this.initialized = true;
  }

  estimate(track, frameWidth, frameHeight) {
    const raw = estimatePoseFromTrackedCrop(track, frameWidth, frameHeight);
    const keypoints = this.smoother.smooth(track.trackId, raw.keypoints, track.timestamp);
    return {
      keypoints,
      confidence: raw.confidence * track.confidence,
    };
  }
}

function estimatePoseFromTrackedCrop(track, frameWidth, frameHeight) {
  const box = track.bbox;
  const x = box.x * frameWidth;
  const y = box.y * frameHeight;
  const w = Math.max(box.width * frameWidth, frameWidth * 0.035);
  const h = Math.max(box.height * frameHeight, frameHeight * 0.09);
  const cx = x + w / 2;
  const top = y;
  const lean = Math.max(-0.16, Math.min(0.16, (box.x + box.width / 2 - 0.5) * 0.45));
  const leanPx = lean * w;
  const phase = track.timestamp * Math.PI * 5 + track.trackId * 0.5 + box.y * 4;
  const stride = Math.sin(phase) * Math.min(1.35, Math.max(0.25, box.width / Math.max(0.01, box.height) * 3));
  const bob = Math.sin(phase * 2) * h * 0.015;
  const shoulderY = top + h * 0.27 + bob;
  const hipY = top + h * 0.53 + bob;
  const shoulder = w * 0.22;
  const hip = w * 0.15;

  const points = {
    nose: [cx + leanPx * 0.75, top + h * 0.12 + bob],
    leftShoulder: [cx - shoulder + leanPx, shoulderY],
    rightShoulder: [cx + shoulder + leanPx, shoulderY],
    leftElbow: [cx - shoulder - w * 0.12 + leanPx * 0.55, shoulderY + h * 0.13 + stride * h * 0.045],
    rightElbow: [cx + shoulder + w * 0.12 + leanPx * 0.55, shoulderY + h * 0.13 - stride * h * 0.045],
    leftWrist: [cx - shoulder - w * 0.18 + leanPx * 0.35, shoulderY + h * 0.27 + stride * h * 0.08],
    rightWrist: [cx + shoulder + w * 0.18 + leanPx * 0.35, shoulderY + h * 0.27 - stride * h * 0.08],
    leftHip: [cx - hip, hipY],
    rightHip: [cx + hip, hipY],
    leftKnee: [cx - hip - stride * w * 0.1, hipY + h * 0.22],
    rightKnee: [cx + hip + stride * w * 0.1, hipY + h * 0.22],
    leftAnkle: [cx - hip - Math.cos(phase) * w * 0.2, hipY + h * 0.43],
    rightAnkle: [cx + hip + Math.cos(phase) * w * 0.2, hipY + h * 0.43],
  };

  return {
    confidence: track.predicted ? 0.55 : 0.82,
    keypoints: JOINTS.map((name) => ({
      name,
      x: points[name][0] / frameWidth,
      y: points[name][1] / frameHeight,
      confidence: track.predicted ? 0.55 : 0.82,
    })),
  };
}
