// B – Routinen & Regeln. Gespeichert in der gemeinsamen Konfiguration, ausgeführt vom Zentrale-Programm.
import { h, toast } from "../ui/dom.js";
import { dialog, field, select, switchRow, copyText, download, ask } from "../ui/form.js";
import { shared, updateShared, newId } from "../core/shared.js";
import { state, publish } from "../core/mqtt.js";
import { requireAdmin } from "../core/admin.js";
import { has } from "../core/features.js";
import { fireLocal } from "../core/routines-local.js";
import { icon } from "../ui/icons.js";
import { emit } from "../core/events.js";
import { templateField, SAMPLE } from "../ui/template.js";
import { voiceMonkeyAnnounce } from "../core/wifi.js";
import { isTauri } from "../core/platform.js";

// Deutsche Stimmen von Amazon Polly (Voice Monkey „voice“); leer = Standardstimme des Echos
const VOICES = [["", "Standard (wie Alexa)"], ["Vicki", "Vicki"], ["Marlene", "Marlene"], ["Daniel", "Daniel"], ["Hans", "Hans"]];
const CHIMES = [["", "Kein Ton"], ["soundbank://soundlibrary/alarms/air_horns/air_horn_01", "Signalhorn"]];
const fetchFn = async (...a) => (isTauri ? (await import("@tauri-apps/plugin-http")).fetch : fetch)(...a);

async function testAnnounce(a, btn) {
  const token = shared().voicemonkey?.token;
  if (!token) return toast("Erst den Voice-Monkey-Token eintragen (Einstellungen → Alexa & Google)");
  if (!a.device) return toast("Erst den Lautsprecher eintragen");
  btn.disabled = true;
  try { const t = await voiceMonkeyAnnounce(token, a, SAMPLE, fetchFn); toast(`Alexa sagt: „${t}“`); }
  catch (e) { toast(e.message); }
  btn.disabled = false;
}

function announceRow(a, del) {
  a.speech ??= "Einsatz. {stichwort}. {adresse}";
  return h("div.item", {},
    h("div.item-head", {}, h("b", {}, "Alexa sagt an"), h("button.btn.small.ghost.danger", { onclick: del }, "Entfernen")),
    field("Lautsprecher", h("input.input", { value: a.device || "", placeholder: "z. B. echo-flur", autocomplete: "off", spellcheck: "false", onchange: (e) => (a.device = e.target.value.trim()) }),
      "ID des Echos aus voicemonkey.io → Devices → Speakers. Mehrere Echos = mehrere Aktionen."),
    templateField("Text", a.speech, (v) => (a.speech = v), { multiline: true, maxlength: 400, keys: ["stichwort", "adresse", "einheit", "uhrzeit", "person", "text"],
      hint: "Fehlt ein Wert (z. B. keine Adresse beim Melder-Alarm), fällt er einfach weg." }),
    h("div.fields", {},
      field("Stimme", select(VOICES, a.voice || "", (v) => (a.voice = v))),
      field("Ton davor", select(CHIMES, a.chime || "", (v) => (a.chime = v)))),
    switchRow("Auf dem Echo Show anzeigen", "Zeigt den Text groß auf rotem Grund, solange Alexa spricht.", a.show, (v) => (a.show = v)),
    h("div.row", {}, h("button.btn.small", { onclick: (e) => testAnnounce(a, e.currentTarget) }, "Mit Beispiel testen")));
}

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

/** Vorlage: Alexa sagt den Einsatz an */
const templateAnnounce = () => ({
  ...blank(), name: "Alarm: Alexa sagt an",
  actions: [{ type: "announce", device: "", speech: "Einsatz. {stichwort}. {adresse}", chime: "soundbank://soundlibrary/alarms/air_horns/air_horn_01" }],
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
    if (a.type === "announce") return announceRow(a, del);
    if (a.type === "restore") return h("div.item", {}, h("div.item-head", {}, h("b", {}, "Vorherigen Zustand wiederherstellen"), h("button.btn.small.ghost.danger", { onclick: del }, "Entfernen")));
    a.payload ||= {};
    return h("div.item", {},
      h("div.item-head", {}, h("b", {}, "Gerät schalten"), h("button.btn.small.ghost.danger", { onclick: del }, "Entfernen")),
      h("div.fields", {},
        field("Gerät oder Gruppe", select(devNames(), a.device || "", (v) => (a.device = v))),
        field("Zustand", select([["ON", "An"], ["OFF", "Aus"], ["TOGGLE", "Umschalten"]], a.payload.state || "ON", (v) => (a.payload.state = v))),
        field("Helligkeit %", h("input.input", { type: "number", min: 1, max: 100, value: a.payload.brightness ? Math.round((a.payload.brightness / 254) * 100) : "", placeholder: "unverändert", onchange: (e) => { if (e.target.value) a.payload.brightness = Math.round((Number(e.target.value) / 100) * 254); else delete a.payload.brightness; } })),
        field("Farbe", h("input.color-input", { type: "color", value: a.payload.color?.hex || "#ffffff", onchange: (e) => (a.payload.color = { hex: e.target.value }) })),
        field("Übergang (s)", h("input.input", { type: "number", min: 0, value: a.transition ?? 1, onchange: (e) => (a.transition = Number(e.target.value)) }), "C4 – sanft hochdimmen"),
        field("Danach aus nach (s)", h("input.input", { type: "number", min: 0, value: a.offAfterSec || 0, onchange: (e) => (a.offAfterSec = Number(e.target.value)) }), "0 = bleibt an")),
      h("label.row", { style: "gap:6px" }, h("input", { type: "checkbox", checked: a.payload.color?.hex !== undefined, onchange: (e) => { if (!e.target.checked) delete a.payload.color; else a.payload.color = { hex: "#ff3b2f" }; } }), "Farbe setzen"),
    );
  };


/** Editor einer Routine in der rechten Spalte (gibt den Inhalt zurück). */
function editor(routine, rerender) {
  const r = structuredClone(routine);
  const body = h("div", { style: "display:grid;gap:16px" });
  // Fertig (Speichern/Abbrechen): zurück zur Ansicht der Routine
  const close = () => { editing = null; draft = null; if (location.hash === `#/routinen/${r.id}`) rerender(); else location.hash = `#/routinen/${r.id}`; };

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
        h("button.btn.small", { onclick: () => { r.actions.push({ type: "announce", device: "", speech: "Einsatz. {stichwort}. {adresse}" }); paint(); } }, "+ Alexa sagt an"),
        h("button.btn.small", { onclick: () => { r.actions.push({ type: "voicemonkey", device: "" }); paint(); } }, "+ Alexa-Routine"),
        has.pi() && h("button.btn.small", { onclick: () => { r.actions.push({ type: "restore" }); paint(); } }, "+ Vorher-Zustand"))),

    // B8 – Rückkehr
    field("Vorherigen Zustand wiederherstellen nach (Minuten)", h("input.input", { type: "number", min: 0, value: r.restoreAfterMin || 0, onchange: (e) => (r.restoreAfterMin = Number(e.target.value)) }), "0 = nicht automatisch. „Wieder da“ geht immer per Knopf."),

    h("div.row", {},
      h("button.btn.primary", { onclick: () => { const list = (shared().routines || []).filter((x) => x.id !== r.id); save([...list, r]); close(); rerender(); toast("Routine gespeichert"); } }, "Speichern"),
      h("button.btn", { onclick: () => close() }, "Abbrechen")),
  ].filter(Boolean));

  paint();
  return body;
}

// ── Seite: zwei Spalten (Liste links, Routine rechts) ──
let editing = null;   // id der Routine, die rechts bearbeitet wird
let draft = null;     // neue, noch nicht gespeicherte Routine

const sel = () => decodeURIComponent(location.hash.replace("#/", "").split("/")[1] || "");
const isPhone = () => window.matchMedia("(max-width: 760px)").matches;

export function routinesView(rerender) {
  const list = shared().routines || [];
  const s = shared();
  const startEdit = async (r, isNew = false) => {
    if (!(await requireAdmin())) return;
    editing = r.id; draft = isNew ? r : null;
    if (location.hash !== `#/routinen/${r.id}`) location.hash = `#/routinen/${r.id}`; else rerender();
  };

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

  const all = draft ? [...list, draft] : list;
  const key = sel();
  const current = key === "allgemein" ? "allgemein" : all.find((r) => r.id === key)?.id || (isPhone() ? null : all[0]?.id || "allgemein");
  if (editing && editing !== current) { editing = null; draft = null; }

  const item = (r) => h("a.split-item", { href: `#/routinen/${r.id}`, "aria-current": current === r.id ? "page" : null },
    h("span.ico", { style: `--a:var(${r.enabled ? "--c-routine" : "--text-2"})` }, icon("flow")),
    h("span.split-item-text", {}, h("b", {}, r.name), h("small", {}, r === draft ? "neu, noch nicht gespeichert" : r.enabled ? (TRIGGERS.find(([k]) => k === r.trigger?.type)?.[1] || "") : "ausgeschaltet")),
    h("span.chev", {}, icon("chev")));

  const listPane = h("aside.split-list", {},
    h("h1", {}, "Routinen"),
    h("div.row", { style: "padding:0 4px 12px;gap:8px" },
      h("button.btn.primary.small", { onclick: () => startEdit(blank(), true) }, "Neue Routine"),
      h("button.btn.small", { onclick: () => startEdit(template(), true) }, "Vorlage Licht"),
      h("button.btn.small", { onclick: () => startEdit(templateAnnounce(), true) }, "Vorlage Ansage")),
    has.pi() && !state.dienst?.online && h("p.split-warn", {}, "Zentrale-Programm nicht erreichbar – Routinen laufen erst, wenn es läuft."),
    h("nav.split-nav", { "aria-label": "Routinen" },
      all.length === 0 ? h("p.hint", { style: "padding:8px 10px" }, "Noch keine Routine. Tipp: „Vorlage Licht“ oder „Vorlage Ansage“ legt eine fertige Routine an.") : all.map(item),
      h("div.split-grp", {}, "Allgemein"),
      h("a.split-item", { href: "#/routinen/allgemein", "aria-current": current === "allgemein" ? "page" : null },
        h("span.ico", { style: "--a:var(--c-app)" }, icon("home")),
        h("span.split-item-text", {}, h("b", {}, "Urlaubsmodus & Export"), h("small" + (s.vacation ? ".warn" : ""), {}, s.vacation ? "Urlaubsmodus an" : "Wieder da, Sichern, Laden")),
        h("span.chev", {}, icon("chev")))));

  let detail = null;
  if (current === "allgemein") {
    detail = h("section.split-detail", { style: "--a:var(--c-app)" },
      h("a.split-back", { href: "#/routinen" }, icon("back"), "Routinen"),
      h("div.split-head", {}, h("span.ico.big", { style: "--a:var(--c-app)" }, icon("home")), h("div", {}, h("p.crumb", {}, "Routinen"), h("h2", {}, "Urlaubsmodus & Export"))),
      h("p.split-sub", {}, `Routinen laufen ${has.pi() ? "auf der Zentrale" : "auf dem Handy"}.`),
      h("section.card", {},
        switchRow("Urlaubsmodus", "Pausiert alle Routinen außer „Nur per Knopf“ – und die Abfrage bei Alarm (wie „Inaktiv“ auf Start).", s.vacation, async (v) => { if (await requireAdmin()) updateShared({ vacation: v }); else rerender(); }),
        has.pi() && h("div.row", {}, h("button.btn", { onclick: () => { emit("restore"); publish("heimalarm/cmd/restore", {}); toast("Vorheriger Zustand wird wiederhergestellt"); } }, "Wieder da – Zustand zurück"))),
      h("section.card", {}, h("h3", {}, "Sichern und laden"),
        h("p.hint", {}, "Alle Routinen als Text – zum Sichern oder für eine andere Zentrale."),
        h("div.row", {},
          h("button.btn.small", { onclick: async () => { if (await copyText(exportJson())) toast("In die Zwischenablage kopiert"); download("heimalarm-routinen.json", exportJson()); } }, "Exportieren"),
          h("button.btn.small", { onclick: importDialog }, "Importieren"))));
  } else if (current) {
    const r = all.find((x) => x.id === current);
    detail = h("section.split-detail", { style: "--a:var(--c-routine)" },
      h("a.split-back", { href: "#/routinen" }, icon("back"), "Routinen"),
      h("div.split-head", {},
        h("span.ico.big", { style: `--a:var(${r.enabled ? "--c-routine" : "--text-2"})` }, icon("flow")),
        h("div", { style: "flex:1;min-width:0" }, h("p.crumb", {}, "Routinen"), h("h2", {}, r.name)),
        r !== draft && h("input", { type: "checkbox", role: "switch", class: "mini-switch", checked: r.enabled, "aria-label": "Routine aktiv",
          onchange: async (e) => { if (await requireAdmin()) save(list.map((x) => (x.id === r.id ? { ...x, enabled: e.target.checked } : x))); else rerender(); } })),
      editing === r.id
        ? h("section.card", {}, editor(r, rerender))
        : [
          h("section.card", {}, h("p", {}, describe(r)),
            h("div.row", {},
              h("button.btn.primary.small", { onclick: () => { run(r); toast(`„${r.name}“ wird ausgeführt`); } }, "Ausführen"),
              h("button.btn.small", { onclick: () => { run(r, true); toast("Test: nur im Protokoll"); } }, "Test"),
              h("button.btn.small", { onclick: () => startEdit(r) }, "Bearbeiten"),
              h("button.btn.small.ghost.danger", { onclick: async () => { if (await requireAdmin() && await ask(`„${r.name}“ löschen?`)) { save(list.filter((x) => x.id !== r.id)); location.hash = "#/routinen"; rerender(); } } }, "Löschen")))]);
  }
  return h("div.split" + (detail && current ? ".has-detail" : ""), {}, listPane, detail || h("section.split-detail.empty-pane", {}, h("p.empty", {}, "Routine links auswählen.")));
}
