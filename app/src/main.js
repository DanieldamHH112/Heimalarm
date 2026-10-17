// Einstieg: Einstellungen laden, Verbindung aufbauen, Ansichten rendern.
import { on } from "./core/events.js";
import { connect, state } from "./core/mqtt.js";
import { init as initEngine } from "./core/engine.js";
import { settings } from "./core/settings.js";
import { log } from "./core/log.js";
import { applyTheme } from "./ui/theme.js";
import { h, toast } from "./ui/dom.js";
import { overview } from "./views/overview.js";
import { logView } from "./views/log.js";
import { settingsView } from "./views/settings.js";
import { showTakeover } from "./views/takeover.js";

const routes = { uebersicht: overview, protokoll: logView, einstellungen: settingsView };
const view = document.getElementById("view");

function current() {
  const r = location.hash.replace("#/", "");
  return routes[r] ? r : "uebersicht";
}

function render() {
  const name = current();
  view.replaceChildren(routes[name](render));
  document.querySelectorAll(".nav-item").forEach((a) => {
    if (a.dataset.route === name) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  renderConn();
}

function renderConn() {
  const el = document.getElementById("conn-badge");
  el.replaceChildren(state.connected
    ? h("span.chip.ok", {}, h("span.chip-label", {}, "Verbunden"))
    : h("span.chip" + (settings().broker.host ? ".bad" : ""), {}, h("span.chip-label", {}, settings().broker.host ? "Getrennt" : "Nicht eingerichtet")));
}

// Neu zeichnen, ohne Eingaben in den Einstellungen zu stören
const live = () => { if (current() !== "einstellungen") render(); else renderConn(); };

applyTheme();
window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);
initEngine();
on("conn", live);
on("devices", live);
on("log", live);
on("alarm", (a) => { if (!a.own) toast(`Alarm von „${a.who}“`); });
on("takeover", showTakeover);
on("conn-error", () => {});
window.addEventListener("hashchange", render);

// A8 – Offline-Warnung für den eigenen ESP32
setInterval(() => {
  const dev = state.devices[settings().alarm.me];
  if (dev && !dev.online && !dev.warned && Date.now() - dev.since > settings().alarm.offlineWarnSec * 1000) {
    dev.warned = true;
    log("warn", "ESP32 ist länger offline", "Stromversorgung und WLAN prüfen");
  }
}, 10000);

render();
connect();
