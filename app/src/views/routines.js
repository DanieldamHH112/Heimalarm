// B – Routinen & Regeln. Gespeichert in der gemeinsamen Konfiguration, ausgeführt vom Zentralen-Dienst.
import { h, toast } from "../ui/dom.js";
import { dialog, field, select, switchRow, copyText, download } from "../ui/form.js";
import { shared, updateShared, newId } from "../core/shared.js";
import { state, publish } from "../core/mqtt.js";
import { requireAdmin } from "../core/admin.js";
import { has } from "../core/features.js";
import { fireLocal } from "../core/routines-local.js";

const TRIGGERS = [["alarm", "Bei Alarm"], ["time", "Zu einer Uhrzeit"], ["device", "Wenn ein Gerät …"], ["manual", "Nur per Knopf"]];
const CONDS = {
  time: "Uhrzeit von–bis", weekday: "Wochentage", sun: "Hell / dunkel", home: "Jemand zuhause (Handy im WLAN)",
  keyword: "Stichwort enthält", unit: "Einheit enthält",
};
const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const blank = () => ({
  id: newId(), name: "Neue Routine", enabled: true, who: [],
  trigger: { type: "alarm" }, conditions: { mode: "and", items: [] },
  actions: [{ type: "device", device: "", payload: { state: "ON", brightness: 254 }, transition: 1, offAfterSec: 0 }],
  restoreAfterMin: 0,
});

/** B – Vorlage: Licht bei Alarm (nachts gedimmt), passend zum Konzept */
const template = () => ({
  ...blank(), name: "Alarm nachts: Licht an",
  conditions: { mode: "and", items: [{ type: "sun", is: "dark" }] },
  actions: [{ type: "device", device: "", payload: { state: "ON", brightness: 3 }, transition: 1, offAfterSec: 300 }],
});

function describe(r) {
  const t = r.trigger || {};
  const trig = t.type === "alarm" ? "Bei Alarm" : t.type === "time" ? `Täglich ${t.at || "?"}` : t.type === "device" ? `Wenn ${t.device || "?"} ${t.property}=${t.value}` : "Per Knopf";
  const who = r.who?.length ? ` · ${r.who.join(", ")}` : "";
  const cond = r.conditions?.items?.length ? ` · ${r.conditions.items.length} Bedingung${r.conditions.items.length > 1 ? "en" : ""}` : "";
  return `${trig}${who}${cond} · ${r.actions?.length || 0} Aktion${r.actions?.length === 1 ? "" : "en"}`;
}

const save = (routines) => updateShared({ routines });
const devNames = () => [["", "– Gerät wählen –"],
  ...(has.pi() ? (state.zigbee || []).map((d) => [d.friendly_name, d.friendly_name]) : []),
  ...(has.pi() ? state.groups.map((g) => [g.friendly_name, `Gruppe: ${g.friendly_name}`]) : []),
  ...(shared().wifi || []).map((d) => [d.name, `${d.name} (WLAN)`])];

/** Routine ausführen – mit Zentrale dort, ohne Zentrale hier. */
const run = (r, test = false) => (has.pi() ? publish("heimalarm/cmd/run", { id: r.id, test }) : fireLocal(r, { manual: true, test }));

// ── Editor ─────────────────────────────────────────
const condRow = (c, del) => h("div.item", {},
    h("div.item-head", {}, h("b", {}, CONDS[c.type]), h("button.btn.small.ghost.danger", { onclick: del }, "Entfernen")),
    c.type === "time" && h("div.fields", {},
      field("Von", h("input.input", { type: "time", value: c.from || "22:00", onchange: (e) => (c.from = e.target.value) })),
      field("Bis", h("input.input", { type: "time", value: c.to || "06:00", onchange: (e) => (c.to = e.target.value) }))),
    c.type === "weekday" && h("div.row", {}, DAYS.map((d, i) => h("label.row", { style: "gap:4px" },
      h("input", { type: "checkbox", checked: (c.days ||= [1, 2, 3, 4, 5, 6, 7]).includes(i + 1), onchange: (e) => { c.days = e.target.checked ? [...c.days, i + 1] : c.days.filter((x) => x !== i + 1); } }), d))),
    c.type === "sun" && select([["dark", "Nur wenn es dunkel ist"], ["light", "Nur wenn es hell ist"]], (c.is ||= "dark"), (v) => (c.is = v)),
    c.type === "home" && select([["any", "Irgendein Handy"], ...Object.entries(state.clients).filter(([, x]) => x.platform === "Android").map(([id, x]) => [id, x.name])], (c.who ||= "any"), (v) => (c.who = v)),
    (c.type === "keyword" || c.type === "unit") && h("input.input", { value: c.contains || "", placeholder: c.type === "keyword" ? "z. B. B3 oder RD" : "z. B. LOHBR", onchange: (e) => (c.contains = e.target.value) }),
  );

const actionRow = (a, del) => {
    if (a.type === "delay") return h("div.item", {}, h("div.item-head", {}, h("b", {}, "Warten"), h("button.btn.small.ghost.danger", { onclick: del }, "Entfernen")),
      field("Sekunden", h("input.input", { type: "number", min: 1, value: a.sec, onchange: (e) => (a.sec = Number(e.target.value)) })));
    if (a.type === "voicemonkey") return h("div.item", {}, h("div.item-head", {}, h("b", {}, "Alexa-Routine (Voice Monkey)"), h("button.btn.small.ghost.danger", { onclick: del }, "Entfernen")),
      field("Auslöser-ID", h("input.input", { value: a.device || "", placeholder: "z. B. heimalarm-einsatz", onchange: (e) => (a.device = e.target.value.trim()) }), "In Voice Monkey als „Routine Trigger“ angelegt."));
    if (a.type === "restore") return h("div.item", {}, h("div.item-head", {}, h("b", {}, "Vorherigen Zustand wiederherstellen"), h("button.btn.small.ghost.danger", { onclick: del }, "Entfernen")));
    a.payload ||= {};
    return h("div.item", {},
      h("div.item-head", {}, h("b", {}, "Gerät schalten"), h("button.btn.small.ghost.danger", { onclick: del }, "Entfernen")),
      h("div.fields", {},
        field("Gerät oder Gruppe", select(devNames(), a.device || "", (v) => (a.device = v))),
        field("Zustand", select([["ON", "An"], ["OFF", "Aus"], ["TOGGLE", "Umschalten"]], a.payload.state || "ON", (v) => (a.payload.state = v))),
        field("Helligkeit %", h("input.input", { type: "number", min: 1, max: 100, value: a.payload.brightness ? Math.round((a.payload.brightness / 254) * 100) : "", placeholder: "unverändert", onchange: (e) => { if (e.target.value) a.payload.brightness = Math.round((Number(e.target.value) / 100) * 254); else delete a.payload.brightness; } })),
        field("Farbe (C5)", h("input.color-input", { type: "color", value: a.payload.color?.hex || "#ffffff", onchange: (e) => (a.payload.color = { hex: e.target.value }) })),
        field("Übergang (s)", h("input.input", { type: "number", min: 0, value: a.transition ?? 1, onchange: (e) => (a.transition = Number(e.target.value)) }), "C4 – sanft hochdimmen"),
        field("Danach aus nach (s)", h("input.input", { type: "number", min: 0, value: a.offAfterSec || 0, onchange: (e) => (a.offAfterSec = Number(e.target.value)) }), "0 = bleibt an")),
      h("label.row", { style: "gap:6px" }, h("input", { type: "checkbox", checked: a.payload.color?.hex !== undefined, onchange: (e) => { if (!e.target.checked) delete a.payload.color; else a.payload.color = { hex: "#ff3b2f" }; } }), "Farbe setzen"),
    );
  };


function editor(routine, rerender) {
  const r = structuredClone(routine);
  const body = h("div", { style: "display:grid;gap:16px" });

  const paint = () => body.replaceChildren(...[
    field("Name", h("input.input", { value: r.name, onchange: (e) => (r.name = e.target.value) })),

    h("div.field", {}, h("span", {}, "Auslöser"),
      select(TRIGGERS, r.trigger.type, (v) => { r.trigger = { type: v }; paint(); })),
    r.trigger.type === "time" && field("Uhrzeit", h("input.input", { type: "time", value: r.trigger.at || "07:00", onchange: (e) => (r.trigger.at = e.target.value) })),
    r.trigger.type === "device" && h("div.fields", {},
      field("Gerät", select(devNames(), r.trigger.device || "", (v) => (r.trigger.device = v))),
      field("Eigenschaft", h("input.input", { value: r.trigger.property || "action", onchange: (e) => (r.trigger.property = e.target.value) }), "z. B. action, contact, occupancy"),
      field("Wert", h("input.input", { value: r.trigger.value || "", onchange: (e) => (r.trigger.value = e.target.value) }), "z. B. single, false, true")),

    // G2 – Routinen pro Person
    r.trigger.type === "alarm" && h("div.field", {}, h("span", {}, "Für wen"),
      h("div.row", {}, (shared().persons || []).map((p) => h("label.row", { style: "gap:6px" },
        h("input", { type: "checkbox", checked: r.who.includes(p.id), onchange: (e) => { r.who = e.target.checked ? [...r.who, p.id] : r.who.filter((x) => x !== p.id); } }),
        `${p.name} (${p.id})`))),
      h("small", {}, "Keine Auswahl = bei jedem Alarm.")),

    // B3–B5, B10 – Bedingungen
    h("div.field", {}, h("span", {}, "Bedingungen"),
      h("div.row", {},
        select([["and", "Alle müssen erfüllt sein (UND)"], ["or", "Eine reicht (ODER)"]], r.conditions.mode, (v) => (r.conditions.mode = v)),
        select([["", "+ Bedingung"], ...Object.entries(CONDS)], "", (v) => { if (v) { r.conditions.items.push({ type: v }); paint(); } })),
      ...r.conditions.items.map((c, i) => condRow(c, () => { r.conditions.items.splice(i, 1); paint(); }))),

    // B6, B7 – Aktionen
    h("div.field", {}, h("span", {}, "Aktionen (der Reihe nach)"),
      ...r.actions.map((a, i) => actionRow(a, () => { r.actions.splice(i, 1); paint(); })),
      h("div.row", {},
        h("button.btn.small", { onclick: () => { r.actions.push({ type: "device", device: "", payload: { state: "ON" }, transition: 1 }); paint(); } }, "+ Gerät"),
        h("button.btn.small", { onclick: () => { r.actions.push({ type: "delay", sec: 5 }); paint(); } }, "+ Warten"),
        h("button.btn.small", { onclick: () => { r.actions.push({ type: "voicemonkey", device: "" }); paint(); } }, "+ Alexa"),
        has.pi() && h("button.btn.small", { onclick: () => { r.actions.push({ type: "restore" }); paint(); } }, "+ Vorher-Zustand"))),

    // B8 – Rückkehr
    field("Vorherigen Zustand wiederherstellen nach (Minuten)", h("input.input", { type: "number", min: 0, value: r.restoreAfterMin || 0, onchange: (e) => (r.restoreAfterMin = Number(e.target.value)) }), "0 = nicht automatisch. „Wieder da“ geht immer per Knopf."),

    h("div.row", {},
      h("button.btn.primary", { onclick: () => { const list = (shared().routines || []).filter((x) => x.id !== r.id); save([...list, r]); close(); rerender(); toast("Routine gespeichert"); } }, "Speichern"),
      h("button.btn", { onclick: () => close() }, "Abbrechen")),
  ].filter(Boolean));

  paint();
  const close = dialog(routine.name === "Neue Routine" ? "Neue Routine" : `Routine: ${routine.name}`, body);
}

// ── Seite ──────────────────────────────────────────
export function routinesView(rerender) {
  const list = shared().routines || [];
  const s = shared();
  const edit = (r) => async () => { if (await requireAdmin()) editor(r, rerender); };

  const exportJson = () => JSON.stringify({ heimalarm: "routinen", version: 1, routines: list }, null, 2);
  const importDialog = async () => {
    if (!(await requireAdmin())) return;
    const ta = h("textarea.input", { placeholder: "Exportierten Text hier einfügen" });
    const close = dialog("Routinen importieren", ta,
      h("div.row", {}, h("button.btn.primary", { onclick: () => {
        try {
          const data = JSON.parse(ta.value);
          const incoming = (data.routines || []).map((r) => ({ ...r, id: newId() }));
          save([...list, ...incoming]); close(); rerender(); toast(`${incoming.length} Routinen importiert`);
        } catch { toast("Text ist kein gültiger Export"); }
      } }, "Importieren")));
  };

  return h("div.page", {},
    h("header.page-head", {},
      h("div", {}, h("h1", {}, "Routinen"), h("p", {}, `Was bei Alarm, zu einer Uhrzeit oder per Knopf passiert. Läuft ${has.pi() ? "auf der Zentrale" : "auf dem Handy"}.`)),
      h("div.row", {},
        h("button.btn", { onclick: edit(template()) }, "Vorlage"),
        h("button.btn.primary", { onclick: edit(blank()) }, "Neue Routine"))),

    has.pi() && !state.dienst?.online && h("div.banner.warn", {}, h("div", {}, h("b", {}, "Zentralen-Dienst nicht erreichbar"), "Routinen werden gespeichert, laufen aber erst, wenn der Dienst auf der Zentrale läuft.")),

    h("section.card", {},
      switchRow("Urlaubsmodus", "Pausiert alle Routinen außer „Nur per Knopf“ (B9).", s.vacation, async (v) => { if (await requireAdmin()) updateShared({ vacation: v }); else rerender(); }),
      h("div.row", {},
        has.pi() && h("button.btn", { onclick: () => { publish("heimalarm/cmd/restore", {}); toast("Vorheriger Zustand wird wiederhergestellt"); } }, "Wieder da – Zustand zurück"),
        h("button.btn.small", { onclick: async () => { if (await copyText(exportJson())) toast("In die Zwischenablage kopiert"); download("heimalarm-routinen.json", exportJson()); } }, "Exportieren"),
        h("button.btn.small", { onclick: importDialog }, "Importieren"))),

    list.length === 0
      ? h("section.card", {}, h("p.empty", {}, "Noch keine Routine. Tipp: „Vorlage“ legt „Alarm nachts: Licht an“ an."))
      : h("div.cards", {}, list.map((r) => h("div.item", {},
          h("div.item-head", {}, h("b", {}, r.name),
            h("input", { type: "checkbox", role: "switch", class: "mini-switch", checked: r.enabled, "aria-label": "Aktiv",
              onchange: async (e) => { if (await requireAdmin()) save(list.map((x) => (x.id === r.id ? { ...x, enabled: e.target.checked } : x))); else rerender(); } })),
          h("p.meta", {}, describe(r)),
          h("div.row", {},
            h("button.btn.small", { onclick: () => { run(r); toast(`„${r.name}“ wird ausgeführt`); } }, "Ausführen"),
            h("button.btn.small.ghost", { onclick: () => { run(r, true); toast("Test: nur im Protokoll"); } }, "Test"),
            h("button.btn.small.ghost", { onclick: edit(r) }, "Bearbeiten"),
            h("button.btn.small.ghost.danger", { onclick: async () => { if (await requireAdmin() && confirm(`„${r.name}“ löschen?`)) { save(list.filter((x) => x.id !== r.id)); rerender(); } } }, "Löschen")),
        ))),
  );
}
