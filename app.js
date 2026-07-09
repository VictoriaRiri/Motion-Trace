import { VideoProcessor } from "./src/video_processor.js";
import { JOINTS } from "./src/pose_estimator.js";
import {
  JOINT_COLORS,
  PERSON_COLORS,
  SKELETON_EDGES,
  drawGrid,
  pointToCanvas,
  resizeCanvas,
} from "./src/renderer.js";

const videoInput = document.querySelector("#videoInput");
const sourceVideo = document.querySelector("#sourceVideo");
const videoOverlay = document.querySelector("#videoOverlay");
const dropHint = document.querySelector("#dropHint");
const analyzeBtn = document.querySelector("#analyzeBtn");
const exportBtn = document.querySelector("#exportBtn");
const playBtn = document.querySelector("#playBtn");
const timeline = document.querySelector("#timeline");
const statusText = document.querySelector("#statusText");
const timeText = document.querySelector("#timeText");
const durationText = document.querySelector("#durationText");
const frameText = document.querySelector("#frameText");
const selectedText = document.querySelector("#selectedText");
const videoMeta = document.querySelector("#videoMeta");
const poseMeta = document.querySelector("#poseMeta");
const trajectoryMeta = document.querySelector("#trajectoryMeta");
const personControls = document.querySelector("#personControls");
const jointControls = document.querySelector("#jointControls");
const trailMode = document.querySelector("#trailMode");
const confidenceThreshold = document.querySelector("#confidenceThreshold");
const confidenceThresholdText = document.querySelector("#confidenceThresholdText");
const debugToggle = document.querySelector("#debugToggle");
const syncDebug = document.querySelector("#syncDebug");
const drawerToggle = document.querySelector("#drawerToggle");
const analysisDrawer = document.querySelector("#analysisDrawer");
const speedMetric = document.querySelector("#speedMetric");
const accelMetric = document.querySelector("#accelMetric");
const strideMetric = document.querySelector("#strideMetric");
const centerMetric = document.querySelector("#centerMetric");
const confidenceMetric = document.querySelector("#confidenceMetric");
const trackingMetric = document.querySelector("#trackingMetric");
const lostJointsMetric = document.querySelector("#lostJointsMetric");
const playbackMetric = document.querySelector("#playbackMetric");
const poseCanvas = document.querySelector("#poseCanvas");
const trajectoryCanvas = document.querySelector("#trajectoryCanvas");

const poseCtx = poseCanvas.getContext("2d");
const trajectoryCtx = trajectoryCanvas.getContext("2d");
const overlayCtx = videoOverlay.getContext("2d");
const selectedJoints = new Set(["leftWrist", "rightWrist", "leftAnkle", "rightAnkle"]);
const processor = new VideoProcessor({ confidenceThreshold: Number(confidenceThreshold.value) });

let analysis = null;
let selectedTrackId = null;
let animationId = null;
let lastObjectUrl = null;

function setStatus(text) {
  statusText.textContent = text;
}

function friendlyJointName(name) {
  return name.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function createJointControls() {
  jointControls.innerHTML = "";
  JOINTS.forEach((joint) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = selectedJoints.has(joint);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedJoints.add(joint);
      else selectedJoints.delete(joint);
      selectedText.textContent = `${selectedJoints.size} joints`;
      trajectoryMeta.textContent = `${selectedJoints.size} tracked`;
      drawCurrentViews();
    });
    label.append(checkbox, friendlyJointName(joint));
    jointControls.append(label);
  });
}

function createPersonControls() {
  personControls.innerHTML = "";
  const tracks = analysis?.trackedPeople || [];
  if (!tracks.length) {
    personControls.textContent = "Analyze a video to detect people.";
    return;
  }

  tracks.forEach((track) => {
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "person";
    radio.value = String(track.trackId);
    radio.checked = track.trackId === selectedTrackId;
    radio.addEventListener("change", () => {
      selectedTrackId = track.trackId;
      setStatus(`Following track ${selectedTrackId}.`);
      drawCurrentViews();
    });
    label.append(radio, `Person ${track.trackId}`);
    personControls.append(label);
  });
}

function pickDefaultTrack() {
  const tracks = analysis?.trackedPeople || [];
  if (!tracks.length) return null;
  if (tracks.length === 1) return tracks[0].trackId;
  return [...tracks].sort((a, b) => b.maxArea - a.maxArea)[0].trackId;
}

async function analyzeVideo() {
  if (!sourceVideo.src || !sourceVideo.duration) return;
  const wasPlaying = !sourceVideo.paused;
  sourceVideo.pause();
  setStatus("Extracting frames, detecting people, tracking IDs, and estimating pose...");
  analyzeBtn.disabled = true;
  exportBtn.disabled = true;
  processor.setConfidenceThreshold(Number(confidenceThreshold.value));

  try {
    analysis = await processor.analyze(sourceVideo, {
      sampleRate: 12,
      onProgress: ({ progress, trackedPeople }) => {
        setStatus(`Processing video... ${Math.round(progress * 100)}% | ${trackedPeople} active tracks`);
      },
    });
    selectedTrackId = pickDefaultTrack();
    frameText.textContent = String(analysis.frames.length);
    poseMeta.textContent = `${analysis.trackedPeople.length} tracks`;
    trajectoryMeta.textContent = `${selectedJoints.size} tracked`;
    exportBtn.disabled = !analysis.frames.length;
    playBtn.disabled = !analysis.frames.length;
    timeline.disabled = !analysis.frames.length;
    createPersonControls();
    setStatus(selectedTrackId ? `Ready. Following persistent track ${selectedTrackId}.` : "No person detected.");
    if (wasPlaying) sourceVideo.play();
    drawCurrentViews();
  } catch (error) {
    setStatus(`Analysis failed: ${error.message}`);
  } finally {
    analyzeBtn.disabled = false;
  }
}

function getCurrentFrame() {
  return analysis ? processor.getFrameForTime(sourceVideo.currentTime || 0) : null;
}

function getCurrentPerson(frame = getCurrentFrame()) {
  if (!frame || selectedTrackId === null) return null;
  return frame.people.find((person) => person.trackId === selectedTrackId) || null;
}

function drawVideoOverlay() {
  resizeCanvas(videoOverlay);
  overlayCtx.clearRect(0, 0, videoOverlay.width, videoOverlay.height);
  const frame = getCurrentFrame();
  if (!frame) return;

  frame.people.forEach((person, index) => {
    const color = PERSON_COLORS[index % PERSON_COLORS.length];
    const box = person.bbox;
    const x = box.x * videoOverlay.width;
    const y = box.y * videoOverlay.height;
    const w = box.width * videoOverlay.width;
    const h = box.height * videoOverlay.height;
    const selected = person.trackId === selectedTrackId;
    if (!debugToggle.checked && !selected) return;
    overlayCtx.strokeStyle = color;
    overlayCtx.lineWidth = selected ? 4 : 2;
    overlayCtx.strokeRect(x, y, w, h);
    overlayCtx.fillStyle = color;
    overlayCtx.fillRect(x, Math.max(0, y - 28), 132, 26);
    overlayCtx.fillStyle = "#0b0d10";
    overlayCtx.font = `${Math.max(14, videoOverlay.width * 0.018)}px system-ui`;
    overlayCtx.fillText(`ID ${person.trackId}${person.predicted ? " predicted" : ""}`, x + 8, Math.max(18, y - 9));
  });
}

function drawPose() {
  resizeCanvas(poseCanvas);
  const width = poseCanvas.width;
  const height = poseCanvas.height;
  drawGrid(poseCtx, width, height);
  const person = getCurrentPerson();
  if (!person) {
    poseCtx.fillStyle = "#aab5bf";
    poseCtx.textAlign = "center";
    poseCtx.fillText(analysis ? "Selected person is not visible at this timestamp" : "Upload and analyze a video", width / 2, height / 2);
    return;
  }

  poseCtx.lineCap = "round";
  poseCtx.lineJoin = "round";
  poseCtx.lineWidth = Math.max(3, width * 0.006);
  SKELETON_EDGES.forEach(([a, b]) => {
    const pa = pointToCanvas(person.keypoints.find((item) => item.name === a), width, height);
    const pb = pointToCanvas(person.keypoints.find((item) => item.name === b), width, height);
    poseCtx.strokeStyle = "rgba(243,246,248,0.78)";
    poseCtx.beginPath();
    poseCtx.moveTo(pa.x, pa.y);
    poseCtx.lineTo(pb.x, pb.y);
    poseCtx.stroke();
  });

  person.keypoints.forEach((keypoint) => {
    const point = pointToCanvas(keypoint, width, height);
    poseCtx.fillStyle = JOINT_COLORS[keypoint.name] || "#f3f6f8";
    poseCtx.beginPath();
    poseCtx.arc(point.x, point.y, selectedJoints.has(keypoint.name) ? 7 : 4, 0, Math.PI * 2);
    poseCtx.fill();
  });
}

function drawTrajectory() {
  resizeCanvas(trajectoryCanvas);
  const width = trajectoryCanvas.width;
  const height = trajectoryCanvas.height;
  drawGrid(trajectoryCtx, width, height);
  if (!analysis || selectedTrackId === null) {
    trajectoryCtx.fillStyle = "#aab5bf";
    trajectoryCtx.textAlign = "center";
    trajectoryCtx.fillText("Trajectory will appear after analysis", width / 2, height / 2);
    return;
  }

  const currentFrame = getCurrentFrame();
  const currentFrameNumber = currentFrame?.frameNumber || 0;
  const history = processor.getHistory(selectedTrackId).filter((item) => item.frameNumber <= currentFrameNumber);
  const mode = trailMode.value;
  const visible = mode === "fade" ? history.slice(-72) : history;

  selectedJoints.forEach((joint) => {
    for (let i = 1; i < visible.length; i += 1) {
      const prev = visible[i - 1].keypoints.find((item) => item.name === joint);
      const next = visible[i].keypoints.find((item) => item.name === joint);
      if (!prev || !next) continue;
      const age = visible.length - i;
      const recent = Math.max(0, 1 - age / 72);
      const alpha = mode === "persistent" ? 0.42 : mode === "fade" ? recent * 0.86 : 0.12 + recent * 0.74;
      const a = pointToCanvas(prev, width, height);
      const b = pointToCanvas(next, width, height);
      trajectoryCtx.globalAlpha = Math.max(0.04, alpha);
      trajectoryCtx.strokeStyle = JOINT_COLORS[joint] || "#f3f6f8";
      trajectoryCtx.lineWidth = Math.max(2, width * 0.0035) + recent * 3;
      trajectoryCtx.beginPath();
      trajectoryCtx.moveTo(a.x, a.y);
      trajectoryCtx.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2, b.x, b.y);
      trajectoryCtx.stroke();
    }
    trajectoryCtx.globalAlpha = 1;
  });
}

function updateMetrics() {
  const frame = getCurrentFrame();
  const person = getCurrentPerson(frame);
  const duration = sourceVideo.duration || 0;
  timeText.textContent = `${(sourceVideo.currentTime || 0).toFixed(2)}s`;
  durationText.textContent = `${duration.toFixed(2)}s`;
  timeline.value = sourceVideo.currentTime || 0;
  playbackMetric.textContent = sourceVideo.paused ? "Paused" : "Playing";
  const frameNumber = frame?.frameNumber || 0;
  syncDebug.textContent = `Video frame ${frameNumber} | Pose frame ${frameNumber} | Trace frame ${frameNumber} | ${analysis?.averageInferenceMs?.toFixed(1) || 0}ms`;
  if (!person) {
    trackingMetric.textContent = analysis ? "Not visible" : "Waiting";
    confidenceMetric.textContent = "0%";
    lostJointsMetric.textContent = String(JOINTS.length);
    return;
  }

  const speed = Math.hypot(person.velocity.x, person.velocity.y) * 160;
  const acceleration = Math.hypot(person.acceleration.x, person.acceleration.y) * 160;
  const leftAnkle = person.keypoints.find((item) => item.name === "leftAnkle");
  const rightAnkle = person.keypoints.find((item) => item.name === "rightAnkle");
  const stride = leftAnkle && rightAnkle ? Math.hypot(leftAnkle.x - rightAnkle.x, leftAnkle.y - rightAnkle.y) * 960 : 0;
  const first = processor.getHistory(selectedTrackId)[0];
  const drift = first ? Math.hypot(person.bbox.x - first.bbox.x, person.bbox.y - first.bbox.y) * 960 : 0;

  speedMetric.textContent = `${Math.round(speed)} px/s`;
  accelMetric.textContent = `${Math.round(acceleration)} px/s²`;
  strideMetric.textContent = `${Math.round(stride)} px`;
  centerMetric.textContent = `${Math.round(drift)} px`;
  confidenceMetric.textContent = `${Math.round(person.confidence * 100)}%`;
  trackingMetric.textContent = person.predicted ? "Predicted" : "Stable";
  lostJointsMetric.textContent = person.predicted ? "2" : "0";
}

function drawCurrentViews() {
  drawVideoOverlay();
  drawPose();
  drawTrajectory();
  updateMetrics();
}

function animationLoop() {
  drawCurrentViews();
  animationId = requestAnimationFrame(animationLoop);
}

function startLoop() {
  if (animationId === null) animationLoop();
}

function stopLoop() {
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  drawCurrentViews();
}

function exportCsv() {
  if (!analysis || selectedTrackId === null) return;
  const rows = [["frameNumber", "timestamp", "trackId", "joint", "x", "y", "confidence", "velocityX", "velocityY", "accelerationX", "accelerationY"]];
  processor.getHistory(selectedTrackId).forEach((person) => {
    person.keypoints
      .filter((keypoint) => selectedJoints.has(keypoint.name))
      .forEach((keypoint) => rows.push([
        person.frameNumber,
        person.timestamp.toFixed(3),
        person.trackId,
        keypoint.name,
        keypoint.x.toFixed(5),
        keypoint.y.toFixed(5),
        keypoint.confidence.toFixed(3),
        person.velocity.x.toFixed(5),
        person.velocity.y.toFixed(5),
        person.acceleration.x.toFixed(5),
        person.acceleration.y.toFixed(5),
      ]));
  });
  const blob = new Blob([rows.map((row) => row.join(",")).join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `motiontrace-track-${selectedTrackId}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

videoInput.addEventListener("change", () => {
  const file = videoInput.files?.[0];
  if (!file) return;
  if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
  lastObjectUrl = URL.createObjectURL(file);
  sourceVideo.src = lastObjectUrl;
  sourceVideo.controls = false;
  dropHint.hidden = true;
  analysis = null;
  selectedTrackId = null;
  createPersonControls();
  analyzeBtn.disabled = false;
  exportBtn.disabled = true;
  playBtn.disabled = true;
  timeline.disabled = true;
  playBtn.textContent = "Play";
  videoMeta.textContent = file.name;
  poseMeta.textContent = "Ready";
  trajectoryMeta.textContent = "Ready";
  frameText.textContent = "0";
  setStatus("Video loaded. Run analysis to create persistent tracks and pose data.");
  sourceVideo.addEventListener("loadedmetadata", () => {
    timeline.max = sourceVideo.duration || 0;
    durationText.textContent = `${(sourceVideo.duration || 0).toFixed(2)}s`;
  }, { once: true });
  drawCurrentViews();
});

analyzeBtn.addEventListener("click", analyzeVideo);
exportBtn.addEventListener("click", exportCsv);
playBtn.addEventListener("click", () => (sourceVideo.paused ? sourceVideo.play() : sourceVideo.pause()));
sourceVideo.addEventListener("play", () => {
  playBtn.textContent = "Pause";
  startLoop();
});
sourceVideo.addEventListener("pause", () => {
  playBtn.textContent = "Play";
  stopLoop();
});
sourceVideo.addEventListener("ended", stopLoop);
sourceVideo.addEventListener("timeupdate", drawCurrentViews);
timeline.addEventListener("input", () => {
  sourceVideo.currentTime = Number(timeline.value);
  drawCurrentViews();
});
trailMode.addEventListener("change", drawCurrentViews);
debugToggle.addEventListener("change", drawCurrentViews);
confidenceThreshold.addEventListener("input", () => {
  confidenceThresholdText.textContent = Number(confidenceThreshold.value).toFixed(2);
});
drawerToggle.addEventListener("click", () => {
  const nextHidden = !analysisDrawer.hidden;
  analysisDrawer.hidden = nextHidden;
  drawerToggle.setAttribute("aria-expanded", String(!nextHidden));
});
window.addEventListener("resize", drawCurrentViews);

createJointControls();
createPersonControls();
selectedText.textContent = `${selectedJoints.size} joints`;
drawCurrentViews();
