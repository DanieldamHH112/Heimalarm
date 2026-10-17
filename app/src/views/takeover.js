// „Fährst du?“ – Vollbild-Abfrage mit Countdown (D1–D6).
// Enter = fahren, Esc = bleiben. Texte und Ton aus den Einstellungen.
import { h, fmtTime } from "../ui/dom.js";
import { settings } from "../core/settings.js";
import { decide } from "../core/engine.js";
import { ACTIONS, takeoverWindow } from "../core/pc.js";
import { startAlarmLoop, stopAlarmLoop } from "../ui/sound.js";

let timer = null;

export function showTakeover(alarm) {
  const root = document.getElementById("takeover");
  const p = settings().pc;
  const test = Boolean(alarm.test);
  const total = Math.max(5, p.countdownSec);
  let left = total;

  const num = h("span", {}, String(left));
  const ring = h("div.ring", { style: "--p:1", role: "timer", "aria-label": "Verbleibende Sekunden" }, num);
  const label = ACTIONS[p.action]?.label || p.action;
  const extra = [alarm.keyword, alarm.unit].filter(Boolean).join(" · ");

  const finish = (going, timeout = false) => {
    clearInterval(timer); timer = null;
    stopAlarmLoop();
    document.removeEventListener("keydown", keys);
    root.hidden = true; root.replaceChildren();
    takeoverWindow(false);
    decide(going, { test, timeout });
  };
  const keys = (e) => { if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); };

  root.replaceChildren(h("div.box", {},
    h("div.tag", {}, alarm.probe ? "Komplettprobe · PC-Aktion nur angezeigt" : test ? "Testalarm · es passiert nichts" : `Einsatz · ${fmtTime(alarm.ts)}`),
    h("h1", {}, p.title || "Fährst du?"),
    extra && h("p.meta-big", {}, extra),
    ring,
    h("div.actions", {},
      h("button.btn.primary", { onclick: () => finish(true) }, p.goText || "Ich fahre"),
      h("button.btn.secondary", { onclick: () => finish(false) }, p.stayText || "Ich fahre nicht")),
    h("p.note", {}, p.onTimeout === "run" ? `Ohne Antwort: ${label}` : "Ohne Antwort: keine Aktion"),
    h("p.keys", {}, "Enter = fahren · Esc = bleiben"),
  ));
  root.hidden = false;
  takeoverWindow(true);
  if (p.sound) startAlarmLoop();
  document.addEventListener("keydown", keys);
  root.querySelector(".btn.primary").focus();

  clearInterval(timer);
  timer = setInterval(() => {
    left -= 1;
    num.textContent = String(Math.max(left, 0));
    ring.style.setProperty("--p", String(Math.max(left, 0) / total));
    if (left <= 0) finish(p.onTimeout === "run", true);
  }, 1000);
}
