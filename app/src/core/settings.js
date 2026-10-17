// Einstellungen: lokal gespeichert, mit Standardwerten. Nummern verweisen auf die Funktionsliste im Konzept.
import { emit } from "./events.js";

const KEY = "heimalarm.settings.v1";

export const defaults = {
  // F1, F2 – Verbindung zur Zentrale (Mosquitto über WebSocket)
  broker: { host: "", port: 9001, tls: false, user: "", pass: "" },
  // A1, A4 – Alarmquellen
  alarm: {
    me: "ich",            // eigene Kennung, passend zum ESP32-Topic alarm/<kennung>
    mqtt: true,           // Alarm vom ESP32 über MQTT
    lockoutSec: 60,       // Sperrzeit nach einem Alarm
    offlineWarnSec: 120,  // A8 – Warnung, wenn ESP32 so lange offline ist
  },
  // D1–D3, D9 – PC
  pc: {
    action: "hibernate",  // hibernate | sleep | lock | shutdown | mixed | none
    countdownSec: 30,
    onTimeout: "run",     // run | cancel
    autostart: true,
  },
  // E3 – dieses Gerät in der Übersicht der anderen
  device: { id: "", name: "" },
  // E1 – Benachrichtigung bei Alarm (Handy, und bei fremden Alarmen am PC)
  notify: { enabled: true },
  // E5 – Darstellung
  ui: { theme: "system" }, // system | light | dark
};

function merge(base, over) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && k in base ? merge(base[k], v) : v;
  }
  return out;
}

let current = load();
if (!current.device.id) {
  current.device.id = Math.random().toString(36).slice(2, 10);
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch {}
}

function load() {
  try { return merge(defaults, JSON.parse(localStorage.getItem(KEY) || "{}")); }
  catch { return structuredClone(defaults); }
}

export const settings = () => current;

/** Ändert einen Wert per Pfad, z. B. set("pc.countdownSec", 45). */
export function set(path, value) {
  const keys = path.split(".");
  let obj = current;
  keys.slice(0, -1).forEach((k) => (obj = obj[k]));
  obj[keys.at(-1)] = value;
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch {}
  emit("settings", { path, value });
}

export const isConfigured = () => Boolean(current.broker.host);
