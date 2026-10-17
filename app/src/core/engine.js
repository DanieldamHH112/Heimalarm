// Alarm-Logik: Sperrzeit, eigene vs. fremde Alarme, Testalarm, Ablauf am PC.
import { on, emit } from "./events.js";
import { settings } from "./settings.js";
import { log } from "./log.js";
import { hasPcFeatures } from "./platform.js";
import { ACTIONS, runPcAction } from "./pc.js";
import { notify } from "./notify.js";
import { fmtTime } from "../ui/dom.js";

/** Letzter Alarm je Kennung – Sperrzeit gilt pro Person, nicht global. */
const lastByWho = new Map();
export const engine = { last: null };

export function init() {
  on("alarm-in", (a) => handleAlarm(a));
}

function handleAlarm(a, { test = false } = {}) {
  const s = settings().alarm;
  if (!test && !s.mqtt && a.source === "ESP32") return;
  // A4 – Sperrzeit: zweites Signal derselben Person kurz danach ist derselbe Einsatz
  if (!test && a.ts - (lastByWho.get(a.who) || 0) < s.lockoutSec * 1000) {
    log("info", "Weiteres Signal ignoriert (Sperrzeit)", `${a.source} · ${a.who}`);
    return;
  }
  if (!test) lastByWho.set(a.who, a.ts);
  const own = a.who === s.me;
  engine.last = { ...a, own, test };
  log("alarm", test ? "Testalarm" : own ? "Alarm" : `Alarm von „${a.who}“`, `${a.source} · alarm/${a.who}`);
  emit("alarm", engine.last);

  if (own && hasPcFeatures) emit("takeover", engine.last);
  else if (!test) notify(own ? "Heimalarm: Einsatz" : `Heimalarm: Alarm von ${a.who}`, `${fmtTime(a.ts)} · ${a.source}`);
}

export function testAlarm() {
  handleAlarm({ who: settings().alarm.me, source: "Test", ts: Date.now() }, { test: true });
  // Ohne PC-Funktionen (Handy/Browser) die Abfrage nur zur Ansicht zeigen
  if (!hasPcFeatures) emit("takeover", engine.last);
}

/** Ergebnis der Abfrage "Fährst du?" */
export async function decide(going, { test = false, timeout = false } = {}) {
  const action = settings().pc.action;
  if (!going) {
    log("info", timeout ? "Keine Antwort – keine Aktion (Einstellung „Abbrechen“)" : "„Ich fahre nicht“ – keine Aktion");
    return;
  }
  const label = ACTIONS[action]?.label || action;
  const why = timeout ? "Keine Antwort" : "„Ich fahre“";
  if (test || action === "none" || !hasPcFeatures) {
    log("action", `${why} → ${label}`, test ? "Testalarm: nicht ausgeführt" : "nicht ausgeführt");
    return;
  }
  log("action", `${why} → ${label}`, "wird ausgeführt");
  try { await runPcAction(action); }
  catch (e) { log("warn", `${label} fehlgeschlagen`, String(e)); }
}
