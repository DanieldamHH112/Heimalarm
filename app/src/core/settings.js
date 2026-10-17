// Lokale Einstellungen dieses Geräts, mit Standardwerten.
// Nummern verweisen auf die Funktionsliste im Konzept (docs/Konzept.pdf).
// Was für alle Geräte gleich sein soll, liegt in shared.js (über die Zentrale synchronisiert).
import { emit } from "./events.js";

const KEY = "heimalarm.settings.v1";

export const defaults = {
  // F1, F2, H1 – Verbindung zur Zentrale (Mosquitto über WebSocket)
  broker: { host: "", port: 9001, tls: false, user: "", pass: "" },
  // A – Alarmeingang
  alarm: {
    me: "ich",              // eigene Kennung, passend zum ESP32-Topic alarm/<kennung>
    mqtt: true,             // A1 – Alarm vom ESP32 über MQTT
    notifications: false,   // A1 – Alarm aus Benachrichtigungen (nur Android)
    lockoutSec: 60,         // A4 – Sperrzeit je Person
    offlineWarnSec: 120,    // A8 – Warnung, wenn ESP32 so lange offline ist
    heartbeatSec: 180,      // A9 – ohne Lebenszeichen so lange → Warnung
    minDurationMs: 50,      // A3 – Mindestdauer des Kontakts (wird an den ESP32 gesendet)
    testMode: false,        // A11 – alle Alarme nur als Test behandeln
    filterApps: "at.syPhone, com.alamos",       // A6 – Paketnamen (Teile reichen)
    filterWords: "ALARMIERUNG, Alarm, Einsatz", // A6 – Schlüsselwörter
  },
  // D – Windows-PC
  pc: {
    action: "hibernate",    // D1 – hibernate | sleep | lock | shutdown | mixed | none
    countdownSec: 30,       // D2
    onTimeout: "run",       // D3 – run | cancel
    autostart: true,        // D9
    title: "Fährst du?",    // D4 – Texte im Fenster
    goText: "Ich fahre",
    stayText: "Ich fahre nicht",
    sound: true,            // D5 – Ton während des Countdowns
    volume: 70,
    exceptions: "",         // D7 – kein Ruhezustand, wenn eines dieser Programme läuft (z. B. obs64.exe)
    stopMedia: true,        // D8 – Medienwiedergabe vorher stoppen
    quietFrom: "",          // D12 – Zeitfenster ohne Reaktion (leer = aus)
    quietTo: "",
    wolMac: "",             // D11 – MAC dieses PCs zum Aufwecken (wird angezeigt)
  },
  // E – dieses Gerät
  device: { id: "", name: "" },
  notify: { enabled: true },       // E1
  ui: { theme: "dark" },           // E5 – dark (Standard) | light
  // H4 – App-Sperre (lokal, SHA-256 der PIN)
  lock: { pinHash: "" },
  // Android: Hintergrund-Dienst für zuverlässigen Empfang
  android: { service: true },
  // Synchronisation der allgemeinen Einstellungen über die Zentrale
  sync: { enabled: true },
};

/** Diese Bereiche werden zwischen Handy und PC abgeglichen (pc.* nur zwischen PCs). */
export const SYNC_KEYS = ["alarm", "notify", "ui"];

function merge(base, over) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && base && k in base ? merge(base[k], v) : v;
  }
  return out;
}

function load() {
  try { return merge(defaults, JSON.parse(localStorage.getItem(KEY) || "{}")); }
  catch { return structuredClone(defaults); }
}

let current = load();
if (current.ui.theme !== "light") current.ui.theme = "dark";
if (!current.device.id) current.device.id = Math.random().toString(36).slice(2, 10);
save();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* Speicher voll/gesperrt */ }
}

export const settings = () => current;

/** Wert per Pfad lesen, z. B. get("pc.countdownSec"). */
export const get = (path) => path.split(".").reduce((o, k) => o?.[k], current);

/** Wert per Pfad setzen. `silent` = nicht an die Zentrale weitergeben (z. B. beim Empfang). */
export function set(path, value, { silent = false } = {}) {
  const keys = path.split(".");
  let obj = current;
  keys.slice(0, -1).forEach((k) => (obj = obj[k] ??= {}));
  if (obj[keys.at(-1)] === value) return;
  obj[keys.at(-1)] = value;
  save();
  emit("settings", { path, value, silent });
}

/** Ganze Bereiche übernehmen (Sync, Backup-Import). */
export function replace(section, value, { silent = true } = {}) {
  current[section] = merge(defaults[section] ?? {}, value);
  save();
  emit("settings", { path: section, value, silent });
}

export const isConfigured = () => Boolean(current.broker.host);
