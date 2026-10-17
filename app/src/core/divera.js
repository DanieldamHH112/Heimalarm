// Divera 24/7 – Alarme abfragen und Status setzen, mit dem persönlichen Accesskey.
// Endpunkte (help.divera247.com):
//   GET  /api/v2/alarms?accesskey=…               nicht archivierte Alarme { items, sorting }
//   GET  /api/v2/pull/all?accesskey=…             Einheit, Status-Liste u. a.
//   GET  /statusgeber.html?status=<id>&accesskey=…  eigenen Status setzen
// In der App läuft der Abruf über das Tauri-HTTP-Plugin (kein CORS-Problem).
import { settings, set } from "./settings.js";
import { log } from "./log.js";
import { emit } from "./events.js";
import { isTauri } from "./platform.js";

const BASE = "https://app.divera247.com";
const SEEN_KEY = "heimalarm.divera.seen";
let timer = null;
let seen = new Set();
try { seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch { /* leer */ }
let primed = seen.size > 0;

export const divera = { ok: null, error: "", lastPoll: 0 };

async function http(url) {
  const f = isTauri ? (await import("@tauri-apps/plugin-http")).fetch : fetch;
  return f(url, { method: "GET", headers: { Accept: "application/json" } });
}

async function api(path) {
  const key = settings().divera.key;
  if (!key) throw new Error("Kein Accesskey eingetragen");
  const r = await http(`${BASE}${path}${path.includes("?") ? "&" : "?"}accesskey=${encodeURIComponent(key)}`);
  if (r.status === 401 || r.status === 403) throw new Error("Accesskey ungültig oder ohne Berechtigung");
  if (!r.ok) throw new Error(`Divera antwortet mit Fehler ${r.status}`);
  const j = await r.json();
  if (j.success === false) throw new Error(j.message || "Divera meldet einen Fehler");
  return j.data ?? j;
}

const saveSeen = () => { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200))); } catch { /* egal */ } };

/** Verbindung prüfen: Einheit und Status-Liste laden. */
export async function testDivera() {
  const d = await api("/api/v2/pull/all");
  const c = d.cluster || {};
  const raw = c.status || {};
  const order = c.statussorting || Object.keys(raw);
  const statuses = order.map((id) => raw[id]).filter(Boolean).map((s) => ({ id: String(s.id), name: s.name, color: s.color_hex ? `#${s.color_hex}` : "" }));
  set("divera.unit", c.name || "");
  set("divera.statuses", statuses);
  divera.ok = true; divera.error = "";
  return { unit: c.name || "", statuses };
}

/** Neue Alarme seit der letzten Abfrage. Beim ersten Abruf wird nur gemerkt, nichts ausgelöst. */
export async function pollDivera() {
  try {
    const d = await api("/api/v2/alarms");
    const items = d.items || {};
    const ids = (d.sorting || Object.keys(items)).map(String);
    const fresh = [];
    for (const id of ids) {
      const a = items[id];
      if (!a || seen.has(id)) continue;
      seen.add(id);
      // Nur offene, aktuelle Alarme (max. 15 min alt) – ältere nur merken
      const ts = (a.date || a.ts_create || 0) * 1000;
      if (primed && !a.closed && !a.deleted && Date.now() - ts < 15 * 60_000) fresh.push(a);
    }
    if (!primed) primed = true;
    saveSeen();
    divera.ok = true; divera.error = ""; divera.lastPoll = Date.now();
    for (const a of fresh) {
      emit("divera-alarm", {
        source: "Divera", keyword: String(a.title || "Alarm").slice(0, 80),
        text: String(a.text || "").slice(0, 250), address: a.address || "", diveraId: a.id,
      });
    }
  } catch (e) {
    if (divera.error !== e.message) log("warn", "Divera-Abfrage fehlgeschlagen", e.message);
    divera.ok = false; divera.error = e.message;
  }
  emit("divera", divera);
}

/** Eigenen Status in Divera setzen (z. B. nach „Ich fahre“). */
export async function setDiveraStatus(id) {
  if (!id || !settings().divera.key) return false;
  const name = settings().divera.statuses.find((s) => s.id === String(id))?.name || id;
  try {
    const r = await http(`https://www.divera247.com/statusgeber.html?status=${encodeURIComponent(id)}&accesskey=${encodeURIComponent(settings().divera.key)}`);
    if (!r.ok) throw new Error(`Fehler ${r.status}`);
    log("action", `Divera-Status gesetzt: ${name}`);
    return true;
  } catch (e) {
    log("warn", "Divera-Status nicht gesetzt", e.message);
    return false;
  }
}

/** Abfrage starten/stoppen je nach Einstellungen. */
export function restartDivera() {
  clearInterval(timer); timer = null;
  const d = settings().divera;
  if (!d.poll || !d.key) { divera.ok = null; return; }
  pollDivera();
  timer = setInterval(pollDivera, Math.max(10, Number(d.pollSec) || 20) * 1000);
}
