import { PersonDetector } from "./person_detector.js";
import { ByteTrackLite } from "./tracker.js";
import { PoseEstimator } from "./pose_estimator.js";
import { MotionAnalyzer } from "./motion_analyzer.js";

export class VideoProcessor {
  constructor({ confidenceThreshold = 0.35 } = {}) {
    this.detector = new PersonDetector({ confidenceThreshold });
    this.tracker = new ByteTrackLite();
    this.poseEstimator = new PoseEstimator();
    this.motionAnalyzer = new MotionAnalyzer();
    this.frameWidth = 160;
    this.frameHeight = 90;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    await Promise.all([
      this.detector.init(),
      this.poseEstimator.init(),
    ]);
    this.initialized = true;
  }

  setConfidenceThreshold(value) {
    this.detector.setConfidenceThreshold(value);
  }

  reset() {
    this.tracker = new ByteTrackLite();
    this.motionAnalyzer.reset();
  }

  async analyze(video, { sampleRate = 12, onProgress } = {}) {
    await this.init();
    this.reset();

    const duration = video.duration || 0;
    const originalTime = video.currentTime || 0;
    const canvas = document.createElement("canvas");
    canvas.width = this.frameWidth;
    canvas.height = this.frameHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const frameCount = Math.max(1, Math.ceil(duration * sampleRate));
    let previousLuma = null;
    const timings = [];

    for (let frameNumber = 0; frameNumber <= frameCount; frameNumber += 1) {
      const started = performance.now();
      const timestamp = Math.min(duration, frameNumber / sampleRate);
      await seekVideo(video, timestamp);
      ctx.drawImage(video, 0, 0, this.frameWidth, this.frameHeight);
      const imageData = ctx.getImageData(0, 0, this.frameWidth, this.frameHeight);
      const detected = this.detector.detect(imageData, previousLuma);
      previousLuma = detected.luma;
      const trackObservations = this.tracker.update(detected.detections, frameNumber, timestamp);
      const people = trackObservations.map((track) => {
        const pose = this.poseEstimator.estimate(track, this.frameWidth, this.frameHeight);
        return {
          ...track,
          keypoints: pose.keypoints,
          poseConfidence: pose.confidence,
          confidence: Math.min(track.confidence, pose.confidence),
        };
      });
      this.motionAnalyzer.addFrame(frameNumber, timestamp, people);
      timings.push(performance.now() - started);
      if (onProgress && frameNumber % 3 === 0) {
        onProgress({
          progress: frameNumber / frameCount,
          frameNumber,
          trackedPeople: people.length,
        });
      }
    }

    await seekVideo(video, originalTime);
    const averageInferenceMs = timings.reduce((sum, item) => sum + item, 0) / Math.max(1, timings.length);
    return {
      frames: this.motionAnalyzer.frames,
      fps: sampleRate,
      averageInferenceMs,
      trackedPeople: this.getTracks(),
    };
  }

  getTracks() {
    const tracks = new Map();
    this.motionAnalyzer.frames.forEach((frame) => {
      frame.people.forEach((person) => {
        if (!tracks.has(person.trackId)) {
          tracks.set(person.trackId, {
            trackId: person.trackId,
            firstFrame: frame.frameNumber,
            firstTimestamp: frame.timestamp,
            maxArea: 0,
          });
        }
        const item = tracks.get(person.trackId);
        item.maxArea = Math.max(item.maxArea, person.bbox.width * person.bbox.height);
        item.lastFrame = frame.frameNumber;
        item.lastTimestamp = frame.timestamp;
      });
    });
    return [...tracks.values()].sort((a, b) => a.firstTimestamp - b.firstTimestamp);
  }

  getFrameForTime(timestamp) {
    if (!this.motionAnalyzer.frames.length) return null;
    const frame = this.motionAnalyzer.frames.reduce((best, item) => (
      Math.abs(item.timestamp - timestamp) < Math.abs(best.timestamp - timestamp) ? item : best
    ), this.motionAnalyzer.frames[0]);
    return frame;
  }

  getHistory(trackId) {
    return this.motionAnalyzer.getTrackHistory(trackId);
  }
}

function seekVideo(video, timestamp) {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done, { once: true });
    video.currentTime = Math.min(Math.max(timestamp, 0), video.duration || 0);
  });
}
