// Gemeinsame Konfiguration für alle Geräte – liegt retained auf der Zentrale:
//   heimalarm/config/shared   { persons, routines, location, vacation, lockoutSec, webhookSecret, adminPinHash, common }
// Der Zentralen-Dienst liest dieselben Daten und führt die Routinen aus.
// `common` enthält die synchronisierten allgemeinen Einstellungen (SYNC_KEYS) für Handy und PC.
import { emit, on } from "./events.js";
import { settings, replace, SYNC_KEYS, mode } from "./settings.js";

const TOPIC = "heimalarm/config/shared";

export const sharedDefaults = {
  persons: [{ id: "ich", name: "Ich" }],          // G1
  routines: [],                                   // B
  location: { lat: 53.55, lon: 9.99 },            // F6 – für Sonnenauf-/-untergang
  vacation: false,                                // B9
  lockoutSec: 60,                                 // A4 (Zentrale)
  webhookSecret: "",                              // H2
  adminPinHash: "",                               // G3
  common: null,                                   // synchronisierte Einstellungen
  wifi: [],                                       // WLAN-Geräte [{ id, name, type, host, user, target }]
  voicemonkey: { token: "" },                     // Alexa-Routinen über Voice Monkey (Cloud)
};

// Ohne Zentrale liegen die gemeinsamen Daten (Routinen, Geräte, Personen) auf diesem Gerät.
const LOCAL_KEY = "heimalarm.shared.local";
const loadLocal = () => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "null"); } catch { return null; } };
const saveLocal = (d) => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(d)); } catch { /* voll */ } };

let data = { ...structuredClone(sharedDefaults), ...loadLocal() };
let loaded = false;
let publishFn = null;

export const shared = () => data;
export const sharedLoaded = () => loaded;

/** Wird von mqtt.js beim Verbinden gesetzt. */
export function bindPublisher(fn) { publishFn = fn; }

export function receive(msg) {
  try { data = { ...structuredClone(sharedDefaults), ...JSON.parse(msg || "{}") }; } catch { return; }
  loaded = true;
  saveLocal(data);
  // Allgemeine Einstellungen von anderen Geräten übernehmen
  if (settings().sync.enabled && data.common) {
    for (const k of SYNC_KEYS) {
      if (!data.common[k]) continue;
      // Die Kennung bleibt je Gerät (mehrere Personen können eine Zentrale teilen)
      const incoming = k === "alarm" ? { ...data.common[k], me: settings().alarm.me } : data.common[k];
      if (JSON.stringify(incoming) !== JSON.stringify(settings()[k])) replace(k, incoming);
    }
  }
  emit("shared", data);
}

/** Änderung speichern und an alle Geräte verteilen. */
export function updateShared(patch) {
  data = { ...data, ...patch };
  saveLocal(data);
  if (mode() === "zentrale") publishFn?.(TOPIC, JSON.stringify(data), { retain: true, qos: 1 });
  emit("shared", data);
}

// Lokale Änderungen an allgemeinen Einstellungen weitergeben
on("settings", ({ path, silent }) => {
  if (silent || !settings().sync.enabled || !loaded) return;
  if (!SYNC_KEYS.includes(path.split(".")[0])) return;
  const common = {};
  for (const k of SYNC_KEYS) common[k] = settings()[k];
  updateShared({ common });
});

export const newId = () => Math.random().toString(36).slice(2, 9);

export async function sha256(text) {
  if (!globalThis.crypto?.subtle) {
    // Fallback ohne sicheren Kontext (sollte in der App nicht vorkommen)
    let x = 2166136261;
    for (const c of text) x = Math.imul(x ^ c.codePointAt(0), 16777619) >>> 0;
    return "fnv" + x.toString(16);
  }
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
