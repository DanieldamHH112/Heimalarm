import { has } from "../core/features.js";
import { h, fmtTime, fmtDate, toast } from "../ui/dom.js";
import { field, dialog, copyText, download } from "../ui/form.js";
import { getLog, clearLog } from "../core/log.js";
import { state } from "../core/mqtt.js";
import { isAndroid } from "../core/platform.js";
import {
  statsEntries, getEinsatz, editEinsatz, deleteEinsatz, clearStats,
  summary, years, yearReview, category, toCsv, ANSWER_TEXT, unitsOf,
} from "../core/stats.js";

const FILTERS = [
  ["einsaetze", "Einsätze", () => has.logbuch()], ["", "Alle"], ["alarm", "Alarme"], ["action", "Aktionen"], ["warn", "Warnungen"], ["zentrale", "Zentrale", () => has.pi()],
];
let filter = null;
let reviewYear = null;
let shown = 20;

const fmtDay = (ts) => new Date(ts).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
const fmtHm = (ts) => new Date(ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const fmtSec = (s) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`);

// ── Einsatz-Detail ──────────────────────────────────────────────────────────

const row = (label, value, mono) => value != null && value !== "" && h("div.kv", {}, h("dt", {}, label), h(mono ? "dd.mono" : "dd", {}, String(value)));
const fact = (label, value) => value && h("li", {}, h("span", {}, label), h("b", {}, value));
const head = (sub, action) => h("header.page-head", {}, h("div", {}, h("h1", {}, "Protokoll"), h("p", {}, sub)), action);

function detailDialog(id, rerender) {
  const e = getEinsatz(id);
  if (!e) return;
  const vehicle = h("input.input", { value: e.vehicle || "", placeholder: "z. B. HLF 20" });
  const role = h("input.input", { value: e.role || "", placeholder: "z. B. Atemschutz, Maschinist" });
  const note = h("textarea.input", { rows: 4, placeholder: "Was war los, was ist aufgefallen …" });
  note.value = e.note || "";
  const reaction = e.answerTs ? Math.round((e.answerTs - e.ts) / 1000) : null;
  const close = dialog(e.keyword || "Einsatz",
    h("dl.kvs", {},
      row("Zeit", `${fmtDay(e.ts)}, ${fmtTime(e.ts)}`),
      row("Art", category(e)),
      row("Stichwort", e.keyword),
      row(unitsOf(e).length > 1 ? "Einheiten" : "Einheit", unitsOf(e).join(", ")),
      row("Rückalarm", e.recall && `${fmtHm(e.recall)} – Einsatz zurückgenommen`),
      row("Alarmende", e.endTs && `${fmtDay(e.endTs)}, ${fmtHm(e.endTs)}`),
      row("Adresse", e.address),
      row("Text", e.text),
      row("Quellen", (e.sources || [e.source]).filter(Boolean).join(", ")),
      row("Antwort", ANSWER_TEXT[e.answer]),
      row("Reaktion", reaction != null && reaction >= 0 ? fmtSec(reaction) : null),
      row("Empfangen auf", [e.device, e.via && `über ${e.via}`].filter(Boolean).join(" ")),
      row("Alarm-App", e.app, true),
      row("Divera-ID", e.diveraId, true),
      ...Object.entries(e.details || {}).map(([k, v]) => row(k, v, true))),
    e.address && h("div.row", {}, h("a.btn.small.ghost", { href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.address)}`, target: "_blank", rel: "noopener" }, "Adresse in Karte öffnen")),
    field("Fahrzeug", vehicle),
    field("Funktion", role),
    field("Notiz", note, "Nur für dich – wird mit deinen anderen Geräten abgeglichen."),
    h("div.row", {},
      h("button.btn.primary", { onclick: () => { editEinsatz(id, { vehicle: vehicle.value.trim(), role: role.value.trim(), note: note.value.trim() }); close(); rerender(); toast("Gespeichert"); } }, "Speichern"),
      h("button.btn.ghost.danger", { onclick: () => { if (confirm("Diesen Einsatz löschen?")) { deleteEinsatz(id); close(); rerender(); } } }, "Löschen")));
}

// ── Einsätze-Ansicht ────────────────────────────────────────────────────────

function barsList(entries, total) {
  const max = Math.max(1, ...entries.map(([, n]) => n));
  return h("ul.hbars", {}, entries.map(([k, n]) => h("li", {},
    h("span.hbar-label", {}, k),
    h("span.hbar-track", {}, h("span.hbar-fill", { style: `width:${Math.round((n / max) * 100)}%` })),
    h("span.hbar-n", {}, total ? `${n} · ${Math.round((n / total) * 100)} %` : String(n)))));
}

function statsCard(rerender) {
  const s = summary();
  const max = Math.max(1, ...s.months.map((m) => m.count));
  return h("section.card", {},
    h("div.card-head", {}, h("h2", {}, "Statistik"),
      h("button.btn.small.ghost", { onclick: () => { if (confirm("Alle Einsätze und die Statistik löschen? Das gilt auch für deine anderen Geräte.")) { clearStats(); rerender(); } } }, "Alles löschen")),
    h("div.stats-grid", {},
      h("div.stat", {}, h("b", {}, String(s.year)), h("span", {}, `Einsätze ${new Date().getFullYear()}`)),
      h("div.stat", {}, h("b", {}, String(s.last30)), h("span", {}, "letzte 30 Tage")),
      h("div.stat", {}, h("b", {}, s.goRate == null ? "–" : `${s.goRate} %`), h("span", {}, s.answered ? `„Ich fahre“ (${s.answered} beantwortet)` : "„Ich fahre“")),
      h("div.stat", {}, h("b", {}, String(s.night)), h("span", {}, "nachts (22–6 Uhr)"))),
    h("div.month-bars", { role: "img", "aria-label": `Einsätze der letzten 12 Monate: ${s.months.map((m) => `${m.label} ${m.count}`).join(", ")}` },
      s.months.map((m) => h("div.bar", { title: `${m.label}: ${m.count}` },
        h("span.bar-n", {}, m.count ? String(m.count) : ""),
        h("span.bar-fill", { style: `height:${Math.round((m.count / max) * 100)}%` }),
        h("small", {}, m.label)))),
    h("h3.sub", {}, "Nach Art"),
    barsList(s.categories, s.total),
    s.sources.length > 0 && h("p.meta", {}, "Quellen: " + s.sources.map(([k, n]) => `${k} ${n}`).join(" · ")));
}

function reviewCard(rerender) {
  const ys = years();
  if (!ys.length) return null;
  if (!ys.includes(reviewYear)) reviewYear = ys[0];
  const r = yearReview(reviewYear);
  const diff = r.prev ? Math.round(((r.count - r.prev) / r.prev) * 100) : null;
  return h("section.card", {},
    h("div.card-head", {}, h("h2", {}, `Jahresrückblick ${reviewYear}`),
      ys.length > 1 && h("div.segmented", { role: "group", "aria-label": "Jahr" },
        ys.slice(0, 4).map((y) => h("button", { "aria-pressed": String(y === reviewYear), onclick: () => { reviewYear = y; rerender(); } }, String(y))))),
    h("div.stats-grid", {},
      h("div.stat", {}, h("b", {}, String(r.count)), h("span", {}, diff == null ? "Einsätze" : `Einsätze (${diff >= 0 ? "+" : ""}${diff} % zum Vorjahr)`)),
      h("div.stat", {}, h("b", {}, r.goRate ? `${r.goRate.pct} %` : "–"), h("span", {}, "„Ich fahre“")),
      h("div.stat", {}, h("b", {}, r.reactionSec != null ? fmtSec(r.reactionSec) : "–"), h("span", {}, "typische Reaktionszeit")),
      h("div.stat", {}, h("b", {}, String(r.night)), h("span", {}, `nachts · ${r.weekend} am Wochenende`))),
    h("ul.review-facts", {},
      fact("Meiste Einsätze im", r.topMonth && `${r.topMonth.name} (${r.topMonth.n})`),
      fact("Häufigster Wochentag", r.topDay && `${r.topDay.name} (${r.topDay.n})`),
      fact("Häufigste Uhrzeit", r.topHour && `${r.topHour.name} (${r.topHour.n})`),
      fact("Häufigste Art", r.categories[0] && `${r.categories[0][0]} (${r.categories[0][1]})`)),
    r.keywords.length > 0 && [h("h3.sub", {}, "Häufigste Stichworte"), barsList(r.keywords)],
    h("div.row", {},
      h("button.btn.small", { onclick: () => exportCsv(reviewYear) }, `CSV ${reviewYear}`),
      h("button.btn.small.ghost", { onclick: () => exportCsv() }, "CSV alle Jahre")));
}

async function exportCsv(year) {
  const csv = toCsv(year);
  const name = `heimalarm-einsaetze${year ? "-" + year : ""}.csv`;
  if (isAndroid) { toast((await copyText(csv)) ? "CSV in die Zwischenablage kopiert" : "Kopieren nicht möglich"); return; }
  download(name, csv);
  toast(`${name} gespeichert`);
}

function einsaetzeList(rerender) {
  const items = statsEntries().filter((e) => !e.deleted).toReversed();
  if (!items.length) return h("section.card", {}, h("p.empty", {}, "Noch kein Einsatz. Jede echte Alarmierung landet hier mit allen Infos – Tests nicht."));
  return h("section.card", {},
    h("div.card-head", {}, h("h2", {}, "Einsätze"), h("span.meta", {}, `${items.length} gespeichert`)),
    h("ul.einsaetze", {}, items.slice(0, shown).map((e) => h("li", {},
      h("button.einsatz", { onclick: () => detailDialog(e.id, rerender) },
        h("span.einsatz-time", {}, h("b", {}, fmtHm(e.ts)), h("small", {}, fmtDay(e.ts))),
        h("span.einsatz-main", {},
          h("b", {}, e.keyword || "Alarm"),
          h("small", {}, [category(e), e.address, (e.sources || [e.source]).filter(Boolean).join(", ")].filter(Boolean).join(" · ")),
          (e.note || e.vehicle) && h("small.einsatz-note", {}, [e.vehicle, e.role, e.note].filter(Boolean).join(" · "))),
        e.recall ? h("span.chip.warn", {}, "Rückalarm") : e.answer && h("span.chip" + (e.answer === "go" ? ".ok" : ""), {}, ANSWER_TEXT[e.answer]))))),
    items.length > shown && h("div.row", {}, h("button.btn.small.ghost", { onclick: () => { shown += 30; rerender(); } }, `Weitere ${Math.min(30, items.length - shown)} anzeigen`)));
}

// ── Seite ──────────────────────────────────────────────────────────────────

export function logView(rerender) {
  if (filter === null) filter = has.logbuch() ? "einsaetze" : "";   // erster Besuch: Einsätze, wenn das Logbuch an ist
  if (filter === "einsaetze" && !has.logbuch()) filter = "";
  const tabs = h("div.segmented.scroll", { role: "group", "aria-label": "Filter" },
    FILTERS.filter(([, , show]) => !show || show()).map(([k, label]) => h("button", { "aria-pressed": String(filter === k), onclick: () => { filter = k; shown = 20; rerender(); } }, label)));

  if (filter === "einsaetze") {
    const any = statsEntries().some((e) => !e.deleted);
    return h("div.page", {},
      head(has.stats() ? "Jede Alarmierung mit allen Infos, Notizen und Statistik." : "Jede Alarmierung mit allen Infos und Notizen."),
      tabs,
      einsaetzeList(rerender),
      any && has.stats() && statsCard(rerender),
      any && has.stats() && reviewCard(rerender),
      any && !has.stats() && h("section.card", {}, h("div.card-head", {}, h("h2", {}, "Export")),
        h("p.hint", {}, "Alle Einsätze als Tabelle für Excel. Statistik und Jahresrückblick lassen sich unter Einstellungen → Funktionen einschalten."),
        h("div.row", {}, h("button.btn.small", { onclick: () => exportCsv() }, "CSV exportieren"))));
  }

  const items = filter === "zentrale" ? state.zlog.filter(Boolean) : getLog(filter);
  let day = "";
  const list = h("ul.log", {});
  for (const e of items) {
    const d = fmtDate(e.ts);
    if (d !== day) { day = d; list.append(h("li", { style: "grid-template-columns:1fr;border-top:0;padding-top:16px" }, h("small", {}, d))); }
    list.append(h("li." + e.kind, {}, h("time", {}, fmtTime(e.ts)), h("span.ico", {}), h("div", {}, e.text, e.detail && h("small", {}, e.detail))));
  }
  return h("div.page", {},
    head(filter === "zentrale" ? "Protokoll der Zentrale: Routinen, Webhooks, Selbsttest." : "Was wann passiert ist, gemacht oder ausgeführt wurde.",
      h("button.btn.small", { onclick: () => { if (confirm("Protokoll wirklich leeren? Die Einsätze bleiben erhalten.")) { clearLog(); rerender(); } } }, "Leeren")),
    tabs,
    h("section.card", {}, items.length ? list : h("p.empty", {}, "Noch keine Einträge.")),
  );
}
