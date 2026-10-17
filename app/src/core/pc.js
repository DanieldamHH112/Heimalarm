// PC-Aktionen (nur Windows-Programm). Ausführung im Rust-Kern, siehe src-tauri/src/lib.rs.
import { isTauri, hasPcFeatures } from "./platform.js";

export const ACTIONS = {
  hibernate: { label: "Ruhezustand", hint: "Alles bleibt offen, PC ist stromlos. Empfohlen." },
  sleep: { label: "Energiesparen", hint: "Schnell wieder da, braucht weiter etwas Strom." },
  lock: { label: "Nur sperren", hint: "PC läuft weiter, Bildschirm gesperrt." },
  shutdown: { label: "Herunterfahren", hint: "Kann an „Speichern?“-Dialogen hängen bleiben." },
  mixed: { label: "Mischform", hint: "Herunterfahren, nach 2 min sonst Ruhezustand." },
  none: { label: "Nichts tun", hint: "Nur Abfrage und Protokoll." },
};

async function callCore(cmd, args) {
  if (!isTauri) throw new Error("Nur im Windows-Programm verfügbar");
  const core = await import("@tauri-apps/api/core");
  return core.invoke(cmd, args);
}

export const runPcAction = (action) => callCore("pc_action", { action });

/** Fenster nach vorne holen, Vollbild, immer im Vordergrund. */
export async function takeoverWindow(onTop) {
  if (!hasPcFeatures) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const w = getCurrentWindow();
  if (onTop) {
    await w.unminimize(); await w.show();
    await w.setAlwaysOnTop(true); await w.setFullscreen(true); await w.setFocus();
  } else {
    await w.setFullscreen(false); await w.setAlwaysOnTop(false);
  }
}

export async function setAutostart(enabled) {
  if (!hasPcFeatures) return;
  const m = await import("@tauri-apps/plugin-autostart");
  if (enabled) await m.enable(); else await m.disable();
}

/** Autostart beim Start an die Einstellung angleichen (D9). */
export async function syncAutostart(enabled) {
  if (!hasPcFeatures) return;
  const m = await import("@tauri-apps/plugin-autostart");
  if ((await m.isEnabled()) !== enabled) await setAutostart(enabled);
}
