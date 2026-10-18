// WLAN-Geräte: Shelly, Hue Bridge, WLED, Tasmota – direkt im Heimnetz, mit und ohne Zentrale.
import { h, toast } from "../ui/dom.js";
import { dialog, field, select, ask } from "../ui/form.js";
import { shared, updateShared, newId } from "../core/shared.js";
import { requireAdmin } from "../core/admin.js";
import { isTauri } from "../core/platform.js";
import { WIFI_TYPES, wifiSet, huePair, hueTargets } from "../core/wifi.js";

const fetchFn = async (...a) => (isTauri ? (await import("@tauri-apps/plugin-http")).fetch : fetch)(...a);
const save = (list) => updateShared({ wifi: list });
const doSet = (d, state) => wifiSet(d, state, fetchFn).then(() => toast(`${d.name}: ${state.on ? "an" : "aus"}`)).catch((e) => toast(`${d.name}: ${e.message}`));

function addDialog(rerender, existing) {
  const d = existing ? structuredClone(existing) : { id: newId(), name: "", type: "shelly", host: "", user: "", target: "" };
  const body = h("div", { style: "display:grid;gap:16px" });
  let targets = [];
  const paint = () => body.replaceChildren(...[
    h("div.field", {}, h("span", {}, "Art"), select(Object.entries(WIFI_TYPES).map(([k, v]) => [k, v.label]), d.type, (v) => { d.type = v; paint(); }), h("small", {}, WIFI_TYPES[d.type].hint)),
    field("Name", h("input.input", { value: d.name, placeholder: "z. B. Flurlicht", onchange: (e) => (d.name = e.target.value.trim()) }), "So heißt es in Routinen."),
    field(d.type === "hue" ? "IP der Bridge" : "IP-Adresse", h("input.input", { value: d.host, inputmode: "url", placeholder: "192.168.1.50", onchange: (e) => (d.host = e.target.value.trim()) }), "Am besten im Router fest vergeben."),
    d.type === "hue" && h("div.group", {},
      h("h3.group-title", {}, "Bridge koppeln"),
      h("p.meta", {}, d.user ? "Gekoppelt." : "Knopf auf der Bridge drücken, dann innerhalb von 30 s „Koppeln“."),
      h("div.row", {},
        h("button.btn.small", { onclick: async () => { try { d.user = await huePair(d.host, fetchFn); toast("Bridge gekoppelt"); targets = await hueTargets(d.host, d.user, fetchFn); paint(); } catch (e) { toast(e.message); } } }, d.user ? "Neu koppeln" : "Koppeln"),
        d.user && h("button.btn.small.ghost", { onclick: async () => { try { targets = await hueTargets(d.host, d.user, fetchFn); paint(); } catch (e) { toast(e.message); } } }, "Lampen laden")),
      targets.length > 0 && field("Lampe oder Raum", select([["", "– wählen –"], ...targets.map((t) => [t.target, t.name])], d.target, (v) => (d.target = v))),
      !targets.length && d.target && h("p.meta", {}, `Gewählt: ${d.target}`)),
    h("div.row", {},
      h("button.btn.small.ghost", { onclick: () => doSet(d, { on: true }) }, "Test: an"),
      h("button.btn.small.ghost", { onclick: () => doSet(d, { on: false }) }, "Test: aus")),
    h("div.row", {},
      h("button.btn.primary", { onclick: () => {
        if (!d.name || !d.host) return toast("Name und IP-Adresse eintragen");
        if (d.type === "hue" && (!d.user || !d.target)) return toast("Bridge koppeln und Lampe wählen");
        const list = (shared().wifi || []).filter((x) => x.id !== d.id);
        save([...list, d]); close(); rerender(); toast("Gespeichert");
      } }, "Speichern"),
      h("button.btn", { onclick: () => close() }, "Abbrechen")),
  ].filter(Boolean));
  paint();
  const close = dialog(existing ? `WLAN-Gerät: ${existing.name}` : "WLAN-Gerät hinzufügen", body);
}

function row(d, list, rerender) {
  const edit = async () => { if (await requireAdmin()) addDialog(rerender, d); };
  const del = async () => { if (await requireAdmin() && await ask(`„${d.name}“ entfernen?`)) { save(list.filter((x) => x.id !== d.id)); rerender(); } };
  return h("li", {},
    h("div.row-main", {}, h("b", {}, d.name, h("span.badge", {}, WIFI_TYPES[d.type]?.label || d.type)), h("span.meta", {}, d.host)),
    h("div.row", {},
      h("button.btn.small", { onclick: () => doSet(d, { on: true }) }, "An"),
      h("button.btn.small", { onclick: () => doSet(d, { on: false }) }, "Aus"),
      h("button.btn.small.ghost", { onclick: edit }, "Bearbeiten"),
      h("button.btn.small.ghost.danger", { onclick: del }, "Entfernen")));
}

export function wifiSection(rerender) {
  const list = shared().wifi || [];
  const add = async () => { if (await requireAdmin()) addDialog(rerender); };
  const sorted = list.toSorted((a, b) => a.name.localeCompare(b.name));
  return h("section.card", {},
    h("div.card-head", {}, h("h2", {}, "WLAN-Geräte"), h("button.btn.small", { onclick: add }, "Hinzufügen")),
    list.length === 0
      ? h("p.hint", {}, "Shelly, Philips Hue (auch IKEA-Lampen an der Bridge), WLED, Tasmota – direkt im Heimnetz, auch ohne Zentrale.")
      : h("ul.rows", {}, sorted.map((d) => row(d, list, rerender))));
}
