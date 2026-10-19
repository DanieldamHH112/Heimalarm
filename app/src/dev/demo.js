// Beispieldaten für die Entwicklung (nur mit `npm run dev` und ?demo).
import { log } from "../core/log.js";

export function fillDemo(state) {
  const now = Date.now();
  state.connected = true;
  import("../core/update.js").then(({ update }) => { update.available = { version: "0.2.0", page: "#", url: "#", notes: "Updates direkt in der App" }; });
  import("../core/divera.js").then(({ divera }) => { divera.ok = true; divera.current = "1"; divera.loading = true; });
  state.voice = { enabled: true, running: true, commissioned: false, qr: "MT:Y.K90SO527NHQL71V00", manual: "36360023599", fabrics: [], sensors: ["Heimalarm Einsatz", "Einsatz Daniel", "Einsatz Kollege"] };
  state.devices = {
    ich: { online: true, since: now - 3 * 3600e3, ledType: "rgb", ledOn: true, ledLevel: 40, ledMode: "Alles", rssi: -58, uptime: 3 * 86400 + 4 * 3600, ip: "192.168.1.42", version: "2026.10.0" },
    kollege: { online: false, since: now - 25 * 60e3, rssi: -81, uptime: 5400, ip: "192.168.1.57", version: "2026.10.0" },
  };
  state.clients = {
    a: { name: "PC Arbeitszimmer", platform: "Windows", version: "0.1.0", online: true, ts: now },
    b: { name: "Pixel 8", platform: "Android", version: "0.1.0", online: true, ts: now - 60e3 },
    c: { name: "Laptop", platform: "Windows", version: "0.1.0", online: false, ts: now - 2 * 86400e3 },
  };
  state.zigbee = [
    { friendly_name: "Flur Decke", type: "Router", definition: { description: "LED-Lampe E27" } },
    { friendly_name: "Küche Stecker", type: "Router", definition: { description: "Zwischenstecker" } },
  ];
  log("ok", "Mit Zentrale verbunden", "ws://192.168.1.10:9001");
  log("alarm", "Alarm", "ESP32 · alarm/ich");
  log("action", "„Ich fahre“ → Ruhezustand", "wird ausgeführt");
  log("warn", "ESP32 „kollege“ offline");
}
