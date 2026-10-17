import { h, fmtTime, fmtDate } from "../ui/dom.js";
import { getLog, clearLog } from "../core/log.js";
import { state } from "../core/mqtt.js";

const FILTERS = [
  ["", "Alle"], ["alarm", "Alarme"], ["action", "Aktionen"], ["warn", "Warnungen"], ["zentrale", "Zentrale"],
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
      h("button.btn.ghost", { onclick: () => { if (confirm("Protokoll wirklich leeren?")) { clearLog(); rerender(); } } }, "Leeren"),
    ),
    h("div.segmented", { role: "group", "aria-label": "Filter" },
      FILTERS.map(([k, label]) => h("button", { "aria-pressed": String(filter === k), onclick: () => { filter = k; rerender(); } }, label)),
    ),
    h("section.card", {}, items.length ? list : h("p.empty", {}, "Noch keine Einträge.")),
  );
}
