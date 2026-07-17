import type { AnalysisMetadata, FrameData, MovementMetrics } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export function uploadVideo(file: File, onProgress?: (percent: number) => void): Promise<{ videoId: string; filename: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    xhr.open("POST", `${API_BASE}/upload`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const pct = Math.round((event.loaded / event.total) * 100);
        onProgress(pct);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data);
        } catch (err) {
          reject(err);
        }
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(form);
  });
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
