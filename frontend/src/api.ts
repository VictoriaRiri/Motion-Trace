import type { AnalysisMetadata, FrameData, MovementMetrics } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function uploadVideo(file: File): Promise<{ videoId: string; filename: string }> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${API_BASE}/upload`, { method: "POST", body: form });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function analyzeVideo(videoId: string): Promise<AnalysisMetadata> {
  const response = await fetch(`${API_BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function getFrame(analysisId: string, frameNumber: number): Promise<FrameData> {
  const response = await fetch(`${API_BASE}/frame/${analysisId}/${frameNumber}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function getTrajectory(analysisId: string, playerId: number): Promise<Record<string, [number, number, number, number][]>> {
  const response = await fetch(`${API_BASE}/trajectory/${analysisId}/${playerId}`);
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return data.trajectory;
}

export async function getMetrics(analysisId: string, playerId: number): Promise<MovementMetrics> {
  const response = await fetch(`${API_BASE}/metrics/${analysisId}/${playerId}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
