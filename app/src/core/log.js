// E7 – Protokoll aller Ereignisse: wann was passiert, gemacht oder ausgeführt wurde.
import { emit } from "./events.js";

const KEY = "heimalarm.log.v1";
const MAX = 500;

/** Arten: alarm | action | ok | warn | info */
let entries = [];
try { entries = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch {}

export function log(kind, text, detail = "") {
  const entry = { ts: Date.now(), kind, text, detail };
  entries.unshift(entry);
  entries.length = Math.min(entries.length, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch {}
  emit("log", entry);
  return entry;
}

export const getLog = (kind) => (kind ? entries.filter((e) => e.kind === kind) : entries);

export function clearLog() {
  entries = [];
  try { localStorage.removeItem(KEY); } catch {}
  emit("log", null);
}
