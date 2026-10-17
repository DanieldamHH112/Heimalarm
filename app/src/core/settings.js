// Lokale Einstellungen dieses Geräts, mit Standardwerten.
// Nummern verweisen auf die Funktionsliste im Konzept (docs/Konzept.pdf).
// Was für alle Geräte gleich sein soll, liegt in shared.js (über die Zentrale synchronisiert).
import { emit } from "./events.js";

const KEY = "heimalarm.settings.v1";

export const defaults = {
  // Betrieb: "zentrale" (Raspberry Pi) oder "direkt" (Handy und PC ohne Pi)
  mode: "",               // leer = automatisch: mit eingetragener Zentrale → "zentrale"
  // Direktverbindung ohne Zentrale: PC empfängt, Handy sendet
  direct: {
    port: 8765,
    code: "",             // PC: Kopplungscode (wird erzeugt)
    peers: [],            // Handy: gekoppelte PCs [{ id, name, host, port, code }]
    routines: null,       // Routinen auf diesem Gerät ausführen (null = automatisch: nur Handy)
  },
  // F1, F2, H1 – Verbindung zur Zentrale (Mosquitto über WebSocket)
  broker: { host: "", port: 9001, tls: false, user: "", pass: "" },
  // A – Alarmeingang
  alarm: {
    me: "ich",              // eigene Kennung, passend zum ESP32-Topic alarm/<kennung>
    mqtt: true,             // A1 – Alarm vom ESP32 über MQTT
    notifications: false,   // (alt) – ersetzt durch alarm.apps
    lockoutSec: 60,         // A4 – Sperrzeit je Person
    offlineWarnSec: 120,    // A8 – Warnung, wenn ESP32 so lange offline ist
    heartbeatSec: 180,      // A9 – ohne Lebenszeichen so lange → Warnung
    minDurationMs: 50,      // A3 – Mindestdauer des Kontakts (wird an den ESP32 gesendet)
    testMode: false,        // A11 – alle Alarme nur als Test behandeln
    // A1/A6 – Alarm-Apps auf dem Handy: Benachrichtigung mitlesen (nur Android). Mehrere gleichzeitig möglich.
    apps: {
      sybos:  { on: false, pkg: "at.syPhone" },
      apager: { on: false, pkg: "org.xcrypt.apager.android2" },
      divera: { on: false, pkg: "" },     // Paketname über „Erkennen“ ermitteln
    },
    filterApps: "",                             // weitere Apps (Paketnamen, Teile reichen)
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
  // Divera 24/7 – persönlicher Zugang. Bleibt auf diesem Gerät (wird nicht abgeglichen).
  divera: {
    key: "",                // persönlicher Accesskey (Divera → Profil → Login → API-Schlüssel)
    poll: false,            // Alarme direkt bei Divera abfragen
    pollSec: 20,
    answerGo: "",           // Rückmeldung zum Divera-Einsatz bei „Ich fahre“ (Status-ID)
    answerStay: "",         // … bei „Ich fahre nicht“
    statusGo: "",           // eigener Status bei „Ich fahre“ (leer = nichts setzen)
    statusStay: "",         // … bei „Ich fahre nicht“
    note: "",               // Freitext zur Rückmeldung (z. B. „per Heimalarm“)
    resetMin: 0,            // Status nach X Minuten zurücksetzen (0 = aus)
    resetTo: "",            // … auf diesen Status
    unit: "",               // Name der Einheit (nur Anzeige)
    statuses: [],           // Statusgeber-Liste [{ id, name, color }]
    answers: [],            // Rückmelde-Status für Einsätze
  },
  // aPager PRO – Rückmeldung per API (Smart-Home-Abo nötig). Bleibt auf diesem Gerät.
  apager: { key: "", feedback: true, silent: false },
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
// Alte Standardwerte (vor den Alarm-Apps) übernehmen
if (/^\s*at\.syPhone,\s*com\.alamos\s*$/u.test(current.alarm.filterApps)) {
  current.alarm.filterApps = "";
  if (current.alarm.notifications) { current.alarm.apps.sybos.on = true; current.alarm.apps.apager.on = true; }
}
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

/** Betriebsart: mit Zentrale (Pi) oder direkt zwischen Handy und PC. */
export const mode = () => current.mode || (current.broker.host ? "zentrale" : "direkt");
export const isConfigured = () => mode() === "zentrale" && Boolean(current.broker.host);
