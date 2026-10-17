// Verbindung zur Zentrale (Mosquitto, WebSocket-Listener).
//
// Vom ESP32 (ESPHome, topic_prefix alarm/<kennung>):
//   alarm/<kennung>                         "ALARM"
//   alarm/<kennung>/status                  "online" | "offline"
//   alarm/<kennung>/sensor/<id>/state       z. B. wifi_signal, uptime
//   alarm/<kennung>/text_sensor/<id>/state  z. B. ip, version
// Von Heimalarm-Apps (Anwesenheit, retained, mit Last Will):
//   heimalarm/clients/<id>                  JSON { name, platform, version, online, ts }
// Von Zigbee2MQTT (falls vorhanden):
//   zigbee2mqtt/bridge/devices              JSON-Liste der Geräte
import mqtt from "mqtt";
import { settings } from "./settings.js";
import { emit } from "./events.js";
import { log } from "./log.js";
import { platformName } from "./platform.js";

const APP_VERSION = import.meta.env.PACKAGE_VERSION || "0.1.0";

let client = null;
/** devices: kennung -> { online, since, ip, rssi, uptime, version } · clients: id -> Info · zigbee: Liste | null */
export const state = { connected: false, devices: {}, clients: {}, zigbee: null };

const clientTopic = () => `heimalarm/clients/${settings().device.id}`;
const presence = (online) => JSON.stringify({
  name: settings().device.name || platformName, platform: platformName, version: APP_VERSION, online, ts: Date.now(),
});

export function connect() {
  disconnect();
  const b = settings().broker;
  if (!b.host) return;
  const url = `${b.tls ? "wss" : "ws"}://${b.host}:${b.port}`;
  client = mqtt.connect(url, {
    username: b.user || undefined,
    password: b.pass || undefined,
    clientId: `heimalarm-${settings().device.id}-${Math.random().toString(16).slice(2, 6)}`,
    reconnectPeriod: 3000,
    connectTimeout: 8000,
    will: { topic: clientTopic(), payload: presence(false), retain: true, qos: 1 },
  });

  client.on("connect", () => {
    state.connected = true;
    client.subscribe(["alarm/#", "heimalarm/clients/+", "zigbee2mqtt/bridge/devices"], { qos: 1 });
    client.publish(clientTopic(), presence(true), { retain: true, qos: 1 });
    log("ok", "Mit Zentrale verbunden", url);
    emit("conn", state);
  });
  client.on("close", () => {
    if (state.connected) log("warn", "Verbindung zur Zentrale getrennt");
    state.connected = false;
    emit("conn", state);
  });
  client.on("error", (err) => emit("conn-error", err.message));
  client.on("message", (topic, payload) => handle(topic, payload.toString().trim()));
}

function device(who) {
  return (state.devices[who] ||= { online: null, since: Date.now() });
}

function handle(topic, msg) {
  const parts = topic.split("/");

  if (parts[0] === "heimalarm" && parts[1] === "clients") {
    try { state.clients[parts[2]] = JSON.parse(msg); } catch { return; }
    emit("devices", state);
    return;
  }
  if (parts[0] === "zigbee2mqtt") {
    try { state.zigbee = JSON.parse(msg).filter((d) => d.type !== "Coordinator"); } catch { return; }
    emit("devices", state);
    return;
  }

  const who = parts[1];
  if (parts[0] !== "alarm" || !who) return;

  if (parts.length === 2) {
    if (/^alarm$/iu.test(msg)) emit("alarm-in", { who, source: "ESP32", ts: Date.now() });
    return;
  }
  const d = device(who);
  if (parts[2] === "status") {
    const online = msg === "online";
    if (d.online !== online) {
      d.online = online; d.since = Date.now(); d.warned = false;
      log(online ? "ok" : "warn", `ESP32 „${who}“ ${online ? "online" : "offline"}`);
    }
  } else if (parts.at(-1) === "state") {
    // ESPHome-Sensoren: Werte für die Übersicht merken
    const id = parts[parts.length - 2];
    if (id === "wifi_signal") d.rssi = Number(msg);
    else if (id === "uptime") d.uptime = Number(msg);
    else if (id === "ip") d.ip = msg;
    else if (id === "version") d.version = msg;
  }
  emit("devices", state);
}

export function disconnect() {
  if (client) {
    if (state.connected) client.publish(clientTopic(), presence(false), { retain: true, qos: 1 });
    client.end(false);
    client = null;
  }
  state.connected = false;
  emit("conn", state);
}

export function publish(topic, message) {
  client?.publish(topic, message, { qos: 1 });
}
