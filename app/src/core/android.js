// Android-Funktionen über das eigene Plugin (plugins/heimalarm):
// Hintergrund-Dienst, Akku-Optimierung (E6), Benachrichtigungen mitlesen (A1/A6).
import { isTauri, isAndroid } from "./platform.js";
import { settings, set } from "./settings.js";
import { log } from "./log.js";
import { alarmFromNotification } from "./engine.js";

const enabled = isTauri && isAndroid;

async function call(cmd, args) {
  const core = await import("@tauri-apps/api/core");
  return core.invoke(`plugin:heimalarm|${cmd}`, args);
}

export const androidStatus = () => (enabled ? call("status") : Promise.resolve({ supported: false }));
export const openBatterySettings = () => call("open_battery_settings");
export const openNotificationAccess = () => call("open_notification_access");
export async function setBackgroundService(on) {
  if (!enabled) return;
  await call("set_service", { enabled: on });
  set("android.service", on);
}

export async function initAndroid() {
  if (!enabled) return;
  const core = await import("@tauri-apps/api/core");
  try {
    await core.addPluginListener("heimalarm", "notification", (n) => alarmFromNotification(n));
  } catch (e) {
    log("warn", "Benachrichtigungen mitlesen nicht verfügbar", String(e));
  }
  if (settings().android?.service !== false) {
    setBackgroundService(true).catch((e) => log("warn", "Hintergrund-Dienst nicht gestartet", String(e)));
  }
  // Abstand zu Status-/Navigationsleiste übernehmen (falls die App sie vor dem Laden der Seite gemeldet hat)
  try {
    const st = await call("status");
    const root = document.documentElement.style;
    if (st.insetTop) root.setProperty("--inset-top", `${st.insetTop}px`);
    if (st.insetBottom) root.setProperty("--inset-bottom", `${st.insetBottom}px`);
  } catch { /* ältere App-Version */ }
  // Beim ersten Start einmal um die Ausnahme von der Akku-Optimierung bitten (sonst stoppt Android die App im Hintergrund).
  if (!settings().android?.batteryAsked) {
    try {
      const s = await call("status");
      if (s.batteryOptimized) await openBatterySettings();
    } catch (e) {
      log("warn", "Akku-Optimierung nicht abgefragt", String(e));
    }
    set("android.batteryAsked", true);
  }
}
