// Verbindungs-Check für die Status-Karte auf Start: prüft nacheinander, was eingerichtet ist,
// und meldet jeden Schritt („verbinde Zentrale …“, „Zentrale ok“). Ergebnis: alles ok oder fehlgeschlagen.
// Läuft beim Start, nach jedem Verbindungsabbruch und auf Knopfdruck.
import { emit, on } from "./events.js";
import { settings } from "./settings.js";
import { state } from "./mqtt.js";
import { has } from "./features.js";
import { direct, pingPeer } from "./direct.js";
import { divera, loadDivera } from "./divera.js";
import { hasPcFeatures } from "./platform.js";

export const checkup = {
  running: false,
  line: "",            // aktuelle Zeile („verbinde …“ oder „… ok“)
  lineOk: null,        // true/false für die Farbe des Ergebnisses, null = läuft
  failed: [],          // Namen, die nicht erreichbar waren
  done: false,         // mindestens einmal durchgelaufen
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Bis zu `ms` warten, bis `test()` wahr ist. */
async function until(test, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (test()) return true; await sleep(250); }
  return test();
}

/** Was geprüft wird – nur, was eingerichtet ist (wie die Übersicht). */
function steps() {
  const s = settings();
  const list = [];
  if (has.pi()) list.push({ name: `Zentrale ${s.broker.host}:${s.broker.port}`, run: () => until(() => state.connected, 8000) });
  if (has.esp() && !has.tuya()) list.push({ name: `Melder alarm/${s.alarm.me}`, run: () => until(() => state.devices[s.alarm.me]?.online, 4000) });
  if (has.esp() && has.tuya()) list.push({ name: "Funk-Alarmschalter", run: () => until(() => state.tuya?.online && state.tuya?.angemeldet, 4000) });
  if (has.direct() && hasPcFeatures) list.push({ name: "Empfang vom Handy", run: () => until(() => direct.ip && !direct.error, 4000) });
  if (has.direct() && !hasPcFeatures) for (const p of s.direct.peers || []) list.push({ name: p.name || p.host, run: () => pingPeer(p) });
  if (has.diveraApi()) list.push({ name: "Divera", run: async () => { await loadDivera().catch(() => {}); return divera.ok !== false; } });
  return list;
}

let runId = 0;
export async function runCheckup() {
  const id = ++runId;
  const list = steps();
  Object.assign(checkup, { running: true, failed: [], line: "", lineOk: null });
  const show = (line, ok = null) => { if (id !== runId) return; checkup.line = line; checkup.lineOk = ok; emit("checkup", checkup); };
  for (const st of list) {
    show(`verbinde ${st.name} …`);
    let ok = false;
    try { ok = Boolean(await st.run()); } catch { ok = false; }
    if (id !== runId) return;
    show(`${st.name} ${ok ? "ok" : "fehlgeschlagen"}`, ok);
    if (!ok) checkup.failed.push(st.name);
    await sleep(ok ? 350 : 900);
  }
  if (id !== runId) return;
  if (list.length && !checkup.failed.length) { show("Alle Verbindungen ok", true); await sleep(900); }
  if (id !== runId) return;
  Object.assign(checkup, { running: false, done: true });
  emit("checkup", checkup);
}

/** Beim Start und bei Verbindungsabbruch automatisch prüfen. */
export function initCheckup() {
  runCheckup();
  let was = state.connected;
  on("conn", () => {
    if (was && !state.connected && !checkup.running) runCheckup();
    if (!was && state.connected && checkup.failed.length && !checkup.running) runCheckup();
    was = state.connected;
  });
}

/** Für die Status-Karte: "wait" (Verbindet), "off" (Inaktiv) oder "ok" (Aktiv). */
export const statusKind = (vacation) => (checkup.running ? "wait" : vacation ? "off" : "ok");
/** Ist gerade etwas nicht erreichbar (nach dem letzten Check oder Zentrale getrennt)? */
export const connectionFailed = () => checkup.failed.length > 0 || (has.pi() && checkup.done && !state.connected);
