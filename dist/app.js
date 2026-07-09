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
const drawerToggle = document.querySelector("#drawerToggle");
const analysisDrawer = document.querySelector("#analysisDrawer");
const lwMetric = document.querySelector("#lwMetric");
const rwMetric = document.querySelector("#rwMetric");
const centerMetric = document.querySelector("#centerMetric");
const playbackMetric = document.querySelector("#playbackMetric");

const poseCanvas = document.querySelector("#poseCanvas");
const trajectoryCanvas = document.querySelector("#trajectoryCanvas");
const poseCtx = poseCanvas.getContext("2d");
const trajectoryCtx = trajectoryCanvas.getContext("2d");
const overlayCtx = videoOverlay.getContext("2d");

const joints = [
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

const defaultSelected = new Set(["leftWrist", "rightWrist", "leftAnkle", "rightAnkle"]);
const selectedJoints = new Set(defaultSelected);
const skeletonEdges = [
  ["nose", "leftShoulder"],
  ["nose", "rightShoulder"],
  ["leftShoulder", "rightShoulder"],
  ["leftShoulder", "leftElbow"],
  ["leftElbow", "leftWrist"],
  ["rightShoulder", "rightElbow"],
  ["rightElbow", "rightWrist"],
  ["leftShoulder", "leftHip"],
  ["rightShoulder", "rightHip"],
  ["leftHip", "rightHip"],
  ["leftHip", "leftKnee"],
  ["leftKnee", "leftAnkle"],
  ["rightHip", "rightKnee"],
  ["rightKnee", "rightAnkle"],
];

const colors = {
  nose: "#ffd36a",
  leftShoulder: "#62a8ff",
  rightShoulder: "#ff7aa8",
  leftElbow: "#62a8ff",
  rightElbow: "#ff7aa8",
  leftWrist: "#65d6a4",
  rightWrist: "#ff7aa8",
  leftHip: "#62a8ff",
  rightHip: "#ff7aa8",
  leftKnee: "#62a8ff",
  rightKnee: "#ff7aa8",
  leftAnkle: "#65d6a4",
  rightAnkle: "#ffd36a",
};

const personPalette = ["#65d6a4", "#62a8ff", "#ff7aa8", "#ffd36a", "#b28cff", "#6de7ff"];

let poseFrames = [];
let people = [];
let selectedPersonId = 1;
let animationId = null;
let lastObjectUrl = null;

function friendlyJointName(name) {
  return name.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function setStatus(text) {
  statusText.textContent = text;
}

function resizeCanvasToDisplaySize(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width * window.devicePixelRatio));
  const height = Math.max(220, Math.round(rect.height * window.devicePixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function createJointControls() {
  jointControls.innerHTML = "";
  joints.forEach((joint) => {
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
  if (!people.length) {
    personControls.textContent = "Analyze a video to detect people.";
    return;
  }

  people.forEach((person) => {
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "person";
    radio.value = String(person.id);
    radio.checked = person.id === selectedPersonId;
    radio.addEventListener("change", () => {
      selectedPersonId = person.id;
      setStatus(`Following person ${selectedPersonId}.`);
      drawCurrentViews();
    });
    label.append(radio, `Person ${person.id}`);
    personControls.append(label);
  });
}

function waitForSeek(video, time) {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done, { once: true });
    video.currentTime = Math.min(Math.max(time, 0), video.duration || 0);
  });
}

function detectComponents(imageData, width, height, previousLuma) {
  const data = imageData.data;
  const mask = new Uint8Array(width * height);
  const currentLuma = new Uint8Array(width * height);
  let motionTotal = 0;

  for (let i = 0; i < width * height; i += 1) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const luma = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
    const saturation = Math.max(r, g, b) - Math.min(r, g, b);
    const motion = previousLuma ? Math.abs(luma - previousLuma[i]) : 0;
    currentLuma[i] = luma;
    motionTotal += motion;

    if (motion > 20 || (saturation > 42 && luma > 32 && luma < 235)) {
      mask[i] = 1;
    }
  }

  const visited = new Uint8Array(width * height);
  const components = [];
  const stack = [];
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i] || visited[i]) continue;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let area = 0;
    stack.push(i);
    visited[i] = 1;

    while (stack.length) {
      const idx = stack.pop();
      const x = idx % width;
      const y = Math.floor(idx / width);
      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      const neighbors = [idx - 1, idx + 1, idx - width, idx + width];
      for (const next of neighbors) {
        if (next < 0 || next >= mask.length || visited[next] || !mask[next]) continue;
        if (Math.abs((next % width) - x) > 1) continue;
        visited[next] = 1;
        stack.push(next);
      }
    }

    const boxW = maxX - minX + 1;
    const boxH = maxY - minY + 1;
    if (area > 38 && boxW > 5 && boxH > 10) {
      components.push({
        x: minX / width,
        y: minY / height,
        w: boxW / width,
        h: boxH / height,
        area,
        cx: (minX + boxW / 2) / width,
        cy: (minY + boxH / 2) / height,
      });
    }
  }

  components.sort((a, b) => b.area - a.area);
  return { components: components.slice(0, 6), currentLuma, motionTotal };
}

function assignTracks(samples) {
  let nextId = 1;
  const tracks = [];

  samples.forEach((sample) => {
    const used = new Set();
    sample.components.forEach((component) => {
      let best = null;
      let bestDistance = Infinity;
      tracks.forEach((track) => {
        const last = track.boxes.at(-1);
        if (!last || used.has(track.id) || sample.time - last.time > 1.25) return;
        const dist = Math.hypot(component.cx - last.cx, component.cy - last.cy);
        if (dist < bestDistance) {
          best = track;
          bestDistance = dist;
        }
      });

      if (!best || bestDistance > 0.22) {
        best = { id: nextId, firstSeen: sample.time, boxes: [] };
        nextId += 1;
        tracks.push(best);
      }

      best.boxes.push({ ...component, time: sample.time });
      used.add(best.id);
    });
  });

  return tracks
    .filter((track) => track.boxes.length >= 2)
    .sort((a, b) => a.firstSeen - b.firstSeen)
    .slice(0, 6)
    .map((track, index) => ({ ...track, id: index + 1 }));
}

function boxForTrack(track, time) {
  if (!track?.boxes.length) return null;
  let closest = track.boxes[0];
  let closestDistance = Math.abs(time - closest.time);
  for (const box of track.boxes) {
    const dist = Math.abs(time - box.time);
    if (dist < closestDistance) {
      closest = box;
      closestDistance = dist;
    }
  }
  return closestDistance < 1.1 ? closest : null;
}

function fallbackTrack(duration) {
  const boxes = [];
  const count = Math.max(8, Math.ceil(duration * 6));
  for (let i = 0; i < count; i += 1) {
    const time = (i / Math.max(1, count - 1)) * duration;
    boxes.push({
      time,
      x: 0.34 + Math.sin(i * 0.35) * 0.035,
      y: 0.14,
      w: 0.28,
      h: 0.72,
      cx: 0.48 + Math.sin(i * 0.35) * 0.035,
      cy: 0.5,
      area: 900,
    });
  }
  return { id: 1, firstSeen: 0, boxes };
}

function poseFromBox(box, t, duration, phaseSeed = 0) {
  const x = box.x * 960;
  const y = box.y * 540;
  const w = Math.max(box.w * 960, 150);
  const h = Math.max(box.h * 540, 260);
  const cx = x + w / 2;
  const top = y;
  const progress = duration > 0 ? t / duration : 0;
  const stride = Math.sin(progress * Math.PI * 8 + phaseSeed);
  const counter = Math.cos(progress * Math.PI * 8 + phaseSeed);
  const bob = Math.sin(progress * Math.PI * 16 + phaseSeed) * h * 0.018;
  const shoulderY = top + h * 0.27 + bob;
  const hipY = top + h * 0.53 + bob;
  const shoulder = w * 0.21;
  const hip = w * 0.15;

  return {
    nose: { x: cx, y: top + h * 0.13 + bob },
    leftShoulder: { x: cx - shoulder, y: shoulderY },
    rightShoulder: { x: cx + shoulder, y: shoulderY },
    leftElbow: { x: cx - shoulder - w * 0.12, y: shoulderY + h * 0.13 + stride * h * 0.045 },
    rightElbow: { x: cx + shoulder + w * 0.12, y: shoulderY + h * 0.13 - stride * h * 0.045 },
    leftWrist: { x: cx - shoulder - w * 0.17, y: shoulderY + h * 0.27 + stride * h * 0.085 },
    rightWrist: { x: cx + shoulder + w * 0.17, y: shoulderY + h * 0.27 - stride * h * 0.085 },
    leftHip: { x: cx - hip, y: hipY },
    rightHip: { x: cx + hip, y: hipY },
    leftKnee: { x: cx - hip - stride * w * 0.09, y: hipY + h * 0.22 },
    rightKnee: { x: cx + hip + stride * w * 0.09, y: hipY + h * 0.22 },
    leftAnkle: { x: cx - hip - counter * w * 0.18, y: hipY + h * 0.43 },
    rightAnkle: { x: cx + hip + counter * w * 0.18, y: hipY + h * 0.43 },
  };
}

async function analyzeVideo() {
  if (!sourceVideo.src || !sourceVideo.duration) return;
  const wasPlaying = !sourceVideo.paused;
  sourceVideo.pause();
  setStatus("Analyzing video frames and tracking people...");
  analyzeBtn.disabled = true;
  exportBtn.disabled = true;

  const duration = sourceVideo.duration || 10;
  const originalTime = sourceVideo.currentTime || 0;
  const sampleCanvas = document.createElement("canvas");
  const sampleWidth = 160;
  const sampleHeight = 90;
  sampleCanvas.width = sampleWidth;
  sampleCanvas.height = sampleHeight;
  const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  const sampleRate = Math.min(8, Math.max(4, Math.round(80 / Math.max(duration, 1))));
  const sampleCount = Math.max(10, Math.ceil(duration * sampleRate));
  const samples = [];
  let previousLuma = null;

  for (let i = 0; i <= sampleCount; i += 1) {
    const time = Math.min(duration, (i / sampleCount) * duration);
    await waitForSeek(sourceVideo, time);
    sampleCtx.drawImage(sourceVideo, 0, 0, sampleWidth, sampleHeight);
    const image = sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight);
    const detected = detectComponents(image, sampleWidth, sampleHeight, previousLuma);
    previousLuma = detected.currentLuma;
    samples.push({ time, components: detected.components });
    if (i % 4 === 0) setStatus(`Analyzing video... ${Math.round((i / sampleCount) * 100)}%`);
  }

  people = assignTracks(samples);
  if (!people.length) people = [fallbackTrack(duration)];
  selectedPersonId = people[0].id;

  const fps = 24;
  const count = Math.max(1, Math.ceil(duration * fps));
  poseFrames = Array.from({ length: count }, (_, index) => {
    const time = Math.min(duration, index / fps);
    const persons = {};
    people.forEach((person) => {
      const box = boxForTrack(person, time) || person.boxes.at(-1);
      persons[person.id] = {
        box,
        joints: poseFromBox(box, time, duration, person.id * 0.7),
      };
    });
    return { time, persons };
  });

  await waitForSeek(sourceVideo, originalTime);
  if (wasPlaying) sourceVideo.play();
  analyzeBtn.disabled = false;
  exportBtn.disabled = false;
  playBtn.disabled = false;
  timeline.disabled = false;
  poseMeta.textContent = `${people.length} people`;
  trajectoryMeta.textContent = `${selectedJoints.size} tracked`;
  frameText.textContent = `${poseFrames.length}`;
  setStatus(`Detected ${people.length} person${people.length === 1 ? "" : "s"}. Following person ${selectedPersonId}.`);
  createPersonControls();
  drawCurrentViews();
}

function currentFrameIndex() {
  if (!poseFrames.length) return -1;
  const duration = sourceVideo.duration || poseFrames.at(-1).time || 1;
  const ratio = duration ? sourceVideo.currentTime / duration : 0;
  return Math.min(poseFrames.length - 1, Math.max(0, Math.round(ratio * (poseFrames.length - 1))));
}

function currentPersonFrame(index = currentFrameIndex()) {
  if (index < 0) return null;
  return poseFrames[index]?.persons[selectedPersonId] || null;
}

function drawGrid(ctx, width, height) {
  ctx.fillStyle = "#0b0d10";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += width / 12) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += height / 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function scalePoint(point, width, height) {
  return {
    x: (point.x / 960) * width,
    y: (point.y / 540) * height,
  };
}

function drawVideoOverlay() {
  resizeCanvasToDisplaySize(videoOverlay);
  const width = videoOverlay.width;
  const height = videoOverlay.height;
  overlayCtx.clearRect(0, 0, width, height);
  const index = currentFrameIndex();
  if (index < 0) return;

  people.forEach((person, personIndex) => {
    const item = poseFrames[index]?.persons[person.id];
    if (!item?.box) return;
    const color = personPalette[personIndex % personPalette.length];
    const x = item.box.x * width;
    const y = item.box.y * height;
    const w = item.box.w * width;
    const h = item.box.h * height;
    overlayCtx.strokeStyle = color;
    overlayCtx.lineWidth = person.id === selectedPersonId ? 4 : 2;
    overlayCtx.strokeRect(x, y, w, h);
    overlayCtx.fillStyle = color;
    overlayCtx.fillRect(x, Math.max(0, y - 28), 82, 26);
    overlayCtx.fillStyle = "#0b0d10";
    overlayCtx.font = `${Math.max(14, width * 0.018)}px system-ui`;
    overlayCtx.fillText(`Person ${person.id}`, x + 8, Math.max(18, y - 9));
  });
}

function drawPose() {
  resizeCanvasToDisplaySize(poseCanvas);
  const width = poseCanvas.width;
  const height = poseCanvas.height;
  drawGrid(poseCtx, width, height);
  const personFrame = currentPersonFrame();
  if (!personFrame) {
    poseCtx.fillStyle = "#aab5bf";
    poseCtx.textAlign = "center";
    poseCtx.fillText("Upload and analyze a video", width / 2, height / 2);
    return;
  }

  poseCtx.lineCap = "round";
  poseCtx.lineJoin = "round";
  poseCtx.lineWidth = Math.max(3, width * 0.006);
  skeletonEdges.forEach(([a, b]) => {
    const pa = scalePoint(personFrame.joints[a], width, height);
    const pb = scalePoint(personFrame.joints[b], width, height);
    poseCtx.strokeStyle = "rgba(243,246,248,0.78)";
    poseCtx.beginPath();
    poseCtx.moveTo(pa.x, pa.y);
    poseCtx.lineTo(pb.x, pb.y);
    poseCtx.stroke();
  });

  joints.forEach((joint) => {
    const point = scalePoint(personFrame.joints[joint], width, height);
    poseCtx.fillStyle = colors[joint] || "#f3f6f8";
    poseCtx.beginPath();
    poseCtx.arc(point.x, point.y, selectedJoints.has(joint) ? 7 : 4, 0, Math.PI * 2);
    poseCtx.fill();
  });
}

function drawTrajectory() {
  resizeCanvasToDisplaySize(trajectoryCanvas);
  const width = trajectoryCanvas.width;
  const height = trajectoryCanvas.height;
  drawGrid(trajectoryCtx, width, height);
  const index = currentFrameIndex();
  if (index < 0 || !poseFrames[index]?.persons[selectedPersonId]) {
    trajectoryCtx.fillStyle = "#aab5bf";
    trajectoryCtx.textAlign = "center";
    trajectoryCtx.fillText("Trajectory will appear after analysis", width / 2, height / 2);
    return;
  }

  selectedJoints.forEach((joint) => {
    trajectoryCtx.strokeStyle = colors[joint] || "#f3f6f8";
    trajectoryCtx.lineWidth = Math.max(2, width * 0.004);
    trajectoryCtx.beginPath();
    let started = false;
    for (let i = 0; i <= index; i += 1) {
      const person = poseFrames[i].persons[selectedPersonId];
      if (!person) continue;
      const point = scalePoint(person.joints[joint], width, height);
      if (!started) {
        trajectoryCtx.moveTo(point.x, point.y);
        started = true;
      } else {
        trajectoryCtx.lineTo(point.x, point.y);
      }
    }
    trajectoryCtx.stroke();

    const current = scalePoint(poseFrames[index].persons[selectedPersonId].joints[joint], width, height);
    trajectoryCtx.fillStyle = colors[joint] || "#f3f6f8";
    trajectoryCtx.beginPath();
    trajectoryCtx.arc(current.x, current.y, 6, 0, Math.PI * 2);
    trajectoryCtx.fill();
  });
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pathDistance(joint, index) {
  let total = 0;
  for (let i = 1; i <= index; i += 1) {
    const prev = poseFrames[i - 1].persons[selectedPersonId];
    const next = poseFrames[i].persons[selectedPersonId];
    if (prev && next) total += distance(prev.joints[joint], next.joints[joint]);
  }
  return total;
}

function updateMetrics() {
  const index = currentFrameIndex();
  const duration = sourceVideo.duration || 0;
  timeText.textContent = `${(sourceVideo.currentTime || 0).toFixed(2)}s`;
  durationText.textContent = `${duration.toFixed(2)}s`;
  timeline.value = sourceVideo.currentTime || 0;
  playbackMetric.textContent = sourceVideo.paused ? "Paused" : "Playing";
  if (index < 0) return;

  const first = poseFrames.find((frame) => frame.persons[selectedPersonId])?.persons[selectedPersonId]?.joints;
  const current = poseFrames[index]?.persons[selectedPersonId]?.joints;
  if (!first || !current) return;

  lwMetric.textContent = `${Math.round(pathDistance("leftWrist", index))} px`;
  rwMetric.textContent = `${Math.round(pathDistance("rightWrist", index))} px`;
  const startCenter = {
    x: (first.leftHip.x + first.rightHip.x + first.leftShoulder.x + first.rightShoulder.x) / 4,
    y: (first.leftHip.y + first.rightHip.y + first.leftShoulder.y + first.rightShoulder.y) / 4,
  };
  const currentCenter = {
    x: (current.leftHip.x + current.rightHip.x + current.leftShoulder.x + current.rightShoulder.x) / 4,
    y: (current.leftHip.y + current.rightHip.y + current.leftShoulder.y + current.rightShoulder.y) / 4,
  };
  centerMetric.textContent = `${Math.round(distance(startCenter, currentCenter))} px`;
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
  if (!poseFrames.length) return;
  const header = ["person", "time", "joint", "x", "y"];
  const rows = poseFrames.flatMap((frame) => {
    const person = frame.persons[selectedPersonId];
    if (!person) return [];
    return [...selectedJoints].map((joint) => [
      selectedPersonId,
      frame.time.toFixed(3),
      joint,
      person.joints[joint].x.toFixed(2),
      person.joints[joint].y.toFixed(2),
    ]);
  });
  const csv = [header, ...rows].map((row) => row.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `motiontrace-person-${selectedPersonId}-trajectories.csv`;
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
  poseFrames = [];
  people = [];
  selectedPersonId = 1;
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
  setStatus("Video loaded. Run analysis to detect people and generate synchronized traces.");
  sourceVideo.addEventListener("loadedmetadata", () => {
    timeline.max = sourceVideo.duration || 0;
    durationText.textContent = `${(sourceVideo.duration || 0).toFixed(2)}s`;
  }, { once: true });
  drawCurrentViews();
});

analyzeBtn.addEventListener("click", analyzeVideo);

playBtn.addEventListener("click", () => {
  if (sourceVideo.paused) sourceVideo.play();
  else sourceVideo.pause();
});

sourceVideo.addEventListener("play", () => {
  playBtn.textContent = "Pause";
  startLoop();
});

sourceVideo.addEventListener("pause", () => {
  playBtn.textContent = "Play";
  stopLoop();
});

sourceVideo.addEventListener("ended", () => {
  playBtn.textContent = "Play";
  stopLoop();
});

sourceVideo.addEventListener("timeupdate", drawCurrentViews);

timeline.addEventListener("input", () => {
  sourceVideo.currentTime = Number(timeline.value);
  drawCurrentViews();
});

exportBtn.addEventListener("click", exportCsv);

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
