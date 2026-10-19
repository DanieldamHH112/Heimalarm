// Bereitschaft: verfügbar, nicht verfügbar (bis Uhrzeit) oder abwesend (bis Datum).
// Liegt in den gemeinsamen Daten (shared.readiness), damit alle Geräte und der Dienst dasselbe sehen.
// `vacation` bleibt als Ja/Nein daneben stehen: engine.js, rules.js, Discord und Routinen lesen nur das.
import { shared, updateShared } from "./shared.js";
import { log } from "./log.js";

export const MODES = {
  ready: { label: "Verfügbar", hint: "Bei Alarm läuft alles: Abfrage, Ton, Routinen." },
  away: { label: "Nicht verfügbar", hint: "Keine Abfrage, kein Ton, Routinen pausiert (außer „Nur per Knopf“)." },
  absent: { label: "Abwesend", hint: "Keine Abfrage, kein Ton, Routinen pausiert (außer „Nur per Knopf“)." },
};

/** Aktueller Zustand; abgelaufene Zeiten zählen schon als „verfügbar“. */
export function readiness() {
  const r = shared().readiness;
  if (r?.mode && r.mode !== "ready") {
    if (r.until && r.until <= Date.now()) return { mode: "ready", until: null };
    return { mode: MODES[r.mode] ? r.mode : "absent", until: r.until || null };
  }
  return shared().vacation ? { mode: "absent", until: null } : { mode: "ready", until: null };
}

export function setReadiness(mode, until = null) {
  updateShared({ readiness: { mode, until: mode === "ready" ? null : until }, vacation: mode !== "ready" });
}

const sameDay = (a, b) => a.toDateString() === b.toDateString();
/** „bis 18:00“, „bis morgen 07:00“, „bis Sa., 24.10.“ */
export function untilText(until) {
  if (!until) return "";
  const d = new Date(until), now = new Date(), tomorrow = new Date(now.getTime() + 86400e3);
  const t = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (sameDay(d, now)) return `bis ${t}`;
  if (sameDay(d, tomorrow)) return `bis morgen ${t}`;
  const day = d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
  return d.getHours() === 23 && d.getMinutes() === 59 ? `bis ${day}` : `bis ${day}, ${t}`;
}

/** Läuft die Zeit ab, wieder auf „verfügbar“ schalten (auch ohne Zentrale). */
export function initReadiness() {
  setInterval(() => {
    const r = shared().readiness;
    if (r?.mode && r.mode !== "ready" && r.until && r.until <= Date.now()) {
      setReadiness("ready");
      log("info", "Wieder verfügbar", "Zeit für „" + (MODES[r.mode]?.label || r.mode) + "“ abgelaufen");
    }
  }, 30e3);
}
