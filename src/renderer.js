export const SKELETON_EDGES = [
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

export const JOINT_COLORS = {
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

export const PERSON_COLORS = ["#65d6a4", "#62a8ff", "#ff7aa8", "#ffd36a", "#b28cff", "#6de7ff"];

export function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.round(rect.width * window.devicePixelRatio));
  const height = Math.max(220, Math.round(rect.height * window.devicePixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

export function drawGrid(ctx, width, height) {
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

export function pointToCanvas(point, width, height) {
  return { x: point.x * width, y: point.y * height };
}
