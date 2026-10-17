// Ohne Zentrale: Handy und PC direkt im Heimnetz.
//   PC:    nimmt Alarme an (Rust-Empfänger, Port 8765, Kopplungscode).
//   Handy: schickt jeden erkannten Alarm an alle gekoppelten PCs.
import { settings, set, mode } from "./settings.js";
import { log } from "./log.js";
import { emit } from "./events.js";
import { isTauri, hasPcFeatures } from "./platform.js";

export const direct = { ip: "", error: "", peers: {} };   // peers: id -> { ok, at }

const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => String(b % 100).padStart(2, "0")).join("");
async function http() { return isTauri ? (await import("@tauri-apps/plugin-http")).fetch : fetch; }

/** PC: Empfänger starten. */
export async function startReceiver() {
  if (!hasPcFeatures || !isTauri || mode() !== "direkt") return;
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
