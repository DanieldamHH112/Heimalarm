// C – Licht & Geräte über Zigbee2MQTT: anlernen, umbenennen, entfernen, steuern,
// Gruppen, Direktverknüpfung, Erreichbarkeit, Firmware, Netzwerkkarte.
import { h, toast, fmtAgo } from "../ui/dom.js";
import { dialog, field, select, ask } from "../ui/form.js";
import { state, z2m, setDevice } from "../core/mqtt.js";
import { requireAdmin } from "../core/admin.js";
import { log } from "../core/log.js";
import { has } from "../core/features.js";
import { row as wifiRow, addDialog as addWifi } from "./wifi.js";
import { shared } from "../core/shared.js";
import { WIFI_TYPES } from "../core/wifi.js";
import { icon } from "../ui/icons.js";

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

// ── Seite: zwei Spalten (Geräte links, gewähltes Gerät rechts) ──
const isPhone = () => window.matchMedia("(max-width: 760px)").matches;
const keyOf = () => decodeURIComponent(location.hash.replace("#/", "").split("/").slice(1).join("/") || "");
const link = (key) => `#/geraete/${encodeURIComponent(key)}`;

function zigbeeSetupCard() {
  return h("section.card", {},
    h("h2", {}, "Zigbee2MQTT noch nicht gefunden"),
    h("ol.steps", {},
      h("li", {}, h("div", {}, "Zigbee-USB-Stick an die Zentrale stecken")),
      h("li", {}, h("div", {}, "Zentrale mit Zigbee starten", h("small", {}, h("code", {}, "docker compose --profile zigbee up -d")))),
      h("li", {}, h("div", {}, "Hier „Gerät anlernen“ drücken", h("small", {}, "Die Geräte erscheinen automatisch.")))),
    h("p.hint", {}, state.connected ? "Die Zentrale ist verbunden, meldet aber kein Zigbee2MQTT." : "Zuerst die Zentrale unter Einstellungen verbinden."));
}

const pane = (title, ico, color, ...body) => h("section.split-detail", { style: `--a:var(${color})` },
  h("a.split-back", { href: "#/geraete" }, icon("back"), "Licht & Geräte"),
  h("div.split-head", {}, h("span.ico.big", { style: `--a:var(${color})` }, icon(ico)), h("div", { style: "min-width:0" }, h("p.crumb", {}, "Licht & Geräte"), h("h2", {}, title))),
  ...body);

export function devicesView(rerender) {
  const zig = has.pi() && state.zigbee ? state.zigbee.filter((d) => d.type !== "Coordinator").toSorted((a, b) => a.friendly_name.localeCompare(b.friendly_name)) : [];
  const wifi = (shared().wifi || []).toSorted((a, b) => a.name.localeCompare(b.name));
  const entries = [
    ...zig.map((d) => ({ key: `z:${d.friendly_name}`, kind: "zigbee", d })),
    ...wifi.map((d) => ({ key: `w:${d.id}`, kind: "wifi", d })),
  ];
  const extra = [
    has.pi() && state.zigbee && { key: "gruppen", label: "Gruppen", sub: `${state.groups.length} Gruppen`, ico: "flow" },
    has.pi() && state.zigbee && { key: "netz", label: "Netzwerkkarte", sub: "Wer funkt über wen", ico: "net" },
    has.pi() && !state.zigbee && { key: "zigbee", label: "Zigbee einrichten", sub: "Stick an der Zentrale", ico: "tool" },
  ].filter(Boolean);
  const key = keyOf();
  const all = [...entries.map((e) => e.key), ...extra.map((e) => e.key)];
  const current = all.includes(key) ? key : isPhone() ? null : all[0] || null;

  const joinLeft = Math.max(0, Math.round((state.permitJoinUntil - Date.now()) / 1000));
  const join = asked(() => { z2m("permit_join", { time: 120 }); toast("Gerät jetzt in den Kopplungsmodus versetzen (meist 5 s Knopf halten)"); });
  const addW = async () => { if (await requireAdmin()) addWifi(rerender); };

  const item = (e) => {
    let on = false, sub = "", color = "--c-net";
    if (e.kind === "zigbee") {
      const st = state.zstate[e.d.friendly_name] || {}, av = state.zavail[e.d.friendly_name];
      on = st.state === "ON";
      sub = av === "offline" ? "nicht erreichbar" : "state" in st ? (on ? "an" : "aus") : e.d.definition?.description || e.d.type;
      color = av === "offline" ? "--signal" : on ? "--warn" : "--c-pc";
    } else { sub = `${WIFI_TYPES[e.d.type]?.label || e.d.type} · ${e.d.host}`; }
    const name = e.kind === "zigbee" ? e.d.friendly_name : e.d.name;
    return h("a.split-item", { href: link(e.key), "aria-current": current === e.key ? "page" : null },
      h("span.ico", { style: `--a:var(${color})` }, icon("bulb")),
      h("span.split-item-text", {}, h("b", {}, name), h("small" + (sub === "nicht erreichbar" ? ".warn" : ""), {}, sub)),
      h("span.chev", {}, icon("chev")));
  };

  const listPane = h("aside.split-list", {},
    h("h1", {}, "Licht & Geräte"),
    h("div.row", { style: "padding:0 4px 12px;gap:8px" },
      has.pi() && state.zigbee && (joinLeft > 0
        ? h("button.btn.small", { onclick: () => z2m("permit_join", { time: 0 }) }, `Anlernen · ${joinLeft} s · Stopp`)
        : h("button.btn.primary.small", { onclick: join }, "Gerät anlernen")),
      h("button.btn.small", { onclick: addW }, "WLAN-Gerät")),
    has.pi() && state.bridge === "offline" && h("p.split-warn", {}, "Zigbee2MQTT ist offline – Stick und Container auf der Zentrale prüfen."),
    h("nav.split-nav", { "aria-label": "Geräte" },
      entries.length === 0 ? h("p.hint", { style: "padding:8px 10px" }, has.pi() ? "Noch kein Gerät. Zigbee anlernen oder ein WLAN-Gerät (Shelly, Hue, WLED, Tasmota) hinzufügen." : "Shelly, Philips Hue, WLED oder Tasmota direkt im Heimnetz hinzufügen. Zigbee gibt es mit Zentrale.")
        : entries.map(item),
      extra.length > 0 && h("div.split-grp", {}, "Mehr"),
      extra.map((x) => h("a.split-item", { href: link(x.key), "aria-current": current === x.key ? "page" : null },
        h("span.ico", { style: "--a:var(--c-app)" }, icon(x.ico)),
        h("span.split-item-text", {}, h("b", {}, x.label), h("small", {}, x.sub)),
        h("span.chev", {}, icon("chev"))))));

  let detail = null;
  const e = entries.find((x) => x.key === current);
  if (e?.kind === "zigbee") detail = pane(e.d.friendly_name, "bulb", "--c-pc", h("section.card", {}, deviceCard(e.d)));
  else if (e?.kind === "wifi") detail = pane(e.d.name, "bulb", "--c-net", h("section.card", {}, h("ul.rows", {}, wifiRow(e.d, shared().wifi || [], rerender))));
  else if (current === "gruppen") detail = pane("Gruppen", "flow", "--c-app", groupsSection());
  else if (current === "netz") detail = pane("Netzwerkkarte", "net", "--c-app", networkSection());
  else if (current === "zigbee") detail = pane("Zigbee einrichten", "tool", "--c-app", zigbeeSetupCard());
  return h("div.split" + (detail ? ".has-detail" : ""), {}, listPane, detail || h("section.split-detail.empty-pane", {}, h("p.empty", {}, "Gerät links auswählen.")));
}
