import { h, fmtAgo, fmtTime } from "../ui/dom.js";
import { state } from "../core/mqtt.js";
import { settings, isConfigured } from "../core/settings.js";
import { engine, testAlarm } from "../core/engine.js";
import { getLog } from "../core/log.js";
import { ACTIONS } from "../core/pc.js";
import { hasPcFeatures, platformName } from "../core/platform.js";

export function overview() {
  const s = settings();
  const me = s.alarm.me;
  const dev = state.devices[me];

  const setup = !isConfigured() && h("section.card",
    {},
    h("div.card-head", {}, h("h2", {}, "In 3 Schritten startklar")),
    h("ol.steps", {},
      h("li", {}, h("div", {}, "Zentrale eintragen", h("small", {}, "IP-Adresse des Raspberry Pi unter Einstellungen → Verbindung."))),
      h("li", {}, h("div", {}, "Kennung prüfen", h("small", {}, `Muss zum ESP32 passen (alarm/${me}).`))),
      h("li", {}, h("div", {}, "Testalarm auslösen", h("small", {}, "Zeigt die Abfrage, ohne dass etwas passiert."))),
    ),
    h("div.row", {}, h("a.btn.primary", { href: "#/einstellungen" }, "Einrichten")),
  );

  const conn = state.connected
    ? h("span.chip.ok", {}, "Zentrale verbunden")
    : isConfigured() ? h("span.chip.bad", {}, "Zentrale nicht erreichbar") : h("span.chip", {}, "Nicht eingerichtet");

  const esp = !dev ? h("span.chip", {}, "Noch kein Signal")
    : dev.online ? h("span.chip.ok", {}, `Online · ${fmtAgo(dev.since)}`)
    : h("span.chip.bad", {}, `Offline seit ${fmtTime(dev.since)}`);

  const last = engine.last || getLog("alarm")[0];
  const alarms24 = getLog("alarm").filter((e) => Date.now() - e.ts < 86400e3).length;

  return h("div.page", {},
    h("header.page-head", {},
      h("div", {}, h("h1", {}, "Übersicht"), h("p", {}, `${platformName} · Kennung `, h("code", {}, me))),
      h("button.btn.primary", { onclick: testAlarm }, "Testalarm"),
    ),
    setup,
    h("div.grid", {},
      h("section.card", {},
        h("div.card-head", {}, h("h2", {}, "Zentrale"), conn),
        h("p.hint", {}, s.broker.host ? h("code", {}, `${s.broker.host}:${s.broker.port}`) : "Noch keine Adresse eingetragen."),
      ),
      h("section.card", {},
        h("div.card-head", {}, h("h2", {}, "ESP32 an der Ladeschale"), esp),
        h("p.hint", {}, "Meldet den Relaiskontakt des Melders unter ", h("code", {}, `alarm/${me}`), "."),
      ),
      h("section.card" + (last && Date.now() - last.ts < 3600e3 ? ".alarm" : ""), {},
        h("div.card-head", {}, h("h2", {}, "Letzter Alarm")),
        last
          ? h("div.stat", {}, h("b", {}, fmtTime(last.ts)), h("span", {}, `${fmtAgo(last.ts)} · ${last.detail || last.source || ""}`))
          : h("p.hint", {}, "Bisher kein Alarm."),
        h("p.hint", {}, `${alarms24} Alarm${alarms24 === 1 ? "" : "e"} in den letzten 24 h`),
      ),
      hasPcFeatures && h("section.card", {},
        h("div.card-head", {}, h("h2", {}, "Bei Alarm am PC")),
        h("div.stat", {}, h("b", {}, ACTIONS[s.pc.action]?.label), h("span", {}, `nach ${s.pc.countdownSec} s ohne Antwort ${s.pc.onTimeout === "run" ? "ausführen" : "abbrechen"}`)),
        h("div.row", {}, h("a.btn", { href: "#/einstellungen" }, "Ändern")),
      ),
    ),
  );
}
