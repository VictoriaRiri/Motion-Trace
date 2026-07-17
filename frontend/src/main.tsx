import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Maximize2, Pause, Play, StepForward, Upload } from "lucide-react";
import { analyzeVideo, getFrame, getMetrics, getTrajectory, uploadVideo } from "./api";
import type { AnalysisMetadata, FrameData, Landmark, MovementMetrics } from "./types";
import "./styles.css";

const jointGroups: Record<string, string[]> = {
  all: [],
  left: ["left_shoulder", "left_elbow", "left_wrist", "left_hip", "left_knee", "left_ankle", "left_heel", "left_foot_index"],
  right: ["right_shoulder", "right_elbow", "right_wrist", "right_hip", "right_knee", "right_ankle", "right_heel", "right_foot_index"],
  upper: ["nose", "left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist"],
  lower: ["left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle", "left_heel", "right_heel"],
};

const skeletonEdges = [
  ["left_shoulder", "right_shoulder"], ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"], ["left_shoulder", "left_hip"],
  ["right_shoulder", "right_hip"], ["left_hip", "right_hip"], ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"], ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
];

type Slot = {
  file?: File;
  localUrl?: string;
  videoId?: string;
  analysis?: AnalysisMetadata;
  frame?: FrameData;
  trajectory?: Record<string, [number, number, number, number][]>;
  metrics?: MovementMetrics;
  selectedPlayer?: number;
  status: string;
};

function App() {
  const [slots, setSlots] = useState<Slot[]>([{ status: "Upload a video" }, { status: "Optional comparison video" }]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [jointMode, setJointMode] = useState("lower");
  const [trailLength, setTrailLength] = useState(90);
  const [trailOpacity, setTrailOpacity] = useState(0.7);
  const [trailThickness, setTrailThickness] = useState(3);
  const videoRefs = [useRef<HTMLVideoElement>(null), useRef<HTMLVideoElement>(null)];
  const poseRefs = [useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null)];
  const trajectoryRefs = [useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null)];

  const active = slots[activeSlot];
  const duration = Math.max(...slots.map((slot) => slot.analysis?.duration ?? 0), 0);

  useEffect(() => {
    let frame = 0;
    const tick = async () => {
      await Promise.all(slots.map((slot, index) => refreshFrame(index, slot)));
      drawAll();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [slots, time, jointMode, trailLength, trailOpacity, trailThickness]);

  useEffect(() => {
    videoRefs.forEach((ref) => {
      if (ref.current) {
        ref.current.playbackRate = speed;
        if (isPlaying) ref.current.play().catch(() => undefined);
        else ref.current.pause();
      }
    });
  }, [isPlaying, speed]);

  async function refreshFrame(index: number, slot: Slot) {
    if (!slot.analysis) return;
    const frameNumber = Math.min(slot.analysis.frameCount - 1, Math.max(0, Math.round(time * slot.analysis.fps)));
    if (slot.frame?.frameNumber === frameNumber) return;
    const frame = await getFrame(slot.analysis.analysisId, frameNumber);
    setSlots((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, frame } : item));
  }

  async function handleUpload(index: number, file: File) {
    const localUrl = URL.createObjectURL(file);
    setSlots((current) => current.map((slot, itemIndex) => itemIndex === index ? { ...slot, file, localUrl, status: "Uploading..." } : slot));
    try {
      const uploaded = await uploadVideo(file, (pct) => {
        setSlots((current) => current.map((slot, itemIndex) => itemIndex === index ? { ...slot, status: `Uploading... ${pct}%` } : slot));
      });
      setSlots((current) => current.map((slot, itemIndex) => itemIndex === index ? { ...slot, videoId: uploaded.videoId, status: "Ready to analyze" } : slot));
    } catch (err) {
      setSlots((current) => current.map((slot, itemIndex) => itemIndex === index ? { ...slot, status: `Upload failed: ${String(err)}` } : slot));
    }
  }

  async function handleAnalyze(index: number) {
    const slot = slots[index];
    if (!slot.videoId) return;
    setSlots((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, status: "Analyzing with YOLO + tracker + MediaPipe..." } : item));
    const analysis = await analyzeVideo(slot.videoId);
    const selectedPlayer = [...analysis.players].sort((a, b) => b.maxBboxArea - a.maxBboxArea)[0]?.trackId;
    const trajectory = selectedPlayer ? await getTrajectory(analysis.analysisId, selectedPlayer) : {};
    const metrics = selectedPlayer ? await getMetrics(analysis.analysisId, selectedPlayer) : undefined;
    setSlots((current) => current.map((item, itemIndex) => itemIndex === index ? {
      ...item,
      analysis,
      selectedPlayer,
      trajectory,
      metrics,
      status: selectedPlayer ? `Following Player ${selectedPlayer}` : "No player detected",
    } : item));
  }

  async function selectPlayer(index: number, playerId: number) {
    const slot = slots[index];
    if (!slot.analysis) return;
    const [trajectory, metrics] = await Promise.all([
      getTrajectory(slot.analysis.analysisId, playerId),
      getMetrics(slot.analysis.analysisId, playerId),
    ]);
    setSlots((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, selectedPlayer: playerId, trajectory, metrics } : item));
  }

  function seek(nextTime: number) {
    setTime(nextTime);
    videoRefs.forEach((ref) => {
      if (ref.current) ref.current.currentTime = nextTime;
    });
  }

  function drawAll() {
    slots.forEach((slot, index) => {
      drawPose(poseRefs[index].current, slot);
      drawTrajectory(trajectoryRefs[index].current, slot, time, jointMode, trailLength, trailOpacity, trailThickness);
    });
  }

  return (
    <main className="app">
      <header className="topbar">
        <div><h1>MotionTrace</h1><p>Hybrid YOLO tracking + cropped MediaPipe pose analysis</p></div>
        <div className="actions">
          <button onClick={() => setIsPlaying((value) => !value)}>{isPlaying ? <Pause size={16} /> : <Play size={16} />}{isPlaying ? "Pause" : "Play"}</button>
          <button onClick={() => seek(Math.min(duration, time + 1 / (active.analysis?.fps || 24)))}><StepForward size={16} />Frame</button>
          <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
            <option value={0.25}>0.25x</option><option value={0.5}>0.5x</option><option value={1}>1x</option><option value={2}>2x</option>
          </select>
          <button onClick={() => setDrawerOpen((value) => !value)}>{drawerOpen ? "Hide" : "Show"} Analysis</button>
        </div>
      </header>

      <section className="workspace">
        {slots.map((slot, index) => (
          <section className="video-set" key={index}>
            <div className="set-header">
              <strong>{index === 0 ? "Video A" : "Video B Comparison"}</strong>
              <label className="upload"><Upload size={16} />Upload<input type="file" accept="video/*" onChange={(event) => event.target.files?.[0] && handleUpload(index, event.target.files[0])} /></label>
              <button disabled={!slot.videoId} onClick={() => handleAnalyze(index)}>Analyze</button>
              <select value={slot.selectedPlayer ?? ""} onChange={(event) => selectPlayer(index, Number(event.target.value))}>
                <option value="">Player</option>
                {slot.analysis?.players.map((player) => <option key={player.trackId} value={player.trackId}>Player {player.trackId}</option>)}
              </select>
              <span>{slot.status}</span>
            </div>
            <div className="panels">
              <Panel title="Pose Skeleton"><canvas ref={poseRefs[index]} /></Panel>
              <Panel title="Trajectory"><canvas ref={trajectoryRefs[index]} /></Panel>
              <Panel title="Original Video">
                <video ref={videoRefs[index]} src={slot.localUrl} muted playsInline onTimeUpdate={(event) => index === activeSlot && setTime(event.currentTarget.currentTime)} />
                <button className="fullscreen" onClick={() => videoRefs[index].current?.requestFullscreen()}><Maximize2 size={16} /></button>
              </Panel>
            </div>
          </section>
        ))}
      </section>

      <section className="timeline">
        <span>Frame {active.frame?.frameNumber ?? 0}</span>
        <input min={0} max={duration || 0} step={1 / (active.analysis?.fps || 24)} value={time} type="range" onChange={(event) => seek(Number(event.target.value))} />
        <span>{time.toFixed(2)}s</span>
      </section>

      <aside className={`drawer ${drawerOpen ? "open" : ""}`}>
        <div className="drawer-header">
          <h2>Analysis Drawer</h2>
          <button className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Close analysis drawer">×</button>
        </div>
        <label>Joints<select value={jointMode} onChange={(event) => setJointMode(event.target.value)}>{Object.keys(jointGroups).map((group) => <option key={group} value={group}>{group}</option>)}</select></label>
        <label>Trail length<input type="range" min={10} max={240} value={trailLength} onChange={(event) => setTrailLength(Number(event.target.value))} /></label>
        <label>Opacity<input type="range" min={0.1} max={1} step={0.05} value={trailOpacity} onChange={(event) => setTrailOpacity(Number(event.target.value))} /></label>
        <label>Thickness<input type="range" min={1} max={8} value={trailThickness} onChange={(event) => setTrailThickness(Number(event.target.value))} /></label>
        {active.metrics && <Metrics metrics={active.metrics} />}
        <button onClick={() => exportJson(active)}>Export JSON</button>
        <button onClick={() => exportCsv(active)}>Export CSV</button>
      </aside>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <article className="panel"><header>{title}</header><div className="panel-body">{children}</div></article>;
}

function Metrics({ metrics }: { metrics: MovementMetrics }) {
  const rows = [
    ["Path", metrics.pathLength], ["Avg speed", metrics.averageSpeed], ["Max speed", metrics.maxSpeed],
    ["Acceleration", metrics.averageAcceleration], ["Curvature", metrics.curvature], ["Smoothness", metrics.smoothness],
    ["Symmetry", metrics.symmetry],
  ];
  return <div className="metrics">{rows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{Number(value).toFixed(2)}</strong></div>)}</div>;
}

function drawPose(canvas: HTMLCanvasElement | null, slot: Slot) {
  if (!canvas) return;
  const ctx = setupCanvas(canvas);
  const person = selectedPerson(slot);
  if (!person) return;
  ctx.strokeStyle = "#f3f6f8";
  ctx.lineWidth = 4;
  skeletonEdges.forEach(([a, b]) => {
    const pa = person.keypoints.find((joint) => joint.name === a);
    const pb = person.keypoints.find((joint) => joint.name === b);
    if (!pa || !pb) return;
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
  });
  person.keypoints.forEach((joint) => {
    ctx.fillStyle = joint.visibility > 0.5 ? "#65d6a4" : "#ffd36a";
    ctx.beginPath(); ctx.arc(joint.x, joint.y, 5, 0, Math.PI * 2); ctx.fill();
  });
}

function drawTrajectory(canvas: HTMLCanvasElement | null, slot: Slot, time: number, mode: string, trailLength: number, opacity: number, thickness: number) {
  if (!canvas || !slot.trajectory) return;
  const ctx = setupCanvas(canvas);
  const joints = jointGroups[mode].length ? jointGroups[mode] : Object.keys(slot.trajectory);
  joints.forEach((jointName, jointIndex) => {
    const points = (slot.trajectory?.[jointName] ?? []).filter((point) => point[3] <= time).slice(-trailLength);
    points.forEach((point, index) => {
      if (index === 0) return;
      const prev = points[index - 1];
      ctx.globalAlpha = opacity * (index / points.length);
      ctx.strokeStyle = jointIndex % 2 ? "#62a8ff" : "#65d6a4";
      ctx.lineWidth = thickness;
      ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(point[0], point[1]); ctx.stroke();
    });
  });
  ctx.globalAlpha = 1;
}

function setupCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(320, rect.width);
  canvas.height = Math.max(220, rect.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  ctx.fillStyle = "#0b0d10";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return ctx;
}

function selectedPerson(slot: Slot) {
  return slot.frame?.people.find((person) => person.trackId === slot.selectedPlayer);
}

function exportJson(slot: Slot) {
  download("motiontrace-analysis.json", JSON.stringify({ frame: slot.frame, metrics: slot.metrics, trajectory: slot.trajectory }, null, 2), "application/json");
}

function exportCsv(slot: Slot) {
  const rows = [["joint", "x", "y", "z", "timestamp"]];
  Object.entries(slot.trajectory ?? {}).forEach(([joint, points]) => points.forEach((point) => rows.push([joint, ...point.map(String)])));
  download("motiontrace-trajectories.csv", rows.map((row) => row.join(",")).join("\n"), "text/csv");
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
}

createRoot(document.getElementById("root")!).render(<App />);
