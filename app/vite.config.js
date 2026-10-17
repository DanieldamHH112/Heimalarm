import { defineConfig } from "vite";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// Tauri erwartet einen festen Port und keine Bildschirm-Löschung im Dev-Modus.
export default defineConfig({
  clearScreen: false,
  server: { port: 1420, strictPort: true, host: process.env.TAURI_DEV_HOST || false },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  define: { "import.meta.env.PACKAGE_VERSION": JSON.stringify(pkg.version) },
  build: { target: "es2022", outDir: "dist", emptyOutDir: true },
});
