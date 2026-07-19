import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/upload": { target: apiTarget, changeOrigin: true },
        "/analyze": { target: apiTarget, changeOrigin: true },
        "/frame": { target: apiTarget, changeOrigin: true },
        "/trajectory": { target: apiTarget, changeOrigin: true },
        "/metrics": { target: apiTarget, changeOrigin: true },
      },
    },
  };
});
