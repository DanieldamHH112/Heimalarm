// Divera 24/7 – alles mit dem persönlichen Accesskey (API-Doku: api.divera247.com).
//   GET  /api/v2/pull/all                     Einheit, Status-Listen, eigener Status
//   GET  /api/v2/alarms                       offene Alarme { items, sorting }
//   POST /api/v2/statusgeber/set-status       eigenen Status setzen { Status: { id, note, reset_date, reset_to } }
//   POST /api/v2/alarms/confirm/{id}          Rückmeldung zu einem Einsatz { Status: { id, note } }
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

/** Laufzeit-Zustand für die Oberfläche. */
export const divera = { ok: null, error: "", lastPoll: 0, current: null };

async function http(url, opts = {}) {
  const f = isTauri ? (await import("@tauri-apps/plugin-http")).fetch : fetch;
  return f(url, { ...opts, headers: { Accept: "application/json", ...(opts.body ? { "Content-Type": "application/json" } : {}) } });
}

async function api(path, body) {
  const key = settings().divera.key;
  if (!key) throw new Error("Kein Accesskey eingetragen");
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}accesskey=${encodeURIComponent(key)}`;
  const r = await http(url, body ? { method: "POST", body: JSON.stringify(body) } : { method: "GET" });
  if (r.status === 403 || r.status === 401) throw new Error("Accesskey ungültig");
  if (r.status === 404) throw new Error("Nicht gefunden oder keine Berechtigung");
  if (!r.ok) throw new Error(`Divera-Fehler ${r.status}`);
  const j = await r.json().catch(() => ({}));
  if (j.success === false) throw new Error(j.message || "Divera meldet einen Fehler");
  return j.data ?? j;
}

const saveSeen = () => { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200))); } catch { /* egal */ } };

/** Status-Liste in der gewünschten Reihenfolge (z. B. statussorting_statusgeber). */
function statusList(cluster, sortKey) {
  const raw = cluster.status || {};
  const order = cluster[sortKey]?.length ? cluster[sortKey] : cluster.statussorting || Object.keys(raw);
  return order.map((id) => raw[id]).filter(Boolean).map((s) => ({
    id: String(s.id), name: s.name || s.shortname || `Status ${s.id}`,
    color: s.color_hex ? `#${String(s.color_hex).replace("#", "")}` : "",
  }));
}

/** Verbindung prüfen und Einheit, Status-Listen und eigenen Status laden. */
export async function loadDivera() {
  const d = await api("/api/v2/pull/all");
  const c = d.cluster || {};
  set("divera.unit", c.name || c.shortname || "");
  set("divera.statuses", statusList(c, "statussorting_statusgeber"));
  set("divera.answers", statusList(c, "statussorting_alarm"));
  divera.current = d.status?.status_id != null ? String(d.status.status_id) : null;
  divera.ok = true; divera.error = "";
  emit("divera", divera);
  return { unit: c.name || "", statuses: settings().divera.statuses, answers: settings().divera.answers };
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
      const ts = (a.date || a.ts_create || 0) * 1000;
      if (primed && !a.closed && !a.deleted && Date.now() - ts < 15 * 60_000) fresh.push(a);
    }
    primed = true;
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

const nameOf = (list, id) => list.find((s) => s.id === String(id))?.name || `Status ${id}`;

/** Eigenen Status setzen, optional mit Rücksetzen nach X Minuten. */
export async function setDiveraStatus(id) {
  const d = settings().divera;
  if (!id || !d.key) return false;
  const Status = { id: Number(id) };
  if (d.note) Status.note = d.note;
  if (d.resetMin > 0 && d.resetTo) { Status.reset_date = Math.floor(Date.now() / 1000) + d.resetMin * 60; Status.reset_to = Number(d.resetTo); }
  try {
    await api("/api/v2/statusgeber/set-status", { Status });
    divera.current = String(id);
    log("action", `Divera-Status: ${nameOf(d.statuses, id)}`);
    emit("divera", divera);
    return true;
  } catch (e) { log("warn", "Divera-Status nicht gesetzt", e.message); return false; }
}

/** Rückmeldung zu einem Divera-Einsatz. */
export async function confirmDiveraAlarm(alarmId, statusId) {
  const d = settings().divera;
  if (!alarmId || !statusId || !d.key) return false;
  try {
    await api(`/api/v2/alarms/confirm/${encodeURIComponent(alarmId)}`, { Status: { id: Number(statusId), ...(d.note ? { note: d.note } : {}) } });
    log("action", `Divera-Rückmeldung: ${nameOf(d.answers, statusId)}`);
    return true;
  } catch (e) { log("warn", "Divera-Rückmeldung fehlgeschlagen", e.message); return false; }
}

/** Antwort auf „Fährst du?“ an Divera: Rückmeldung zum Einsatz (falls von Divera) und/oder Status. */
export async function answerDivera(going, alarm) {
  const d = settings().divera;
  if (!d.key) return false;
  const answer = going ? d.answerGo : d.answerStay;
  const status = going ? d.statusGo : d.statusStay;
  let ok = false;
  if (alarm?.diveraId && answer) ok = await confirmDiveraAlarm(alarm.diveraId, answer);
  if (status) ok = (await setDiveraStatus(status)) || ok;
  return ok;
}

/** Abfrage starten/stoppen je nach Einstellungen. */
export function restartDivera() {
  clearInterval(timer); timer = null;
  const d = settings().divera;
  const on = settings().alarm.apps?.divera?.on;
  if (!on || !d.poll || !d.key) { divera.ok = d.key ? divera.ok : null; return; }
  pollDivera();
  timer = setInterval(pollDivera, Math.max(10, Number(d.pollSec) || 20) * 1000);
}
