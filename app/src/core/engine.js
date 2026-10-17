// Alarm-Logik in der App: Sperrzeit je Person, eigene vs. fremde Alarme, Test/Probe,
// Ruhezeiten und Ausnahmen am PC, Ablauf nach „Fährst du?“.
// Routinen (Licht usw.) laufen im Zentralen-Dienst, damit sie auch ohne Handy/PC funktionieren.
import { on, emit } from "./events.js";
import { settings } from "./settings.js";
import { log } from "./log.js";
import { hasPcFeatures } from "./platform.js";
import { ACTIONS, runPcAction, runningProcesses, stopMedia } from "./pc.js";
import { notify } from "./notify.js";
import { publish, state } from "./mqtt.js";
import { fmtTime } from "../ui/dom.js";

const lastByWho = new Map();
export const engine = { last: null };

export function init() {
  on("alarm-in", (a) => handleAlarm(a));
}

const toMin = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + (m || 0); };
function inQuietTime() {
  const { quietFrom, quietTo } = settings().pc;
  if (!quietFrom || !quietTo) return false;
  const d = new Date(), n = d.getHours() * 60 + d.getMinutes(), a = toMin(quietFrom), b = toMin(quietTo);
  return a <= b ? n >= a && n < b : n >= a || n < b;
}

function handleAlarm(a) {
  const s = settings().alarm;
  const test = Boolean(a.test || s.testMode);
  const probe = Boolean(a.probe);
  if (a.source === "ESP32" && !s.mqtt) return;
  // A4 – Sperrzeit: weiteres Signal derselben Person kurz danach ist derselbe Einsatz (A5 – Quellen zusammenführen)
  if (!test && !probe && a.ts - (lastByWho.get(a.who) || 0) < s.lockoutSec * 1000) {
    log("info", "Weiteres Signal zusammengeführt (Sperrzeit)", `${a.source} · ${a.who}`);
    return;
  }
  if (!test && !probe) lastByWho.set(a.who, a.ts);

  const own = a.who === s.me;
  engine.last = { ...a, own, test: test || probe, probe };
  const extra = [a.keyword, a.unit].filter(Boolean).join(" · ");
  log("alarm", probe ? "Komplettprobe" : test ? "Testalarm" : own ? "Alarm" : `Alarm von „${a.who}“`,
    `${a.source} · alarm/${a.who}${extra ? " · " + extra : ""}`);
  emit("alarm", engine.last);

  if (own && hasPcFeatures) {
    if (inQuietTime() && !test && !probe) { log("info", "Ruhezeit am PC – keine Abfrage"); return; } // D12
    emit("takeover", engine.last);
  } else if (!test) {
    notify(own ? "Heimalarm: Einsatz" : `Heimalarm: Alarm von ${a.who}`, `${fmtTime(a.ts)}${extra ? " · " + extra : ""}`);
  }
}

/** I1 – Testalarm nur in dieser App (keine Routinen). */
export function testAlarm() {
  handleAlarm({ who: settings().alarm.me, source: "Test", ts: Date.now(), test: true });
  if (!hasPcFeatures) emit("takeover", engine.last);
}

/** A11 – Kontakt simulieren: geht über die Zentrale an alle Geräte, Routinen laufen im Testmodus. */
export const simulateContact = () => publish(`alarm/${settings().alarm.me}`, { source: "Simulation", test: true });

/** I2 – Komplettprobe: Routinen schalten wirklich, PC-Aktion wird nur angezeigt. */
export const fullProbe = () => publish(`alarm/${settings().alarm.me}`, { source: "Komplettprobe", probe: true });

/** Alarm aus einer Android-Benachrichtigung (A1/A6). */
export function alarmFromNotification({ app, title, text }) {
  const s = settings().alarm;
  if (!s.notifications) return;
  const apps = s.filterApps.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const words = s.filterWords.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const body = `${title} ${text}`.toLowerCase();
  if (apps.length && !apps.some((x) => String(app).toLowerCase().includes(x))) return;
  if (words.length && !words.some((w) => body.includes(w))) return;
  const data = { source: "Benachrichtigung", keyword: String(title || "").slice(0, 80) };
  // Über die Zentrale verteilen (PC, Routinen); ohne Verbindung lokal auslösen
  if (!(state.connected && publish(`alarm/${s.me}`, data))) handleAlarm({ who: s.me, ts: Date.now(), ...data });
}

/** Ergebnis der Abfrage „Fährst du?“ */
export async function decide(going, { test = false, timeout = false } = {}) {
  const p = settings().pc;
  if (!going) {
    log("info", timeout ? "Keine Antwort – keine Aktion (Einstellung „Abbrechen“)" : "„Ich fahre nicht“ – keine Aktion");
    return;
  }
  let action = p.action;
  const why = timeout ? "Keine Antwort" : "„Ich fahre“";
  // D7 – Ausnahmen: bestimmte Programme verhindern die PC-Aktion
  const names = p.exceptions.split(",").map((x) => x.trim()).filter(Boolean);
  if (hasPcFeatures && names.length && action !== "none" && action !== "lock") {
    const running = await runningProcesses(names).catch(() => []);
    if (running.length) { log("info", `Ausnahme aktiv (${running.join(", ")}) – PC wird nur gesperrt`); action = "lock"; }
  }
  const label = ACTIONS[action]?.label || action;
  if (test || action === "none" || !hasPcFeatures) {
    log("action", `${why} → ${label}`, test ? "Test: nicht ausgeführt" : "nicht ausgeführt");
    return;
  }
  if (p.stopMedia) await stopMedia().catch(() => {}); // D8
  log("action", `${why} → ${label}`, "wird ausgeführt");
  try { await runPcAction(action); }
  catch (e) { log("warn", `${label} fehlgeschlagen`, String(e)); }
}
