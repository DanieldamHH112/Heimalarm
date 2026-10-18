// Ohne Zentrale: Handy und PC direkt im Heimnetz.
//   PC:    nimmt Alarme an (Rust-Empfänger, Port 8765, Kopplungscode).
//   Handy: schickt jeden erkannten Alarm an alle gekoppelten PCs.
import { settings, set, replace, mode, SYNC_KEYS } from "./settings.js";
import { log } from "./log.js";
import { emit, on } from "./events.js";
import { isTauri, hasPcFeatures } from "./platform.js";

export const direct = { ip: "", error: "", peers: {} };   // peers: id -> { ok, at }

const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => String(b % 100).padStart(2, "0")).join("");
async function http() { return isTauri ? (await import("@tauri-apps/plugin-http")).fetch : fetch; }

/** PC: Empfänger starten – in beiden Betriebsarten, damit das Handy Einstellungen schicken kann. */
export async function startReceiver() {
  if (!hasPcFeatures || !isTauri) return;
  if (!settings().direct.code) set("direct.code", newCode());
  try {
    const core = await import("@tauri-apps/api/core");
    direct.ip = await core.invoke("direct_server", { port: settings().direct.port, code: settings().direct.code });
    direct.error = "";
    const { listen } = await import("@tauri-apps/api/event");
    if (!direct.listening) {
      direct.listening = true;
      await listen("direct-alarm", (e) => {
        try { emit("alarm-in", { who: settings().alarm.me, ts: Date.now(), ...JSON.parse(e.payload), viaPhone: true }); }
        catch { log("warn", "Alarm vom Handy nicht lesbar"); }
      });
      await listen("direct-config", (e) => {
        try { applyConfig(JSON.parse(e.payload)); }
        catch { log("warn", "Einstellungen vom Handy nicht lesbar"); }
      });
    }
  } catch (e) { direct.error = String(e); log("warn", "Empfang für das Handy nicht gestartet", direct.error); }
  emit("direct", direct);
}

/** PC: neuen Kopplungscode erzeugen (alte Handys müssen neu koppeln). */
export async function renewCode() { set("direct.code", newCode()); await startReceiver(); }

async function call(peer, path, body) {
  const f = await http();
  const r = await f(`http://${peer.host}:${peer.port || 8765}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "X-Heimalarm-Key": peer.code, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    connectTimeout: 4000,
  });
  if (r.status === 403) throw new Error("Code falsch");
  if (!r.ok) throw new Error(`Fehler ${r.status}`);
  return r.json();
}

/** Handy: PC prüfen. */
export async function pingPeer(peer) {
  try { await call(peer, "/ping"); direct.peers[peer.id] = { ok: true, at: Date.now() }; return true; }
  catch (e) { direct.peers[peer.id] = { ok: false, error: e.message.includes("Code") ? e.message : "nicht erreichbar", at: Date.now() }; return false; }
  finally { emit("direct", direct); }
}

/** Handy: Alarm an alle gekoppelten PCs. */
export async function sendToPeers(data) {
  const peers = settings().direct.peers || [];
  await Promise.all(peers.map(async (p) => {
    try { await call(p, "/alarm", data); log("action", `Alarm an „${p.name}“ gesendet`); }
    catch (e) { log("warn", `„${p.name}“ nicht erreicht`, e.message); }
  }));
}

export const addPeer = (peer) => set("direct.peers", [...(settings().direct.peers || []), { id: Math.random().toString(36).slice(2, 8), port: 8765, ...peer }]);
export const removePeer = (id) => set("direct.peers", settings().direct.peers.filter((p) => p.id !== id));

// ── Einstellungen abgleichen (Handy → gekoppelte PCs) ─────────────────────────
// Betriebsart, Zentrale-Adresse und die allgemeinen Einstellungen (SYNC_KEYS).
// Das Handy schickt sie bei jeder Änderung und beim Start; die Kennung bleibt je Gerät.
const SYNC_ROOTS = ["mode", "broker", ...SYNC_KEYS];

function configPayload() {
  const s = settings();
  return { mode: mode(), broker: s.broker, common: Object.fromEntries(SYNC_KEYS.map((k) => [k, s[k]])) };
}

/** PC: Einstellungen vom Handy übernehmen. */
function applyConfig(cfg) {
  if (!cfg || typeof cfg !== "object" || settings().sync?.enabled === false) return;
  for (const k of SYNC_KEYS) {
    if (!cfg.common?.[k]) continue;
    replace(k, k === "alarm" ? { ...cfg.common[k], me: settings().alarm.me } : cfg.common[k]);
  }
  const before = JSON.stringify([mode(), settings().broker]);
  if (cfg.broker) replace("broker", cfg.broker);
  if (cfg.mode === "zentrale" || cfg.mode === "direkt") set("mode", cfg.mode, { silent: true });
  if (JSON.stringify([mode(), settings().broker]) !== before) {
    log("info", `Betriebsart vom Handy übernommen: ${mode() === "zentrale" ? "Mit Zentrale" : "Ohne Zentrale"}`);
    emit("direct-config", cfg);   // main.js verbindet neu und zeichnet die Ansicht neu
  }
}

let pushTimer;
/** Handy: Einstellungen an alle gekoppelten PCs schicken. */
export function pushConfig() {
  if (hasPcFeatures || settings().sync?.enabled === false) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => {
    const body = configPayload();
    await Promise.all((settings().direct.peers || []).map((p) => call(p, "/config", body).catch(() => { /* PC aus – beim nächsten Start */ })));
  }, 800);
}

on("settings", ({ path, silent }) => {
  if (silent || hasPcFeatures) return;
  if (SYNC_ROOTS.includes(String(path).split(".")[0])) pushConfig();
});
