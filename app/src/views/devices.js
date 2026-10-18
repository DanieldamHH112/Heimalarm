// C – Licht & Geräte über Zigbee2MQTT: anlernen, umbenennen, entfernen, steuern,
// Gruppen, Direktverknüpfung, Erreichbarkeit, Firmware, Netzwerkkarte.
import { h, toast, fmtAgo } from "../ui/dom.js";
import { dialog, field, select, ask } from "../ui/form.js";
import { state, z2m, setDevice } from "../core/mqtt.js";
import { requireAdmin } from "../core/admin.js";
import { log } from "../core/log.js";
import { has } from "../core/features.js";
import { wifiSection } from "./wifi.js";

/** Alle Eigenschaften (property) aus den Zigbee2MQTT-"exposes" sammeln. */
function props(dev) {
  const out = new Set();
  const walk = (list) => (list || []).forEach((e) => { if (e.property) out.add(e.property); walk(e.features); });
  walk(dev.definition?.exposes);
  return out;
}

const pct = (v) => Math.round(((Number(v) || 0) / 254) * 100);
const asked = (fn) => async (...a) => { if (await requireAdmin()) fn(...a); };

function controls(name, p, s) {
  const out = [];
  if (p.has("state")) {
    out.push(h("div.row", {},
      h("button.btn.small" + (s.state === "ON" ? ".primary" : ""), { onclick: () => setDevice(name, { state: "ON", transition: 1 }) }, "An"),
      h("button.btn.small" + (s.state === "OFF" ? ".primary" : ""), { onclick: () => setDevice(name, { state: "OFF", transition: 1 }) }, "Aus"),
      p.has("effect") && h("button.btn.small", { onclick: () => setDevice(name, { effect: "blink" }), title: "Kurz blinken (C6)" }, "Blinken")));
  }
  if (p.has("brightness")) {
    const val = h("span", {}, `${pct(s.brightness)} %`);
    out.push(h("label.range", {}, "Helligkeit",
      h("input", { type: "range", min: 1, max: 100, value: pct(s.brightness) || 50,
        oninput: (e) => (val.textContent = `${e.target.value} %`),
        onchange: (e) => setDevice(name, { brightness: Math.round((Number(e.target.value) / 100) * 254), transition: 1 }) }), val));
  }
  if (p.has("color_temp")) {
    out.push(h("label.range", {}, "Farbtemp.",
      h("input", { type: "range", min: 150, max: 500, value: s.color_temp || 300, onchange: (e) => setDevice(name, { color_temp: Number(e.target.value), transition: 1 }) }),
      h("span", {}, "warm")));
  }
  if (p.has("color")) {
    out.push(h("label.range", {}, "Farbe", h("input.color-input", { type: "color", value: "#ff3b2f", onchange: (e) => setDevice(name, { color: { hex: e.target.value } }) }), h("span")));
  }
  return out;
}

function deviceCard(dev) {
  const name = dev.friendly_name;
  const s = state.zstate[name] || {};
  const avail = state.zavail[name];
  const p = props(dev);

  const rename = asked(() => {
    const input = h("input.input", { value: name });
    const close = dialog("Gerät umbenennen", field("Neuer Name", input, "Z. B. „Flur Decke“. Routinen mit dem alten Namen bitte anpassen."),
      h("div.row", {}, h("button.btn.primary", { onclick: () => { z2m("device/rename", { from: name, to: input.value.trim(), homeassistant_rename: false }); close(); toast("Wird umbenannt …"); } }, "Speichern")));
  });
  const remove = asked(async () => { if (await ask(`„${name}“ wirklich entfernen?`)) { z2m("device/remove", { id: name }); log("action", `Gerät entfernt: ${name}`); } });
  const ota = asked(() => { z2m("device/ota_update/check", { id: name }); toast("Firmware wird geprüft …"); });
  const otaUpdate = asked(async () => { if (await ask("Firmware jetzt aktualisieren? Das kann einige Minuten dauern.")) z2m("device/ota_update/update", { id: name }); });
  const bind = asked(() => {
    const targets = (state.zigbee || []).filter((d) => d.friendly_name !== name).map((d) => [d.friendly_name, d.friendly_name]);
    let target = targets[0]?.[0];
    const close = dialog("Direkt verknüpfen",
      h("p.meta", {}, `„${name}“ (z. B. ein Schalter) steuert dann das Ziel direkt – auch ohne Zentrale.`),
      field("Ziel", select(targets, target, (v) => (target = v))),
      h("div.row", {},
        h("button.btn.primary", { onclick: () => { z2m("device/bind", { from: name, to: target }); close(); toast("Verknüpfung wird angelegt …"); } }, "Verknüpfen"),
        h("button.btn", { onclick: () => { z2m("device/unbind", { from: name, to: target }); close(); } }, "Lösen")));
  });

  return h("div.item", {},
    h("div.item-head", {},
      h("div", {}, h("b", {}, name), h("div.meta", {}, dev.definition?.description || dev.type)),
      avail === "offline" ? h("span.chip.bad", {}, "nicht erreichbar") : avail === "online" ? h("span.chip.ok", {}, "erreichbar") : h("span.chip", {}, "unbekannt")),
    ...controls(name, p, s),
    s.update?.state === "available" && h("div.banner.warn", {}, h("div", {}, h("b", {}, "Firmware-Update verfügbar"), h("button.btn.small", { onclick: otaUpdate }, "Jetzt aktualisieren"))),
    h("div.row", {},
      h("button.btn.small.ghost", { onclick: rename }, "Umbenennen"),
      h("button.btn.small.ghost", { onclick: bind }, "Verknüpfen"),
      h("button.btn.small.ghost", { onclick: ota }, "Firmware prüfen"),
      h("button.btn.small.ghost.danger", { onclick: remove }, "Entfernen")),
    s.linkquality != null && h("p.meta", {}, `Signal ${s.linkquality} LQI${s.last_seen ? " · zuletzt " + fmtAgo(new Date(s.last_seen).getTime()) : ""}`),
  );
}

function groupsSection() {
  const add = asked(() => {
    const input = h("input.input", { placeholder: "z. B. Flur + Küche" });
    const close = dialog("Neue Gruppe", field("Name", input),
      h("div.row", {}, h("button.btn.primary", { onclick: () => { z2m("group/add", { friendly_name: input.value.trim() }); close(); } }, "Anlegen")));
  });
  const addMember = (g) => asked(() => {
    const opts = (state.zigbee || []).map((d) => [d.friendly_name, d.friendly_name]);
    let dev = opts[0]?.[0];
    const close = dialog(`Gerät zu „${g.friendly_name}“`, field("Gerät", select(opts, dev, (v) => (dev = v))),
      h("div.row", {}, h("button.btn.primary", { onclick: () => { z2m("group/members/add", { group: g.friendly_name, device: dev }); close(); } }, "Hinzufügen")));
  })();

  return h("section.card", {},
    h("div.card-head", {}, h("h2", {}, "Gruppen"), h("button.btn.small", { onclick: add }, "Neue Gruppe")),
    state.groups.length === 0 ? h("p.hint", {}, "Gruppen schalten mehrere Geräte auf einmal, z. B. alle Lampen im Flur.")
      : h("div.cards", {}, state.groups.map((g) => h("div.item", {},
          h("div.item-head", {}, h("b", {}, g.friendly_name), h("span.meta", {}, `${g.members?.length || 0} Geräte`)),
          h("p.meta", {}, (g.members || []).map((m) => (state.zigbee || []).find((d) => d.ieee_address === m.ieee_address)?.friendly_name || m.ieee_address).join(", ") || "noch leer"),
          h("div.row", {},
            h("button.btn.small", { onclick: () => setDevice(g.friendly_name, { state: "ON", transition: 1 }) }, "An"),
            h("button.btn.small", { onclick: () => setDevice(g.friendly_name, { state: "OFF", transition: 1 }) }, "Aus"),
            h("button.btn.small.ghost", { onclick: () => addMember(g) }, "Gerät hinzufügen"),
            h("button.btn.small.ghost.danger", { onclick: asked(async () => { if (await ask("Gruppe löschen?")) z2m("group/remove", { id: g.friendly_name }); }) }, "Löschen")),
        ))),
  );
}

function networkSection() {
  const map = state.networkmap;
  const byIeee = (id) => (state.zigbee || []).find((d) => d.ieee_address === id)?.friendly_name || (id === map?.nodes?.find((n) => n.type === "Coordinator")?.ieeeAddr ? "Zigbee-Stick" : id);
  return h("section.card", {},
    h("div.card-head", {}, h("h2", {}, "Netzwerkkarte"), h("button.btn.small", { onclick: () => { z2m("networkmap", { type: "raw", routes: false }); toast("Wird geladen – das dauert bis zu einer Minute"); } }, "Laden")),
    !map ? h("p.hint", {}, "Zeigt, welches Gerät über welches funkt und wie gut die Verbindung ist.")
      : h("table.table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Gerät"), h("th", {}, "über"), h("th", {}, "Signal"))),
          h("tbody", {}, (map.links || []).map((l) => h("tr", {}, h("td", {}, byIeee(l.source?.ieeeAddr || l.sourceIeeeAddr)), h("td", {}, byIeee(l.target?.ieeeAddr || l.targetIeeeAddr)), h("td", {}, `${l.linkquality ?? l.lqi ?? "–"} LQI`))))),
  );
}

export function devicesView(rerender) {
  if (!has.pi()) {
    return h("div.page", {},
      h("header.page-head", {}, h("div", {}, h("h1", {}, "Licht & Geräte"), h("p", {}, "WLAN-Geräte direkt im Heimnetz. Zigbee gibt es mit Zentrale."))),
      wifiSection(rerender));
  }
  return zigbeeView(rerender);
}

function zigbeeView(rerender) {
  const joinLeft = Math.max(0, Math.round((state.permitJoinUntil - Date.now()) / 1000));
  const join = asked(() => { z2m("permit_join", { time: 120 }); toast("Gerät jetzt in den Kopplungsmodus versetzen (meist 5 s Knopf halten)"); });

  const head = h("header.page-head", {},
    h("div", {}, h("h1", {}, "Licht & Geräte"), h("p", {}, "Zigbee-Geräte über die Zentrale. Funktioniert ohne Cloud.")),
    state.zigbee && (joinLeft > 0
      ? h("button.btn", { onclick: () => z2m("permit_join", { time: 0 }) }, `Anlernen läuft · ${joinLeft} s · Stopp`)
      : h("button.btn.primary", { onclick: join }, "Gerät anlernen")));

  if (!state.zigbee) {
    return h("div.page", {}, head, wifiSection(rerender), h("section.card", {},
      h("h2", {}, "Zigbee2MQTT noch nicht gefunden"),
      h("ol.steps", {},
        h("li", {}, h("div", {}, "Zigbee-USB-Stick an die Zentrale stecken")),
        h("li", {}, h("div", {}, "Zentrale mit Zigbee starten", h("small", {}, h("code", {}, "docker compose --profile zigbee up -d")))),
        h("li", {}, h("div", {}, "Hier „Gerät anlernen“ drücken", h("small", {}, "Die Geräte erscheinen automatisch.")))),
      h("p.hint", {}, state.connected ? "Die Zentrale ist verbunden, meldet aber kein Zigbee2MQTT." : "Zuerst die Zentrale unter Einstellungen verbinden.")));
  }

  return h("div.page", {}, head,
    wifiSection(rerender),
    state.bridge === "offline" && h("div.banner.warn", {}, h("div", {}, h("b", {}, "Zigbee2MQTT ist offline"), "Stick und Container auf der Zentrale prüfen.")),
    h("section.card", {},
      h("div.card-head", {}, h("h2", {}, "Geräte"), h("span.chip", {}, `${state.zigbee.length}`)),
      state.zigbee.length === 0 ? h("p.hint", {}, "Noch kein Gerät. Mit „Gerät anlernen“ starten.")
        : h("div.cards", {}, state.zigbee.toSorted((a, b) => a.friendly_name.localeCompare(b.friendly_name)).map(deviceCard))),
    groupsSection(),
    networkSection(),
  );
}
