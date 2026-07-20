import type { AnalysisMetadata, FrameData, MovementMetrics } from "./types";

const LOCAL_API = "http://127.0.0.1:8000";
const DEFAULT_RENDER_API = "https://motion-trace.onrender.com";
const STALE_BACKENDS = [
  "motiontrace-backend-production.up.railway.app",
  "motiontrace-backend.onrender.com",
];

function usableApiBase(value: string | undefined | null) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  return STALE_BACKENDS.some((staleHost) => trimmed.includes(staleHost)) ? "" : trimmed;
}

const API_BASE = (() => {
  const configured = usableApiBase(import.meta.env.VITE_API_BASE_URL);
  if (configured) return configured;
  if (typeof window !== "undefined") {
    const saved = usableApiBase(window.localStorage.getItem("motiontrace_api_base_url"));
    if (saved) return saved;
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return LOCAL_API;
    return DEFAULT_RENDER_API;
  }
  return "";
})();

export const backendAvailable = Boolean(API_BASE);
export const apiBase = API_BASE;

export async function checkBackendHealth(): Promise<{ status: string; ready: boolean }> {
  const response = await fetch(buildUrl("/health"));
  if (!response.ok) throw new Error(`Backend health check failed: ${response.status}`);
  return response.json();
}

function buildUrl(path: string) {
  if (!API_BASE) throw new Error("Backend API base URL is not configured. Set VITE_API_BASE_URL or run the backend locally.");
  return `${API_BASE}${path}`;
}

export function uploadVideo(file: File, onProgress?: (percent: number) => void): Promise<{ videoId: string; filename: string }> {
  return new Promise((resolve, reject) => {
    if (!API_BASE) {
      reject(new Error("Backend API URL not configured for this deployment."));
      return;
    }
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    xhr.open("POST", buildUrl("/upload"));
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
