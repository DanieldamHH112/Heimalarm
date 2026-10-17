// Verbindung zur Zentrale (Mosquitto, WebSocket-Listener).
// Topics vom ESP32:  alarm/<kennung>          Nachricht "ALARM"
//                    alarm/<kennung>/status   "online" | "offline"
import mqtt from "mqtt";
import { settings } from "./settings.js";
import { emit } from "./events.js";
import { log } from "./log.js";

let client = null;
export const state = { connected: false, devices: {} }; // devices: kennung -> { online, since }

export function connect() {
  disconnect();
  const b = settings().broker;
  if (!b.host) return;
  const url = `${b.tls ? "wss" : "ws"}://${b.host}:${b.port}`;
  client = mqtt.connect(url, {
    username: b.user || undefined,
    password: b.pass || undefined,
    clientId: `heimalarm-${Math.random().toString(16).slice(2, 8)}`,
    reconnectPeriod: 3000,
    connectTimeout: 8000,
  });

  client.on("connect", () => {
    state.connected = true;
    client.subscribe("alarm/#", { qos: 1 });
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

function handle(topic, msg) {
  const parts = topic.split("/");
  const who = parts[1];
  if (!who) return;
  if (parts[2] === "status") {
    const online = msg === "online";
    const prev = state.devices[who];
    if (!prev || prev.online !== online) {
      state.devices[who] = { online, since: Date.now() };
      log(online ? "ok" : "warn", `ESP32 „${who}“ ${online ? "online" : "offline"}`);
      emit("devices", state.devices);
    }
    return;
  }
  if (parts.length === 2 && /^alarm$/i.test(msg)) emit("alarm-in", { who, source: "ESP32", ts: Date.now() });
}

export function disconnect() {
  if (client) { client.end(true); client = null; }
  state.connected = false;
  emit("conn", state);
}

export function publish(topic, message) {
  client?.publish(topic, message, { qos: 1 });
}
