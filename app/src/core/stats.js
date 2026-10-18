// Einsatz-Statistik: eigene echte Alarme (keine Tests) mit Quelle, Stichwort und Antwort.
// Liegt nur auf diesem Gerät (localStorage), höchstens 1000 Einträge.
import { getLog } from "./log.js";

const KEY = "heimalarm.stats.v1";
const MAX = 1000;
const ANSWER_WINDOW = 2 * 3600e3;   // Antwort zählt nur für einen Alarm der letzten 2 Stunden

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (Array.isArray(v)) return v;
  } catch { /* leer */ }
  // Erster Start: frühere eigene Alarme aus dem Protokoll übernehmen
  return getLog("alarm")
    .filter((e) => e.text === "Alarm")
    .map((e) => ({ ts: e.ts, source: String(e.detail || "").split(" · ")[0] || "", keyword: "", answer: null }))
    .toSorted((a, b) => a.ts - b.ts);
}
let list = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch { /* voll */ } };
save();

export const statsEntries = () => list;

export function recordAlarm({ ts, source, keyword }) {
  list.push({ ts: ts || Date.now(), source: source || "", keyword: keyword || "", answer: null });
  if (list.length > MAX) list = list.slice(-MAX);
  save();
}

/** going: true | false, timeout: keine Antwort am PC */
export function recordAnswer(going, { timeout = false } = {}) {
  const last = list.at(-1);
  if (!last || last.answer || Date.now() - last.ts > ANSWER_WINDOW) return;
  last.answer = timeout ? "timeout" : going ? "go" : "stay";
  save();
}

export function clearStats() { list = []; save(); }

/** Kennzahlen für die Ansicht. */
export function summary(now = Date.now()) {
  const d = new Date(now);
  const year = list.filter((e) => new Date(e.ts).getFullYear() === d.getFullYear());
  const last30 = list.filter((e) => now - e.ts < 30 * 86400e3);
  const answered = list.filter((e) => e.answer === "go" || e.answer === "stay");
  const night = list.filter((e) => { const h = new Date(e.ts).getHours(); return h >= 22 || h < 6; });
  const sources = {};
  for (const e of list) if (e.source) sources[e.source] = (sources[e.source] || 0) + 1;
  // Letzte 12 Monate, ältester zuerst
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = new Date(d.getFullYear(), d.getMonth() - 11 + i, 1);
    return {
      label: m.toLocaleDateString("de-DE", { month: "short" }).replace(".", ""),
      count: list.filter((e) => { const t = new Date(e.ts); return t.getFullYear() === m.getFullYear() && t.getMonth() === m.getMonth(); }).length,
    };
  });
  return {
    total: list.length, year: year.length, last30: last30.length,
    goRate: answered.length ? Math.round((answered.filter((e) => e.answer === "go").length / answered.length) * 100) : null,
    answered: answered.length, night: night.length,
    sources: Object.entries(sources).toSorted((a, b) => b[1] - a[1]),
    months,
  };
}
