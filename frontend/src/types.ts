export type BoundingBox = { x1: number; y1: number; x2: number; y2: number };
export type Landmark = { name: string; x: number; y: number; z: number; visibility: number };
export type Vector2 = { x: number; y: number };
export type PlayerFrame = {
  trackId: number;
  bbox: BoundingBox;
  keypoints: Landmark[];
  confidence: number;
  poseConfidence: number;
  velocity: Vector2;
  acceleration: Vector2;
};
export type FrameData = { frameNumber: number; timestamp: number; people: PlayerFrame[] };
export type PlayerSummary = {
  trackId: number;
  firstFrame: number;
  lastFrame: number;
  duration: number;
  maxBboxArea: number;
};
export type AnalysisMetadata = {
  analysisId: string;
  videoId: string;
  fps: number;
  frameCount: number;
  duration: number;
  players: PlayerSummary[];
};
export type MovementMetrics = {
  playerId: number;
  pathLength: number;
  movementDuration: number;
  averageSpeed: number;
  maxSpeed: number;
  averageAcceleration: number;
  curvature: number;
  smoothness: number;
  symmetry: number;
  jointSpeed: Record<string, number>;
};
