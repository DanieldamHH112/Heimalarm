// Ohne Zentrale: Handy und PC direkt im Heimnetz.
//   PC:    nimmt Alarme und Einstellungen an (Rust-Empfänger, Port 8765).
//          Neue Handys koppeln mit dem Kopplungscode und bekommen einen eigenen Code –
//          so lässt sich jedes Handy einzeln entkoppeln.
//   Handy: schickt jeden erkannten Alarm an alle gekoppelten PCs und gleicht die
//          Einstellungen in beide Richtungen ab (holt ab, schickt zurück – core/sync.js).
import { settings, set } from "./settings.js";
import { log } from "./log.js";
import { emit, on } from "./events.js";
import { isTauri, hasPcFeatures, platformName } from "./platform.js";
import { bundle, applyBundle, syncEnabled, SYNC_LABELS } from "./sync.js";

export const direct = { ip: "", error: "", peers: {}, lastSync: 0 };   // peers: id -> { ok, error, at }

const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => String(b % 100).padStart(2, "0")).join("");
async function http() { return isTauri ? (await import("@tauri-apps/plugin-http")).fetch : fetch; }
async function invoke(cmd, args) { return (await import("@tauri-apps/api/core")).invoke(cmd, args); }
const deviceName = () => settings().device.name || platformName;

// ── PC ─────────────────────────────────────────────────────────────────────

/** PC: Empfänger starten bzw. Codes aktualisieren – in beiden Betriebsarten (für den Abgleich). */
export async function startReceiver() {
  if (!hasPcFeatures || !isTauri) return;
  if (!settings().direct.code) set("direct.code", newCode());
  const d = settings().direct;
  try {
    direct.ip = await invoke("direct_server", {
      port: d.port, code: d.code, phones: (d.phones || []).map((p) => p.code), name: deviceName(),
    });
    direct.error = "";
    await publishConfig();
    if (!direct.listening) {
      direct.listening = true;
      const { listen } = await import("@tauri-apps/api/event");
      await listen("direct-alarm", (e) => {
        try { emit("alarm-in", { who: settings().alarm.me, ts: Date.now(), ...JSON.parse(e.payload), viaPhone: true }); }
        catch { log("warn", "Alarm vom Handy nicht lesbar"); }
      });
      await listen("direct-config", (e) => {
        try { applyBundle(JSON.parse(e.payload)); }
        catch { log("warn", "Einstellungen vom Handy nicht lesbar"); }
      });
      await listen("direct-pair", (e) => {
        try {
          const { code, info } = JSON.parse(e.payload);
          // Dasselbe Handy erneut gekoppelt → alten Eintrag (und damit den alten Code) ersetzen
          const phones = (settings().direct.phones || []).filter((p) => !(info.id && p.id === info.id));
          set("direct.phones", [...phones, { id: info.id || Math.random().toString(36).slice(2, 8), name: info.name || "Handy", code, pairedAt: Date.now(), lastSeen: Date.now() }]);
          log("ok", `Handy „${info.name || "Handy"}“ gekoppelt`);
          startReceiver();
        } catch { log("warn", "Kopplung nicht lesbar"); }
      });
      await listen("direct-seen", (e) => {
        const phones = settings().direct.phones || [];
        const p = phones.find((x) => x.code === e.payload);
        if (p && Date.now() - (p.lastSeen || 0) > 60e3) {
          set("direct.phones", phones.map((x) => (x === p ? { ...x, lastSeen: Date.now() } : x)), { silent: true });
          emit("direct", direct);
        }
      });
    }
  } catch (e) { direct.error = String(e); log("warn", "Empfang für das Handy nicht gestartet", direct.error); }
  emit("direct", direct);
}

/** PC: aktuellen Stand für GET /config hinterlegen. */
async function publishConfig() {
  if (!hasPcFeatures || !isTauri) return;
  try { await invoke("direct_set_config", { json: JSON.stringify(syncEnabled() ? bundle() : {}) }); } catch { /* nicht verfügbar */ }
}

/** PC: neuen Kopplungscode erzeugen. Bereits gekoppelte Handys bleiben gekoppelt. */
export async function renewCode() { set("direct.code", newCode()); await startReceiver(); }

/** PC: ein Handy entkoppeln – sein Code gilt danach nicht mehr. */
export async function unpairPhone(id) {
  const p = (settings().direct.phones || []).find((x) => x.id === id);
  set("direct.phones", (settings().direct.phones || []).filter((x) => x.id !== id));
  await startReceiver();
  if (p) log("info", `Handy „${p.name}“ entkoppelt`);
}
export const renamePhone = (id, name) => set("direct.phones", (settings().direct.phones || []).map((x) => (x.id === id ? { ...x, name } : x)));

// ── Handy ──────────────────────────────────────────────────────────────────

async function call(peer, path, body) {
  const f = await http();
  const r = await f(`http://${peer.host}:${peer.port || 8765}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "X-Heimalarm-Key": peer.code, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    connectTimeout: 4000,
  });
  if (r.status === 403) throw new Error(peer.paired ? "Vom PC entkoppelt – neu koppeln" : "Code falsch");
  if (!r.ok) throw new Error(`Fehler ${r.status}`);
  return r.json();
}

const findPeer = (id) => (settings().direct.peers || []).find((p) => p.id === id);
const updatePeer = (id, patch) => set("direct.peers", (settings().direct.peers || []).map((p) => (p.id === id ? { ...p, ...patch } : p)));

/** Handy: mit dem Kopplungscode des PCs einen eigenen Code holen. */
async function pair(peer) {
  const r = await call({ ...peer, paired: false }, "/pair", { id: settings().device.id, name: deviceName() });
  if (!r.code) throw new Error("PC zu alt – dort Heimalarm aktualisieren");
  updatePeer(peer.id, { code: r.code, paired: true, name: peer.nameSet ? peer.name : (r.name || peer.name) });
  return findPeer(peer.id);
}

/** Handy: PC prüfen. Koppelt bei Bedarf (neuer PC, Update von einer älteren Version). */
export async function pingPeer(peer) {
  try {
    const p = peer.paired ? peer : await pair(peer);
    const r = await call(p, "/ping");
    if (!r.paired) throw new Error("Vom PC entkoppelt – neu koppeln");
    direct.peers[p.id] = { ok: true, at: Date.now() };
    return true;
  } catch (e) {
    const msg = String(e?.message || e);
    direct.peers[peer.id] = { ok: false, error: /koppeln|Code|zu alt/u.test(msg) ? msg : "nicht erreichbar", at: Date.now() };
    return false;
  } finally { emit("direct", direct); }
}

/** Handy: Alarm an alle gekoppelten PCs – oder nur an einen (Testalarm an ein Gerät). */
export async function sendToPeers(data, onlyId) {
  const peers = (settings().direct.peers || []).filter((p) => !onlyId || p.id === onlyId);
  const res = await Promise.all(peers.map(async (p) => {
    try { await call(p, "/alarm", data); log("action", `${data.test ? "Testalarm" : "Alarm"} an „${p.name}“ gesendet`); return true; }
    catch (e) { log("warn", `„${p.name}“ nicht erreicht`, e.message); return false; }
  }));
  return res.some(Boolean);
}

/** Handy: neuen PC koppeln. */
export async function addPeer({ host, port, code, name }) {
  const peer = { id: Math.random().toString(36).slice(2, 8), host, port: port || 8765, code, name: name || host, nameSet: Boolean(name), paired: false };
  set("direct.peers", [...(settings().direct.peers || []), peer]);
  const ok = await pingPeer(peer);
  if (ok) syncPeers();
  return ok;
}

/** Handy: PC bearbeiten. Mit neuem Kopplungscode wird neu gekoppelt. */
export async function editPeer(id, { name, host, port, code }) {
  const old = findPeer(id);
  if (!old) return false;
  const patch = { name: name || old.name, nameSet: Boolean(name) || old.nameSet, host: host || old.host, port: Number(port) || old.port };
  if (code) Object.assign(patch, { code, paired: false });
  updatePeer(id, patch);
  const ok = await pingPeer(findPeer(id));
  if (ok) syncPeers();
  return ok;
}

export const removePeer = (id) => set("direct.peers", (settings().direct.peers || []).filter((p) => p.id !== id));

/** Handy: Einstellungen mit allen gekoppelten PCs abgleichen (abholen → zusammenführen → zurückschicken). */
export async function syncPeers() {
  if (hasPcFeatures || !syncEnabled()) return;
  const peers = (settings().direct.peers || []).filter((p) => p.paired);
  if (!peers.length) return;
  const got = [];
  for (const p of peers) {
    try { got.push(...applyBundle(await call(p, "/config"))); } catch { /* PC aus – nächster Versuch später */ }
  }
  if (got.length) log("info", "Einstellungen vom PC übernommen", [...new Set(got)].map((s) => SYNC_LABELS[s]).join(", "));
  const body = bundle();
  await Promise.all(peers.map((p) => call(p, "/config", body).catch(() => { /* PC aus */ })));
  direct.lastSync = Date.now();
  emit("direct", direct);
}

// ── Ablauf ─────────────────────────────────────────────────────────────────

let timer;
on("sync-dirty", () => { clearTimeout(timer); timer = setTimeout(() => (hasPcFeatures ? publishConfig() : syncPeers()), 800); });
on("sync-applied", () => { if (hasPcFeatures) publishConfig(); });
on("settings", ({ path }) => { if (hasPcFeatures && String(path).startsWith("device")) startReceiver(); });

/** Handy: beim Start abgleichen, danach alle 2 Minuten und beim Zurückkehren in die App. */
export function startSync() {
  if (hasPcFeatures) return;
  for (const p of settings().direct.peers || []) if (!p.paired) pingPeer(p);
  syncPeers();
  setInterval(syncPeers, 120e3);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) syncPeers(); });
}
