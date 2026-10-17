// "Fährst du?" – Vollbild-Abfrage mit Countdown.
// Enter = Ich fahre, Esc = Ich fahre nicht.
import { h, fmtTime } from "../ui/dom.js";
import { settings } from "../core/settings.js";
import { decide } from "../core/engine.js";
import { ACTIONS, takeoverWindow } from "../core/pc.js";

let timer = null;

export function showTakeover(alarm) {
  const root = document.getElementById("takeover");
  const { countdownSec, onTimeout, action } = settings().pc;
  const test = !!alarm.test;
  let left = countdownSec;

  const num = h("span", {}, String(left));
  const ring = h("div.ring", { style: "--p:1", role: "timer", "aria-label": "Verbleibende Sekunden" }, num);
  const label = ACTIONS[action]?.label || action;

  const finish = (going, timeout = false) => {
    clearInterval(timer); timer = null;
    document.removeEventListener("keydown", keys);
    root.hidden = true; root.replaceChildren();
    takeoverWindow(false);
    decide(going, { test, timeout });
  };
  const keys = (e) => { if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); };

  root.replaceChildren(h("div.box", {},
    h("div.tag", {}, test ? "Testalarm · es passiert nichts" : `Einsatz · ${fmtTime(alarm.ts)}`),
    h("h1", {}, "Fährst du?"),
    ring,
    h("div.actions", {},
      h("button.btn.primary", { onclick: () => finish(true) }, "Ich fahre"),
      h("button.btn.secondary", { onclick: () => finish(false) }, "Ich fahre nicht"),
    ),
    h("p.note", {}, onTimeout === "run" ? `Ohne Antwort: ${label}` : "Ohne Antwort: keine Aktion"),
    h("p.keys", {}, "Enter = Ich fahre · Esc = Ich fahre nicht"),
  ));
  root.hidden = false;
  takeoverWindow(true);
  document.addEventListener("keydown", keys);
  root.querySelector(".btn.primary").focus();

  clearInterval(timer);
  timer = setInterval(() => {
    left -= 1;
    num.textContent = String(Math.max(left, 0));
    ring.style.setProperty("--p", String(Math.max(left, 0) / countdownSec));
    if (left <= 0) finish(onTimeout === "run", true);
  }, 1000);
}
