// E7 – Protokoll aller Ereignisse: wann was passiert, gemacht oder ausgeführt wurde.
import { emit } from "./events.js";

const KEY = "heimalarm.log.v1";
const MAX = 500;

/** Arten: alarm | action | ok | warn | info */
let entries = [];
try { entries = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch {}

/** Schlüssel aus Fehlermeldungen entfernen (Adressen enthalten z. B. ?accesskey=… oder ?authToken=…). */
const redact = (v) => String(v ?? "").replace(/((?:accesskey|authtoken|token|key|password|pass)=)[^&\s)"'<>]+/giu, "$1***");

export function log(kind, text, detail = "") {
  const entry = { ts: Date.now(), kind, text: redact(text), detail: redact(detail) };
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
