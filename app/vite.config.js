import { defineConfig } from "vite";

// Tauri erwartet einen festen Port und keine Bildschirm-Löschung im Dev-Modus.
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: process.env.TAURI_DEV_HOST || false },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { target: "es2022", outDir: "dist", emptyOutDir: true },
});
