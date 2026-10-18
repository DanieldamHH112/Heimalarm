import { has } from "../core/features.js";
import { h, fmtTime, fmtDate } from "../ui/dom.js";
import { getLog, clearLog } from "../core/log.js";
import { state } from "../core/mqtt.js";
import { summary, clearStats } from "../core/stats.js";

/** Einsatz-Statistik (nur echte eigene Alarme, ohne Tests). */
function statsCard(rerender) {
  const s = summary();
  if (!s.total) return h("section.card", {}, h("h2", {}, "Statistik"), h("p.hint", {}, "Zählt ab dem ersten echten Einsatz – Tests werden nicht mitgezählt."));
  const max = Math.max(1, ...s.months.map((m) => m.count));
  return h("section.card", {},
    h("div.card-head", {}, h("h2", {}, "Statistik"),
      h("button.btn.small.ghost", { onclick: () => { if (confirm("Statistik zurücksetzen?")) { clearStats(); rerender(); } } }, "Zurücksetzen")),
    h("div.stats-grid", {},
      h("div.stat", {}, h("b", {}, String(s.year)), h("span", {}, `Einsätze ${new Date().getFullYear()}`)),
      h("div.stat", {}, h("b", {}, String(s.last30)), h("span", {}, "letzte 30 Tage")),
      h("div.stat", {}, h("b", {}, s.goRate == null ? "–" : `${s.goRate} %`), h("span", {}, s.answered ? `„Ich fahre“ (${s.answered} beantwortet)` : "„Ich fahre“")),
      h("div.stat", {}, h("b", {}, String(s.night)), h("span", {}, "nachts (22–6 Uhr)"))),
    h("div.bars", { role: "img", "aria-label": `Einsätze der letzten 12 Monate: ${s.months.map((m) => `${m.label} ${m.count}`).join(", ")}` },
      s.months.map((m) => h("div.bar", { title: `${m.label}: ${m.count}` },
        h("span.bar-n", {}, m.count ? String(m.count) : ""),
        h("span.bar-fill", { style: `height:${Math.round((m.count / max) * 100)}%` }),
        h("small", {}, m.label)))),
    s.sources.length > 0 && h("p.meta", {}, "Quellen: " + s.sources.map(([k, n]) => `${k} ${n}`).join(" · ")),
    h("p.meta", {}, `Insgesamt ${s.total} · nur auf diesem Gerät gespeichert`));
}

const FILTERS = [
  ["", "Alle"], ["alarm", "Alarme"], ["action", "Aktionen"], ["warn", "Warnungen"], ["zentrale", "Zentrale", () => has.pi()],
];
let filter = "";

export function logView(rerender) {
  const items = filter === "zentrale" ? state.zlog.filter(Boolean) : getLog(filter);
  let day = "";
  const list = h("ul.log", {});
  for (const e of items) {
    const d = fmtDate(e.ts);
    if (d !== day) { day = d; list.append(h("li", { style: "grid-template-columns:1fr;border-top:0;padding-top:16px" }, h("small", {}, d))); }
    list.append(h("li." + e.kind, {}, h("time", {}, fmtTime(e.ts)), h("span.ico", {}), h("div", {}, e.text, e.detail && h("small", {}, e.detail))));
  }

  return h("div.page", {},
    h("header.page-head", {},
      h("div", {}, h("h1", {}, "Protokoll"), h("p", {}, filter === "zentrale" ? "Protokoll der Zentrale: Routinen, Webhooks, Selbsttest." : "Was wann passiert ist, gemacht oder ausgeführt wurde.")),
      h("button.btn.small", { onclick: () => { if (confirm("Protokoll wirklich leeren?")) { clearLog(); rerender(); } } }, "Leeren"),
    ),
    h("div.segmented.scroll", { role: "group", "aria-label": "Filter" },
      FILTERS.filter(([, , show]) => !show || show()).map(([k, label]) => h("button", { "aria-pressed": String(filter === k), onclick: () => { filter = k; rerender(); } }, label)),
    ),
    filter !== "zentrale" && statsCard(rerender),
    h("section.card", {}, items.length ? list : h("p.empty", {}, "Noch keine Einträge.")),
  );
}
