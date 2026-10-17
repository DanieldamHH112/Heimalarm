// I – Test & Diagnose.
import { h, toast, fmtAgo, fmtTime, fmtDate } from "../ui/dom.js";
import { state, publish } from "../core/mqtt.js";
import { settings } from "../core/settings.js";
import { testAlarm, simulateContact, fullProbe } from "../core/engine.js";

let lastTest = null; // I3 – Ergebnis des letzten Verbindungstests

async function connectionTest(rerender) {
  const me = settings().alarm.me;
  const started = Date.now();
  lastTest = { running: true, checks: [] };
  rerender();
  publish("heimalarm/ping", String(started));
  await new Promise((r) => setTimeout(r, 2500));
  const esp = state.devices[me];
  const fresh = esp?.lastSeen && Date.now() - esp.lastSeen < settings().alarm.heartbeatSec * 1000;
  const pong = state.pong && state.pong.at >= started;
  lastTest = {
    ts: Date.now(),
    checks: [
      { name: "Zentrale (Mosquitto)", ok: state.connected, hint: state.connected ? settings().broker.host : "nicht verbunden" },
      { name: "Zentralen-Dienst", ok: Boolean(pong), hint: pong ? `Version ${state.pong.version} · ${state.pong.at - started} ms` : "keine Antwort" },
      { name: `ESP32 „${me}“`, ok: Boolean(esp?.online), hint: esp ? (esp.online ? (fresh ? "online, Lebenszeichen aktuell" : "online, aber lange kein Lebenszeichen") : "offline") : "noch nie gemeldet" },
      { name: "Zigbee2MQTT", ok: state.bridge === "online", hint: state.bridge || "nicht gefunden" },
      { name: "Andere Apps", ok: Object.values(state.clients).some((c) => c.online), hint: `${Object.values(state.clients).filter((c) => c.online).length} online` },
    ],
  };
  rerender();
}

const checkList = (checks) => h("ul.check-list", {}, checks.map((c) =>
  h("li." + (c.ok ? "ok" : "bad"), {}, h("span.dot"), h("div", {}, h("b", {}, c.name), h("div.meta", {}, c.hint || (c.ok ? "in Ordnung" : "Problem"))))));

export function diagnoseView(rerender) {
  const report = state.report;
  return h("div.page", {},
    h("header.page-head", {}, h("div", {}, h("h1", {}, "Test & Diagnose"), h("p", {}, "Alles gefahrlos ausprobieren, bevor es ernst wird."))),

    h("div.cards", {},
      h("section.card", {},
        h("h2", {}, "Testalarm"),
        h("p.hint", {}, "Nur diese App: zeigt die Abfrage, es passiert nichts. Routinen laufen nicht."),
        h("div.row", {}, h("button.btn.primary", { onclick: testAlarm }, "Testalarm"))),
      h("section.card", {},
        h("h2", {}, "Kontakt simulieren"),
        h("p.hint", {}, "Wie ein echter ESP32-Alarm über die Zentrale – an alle Geräte, Routinen nur im Testmodus."),
        h("div.row", {}, h("button.btn", { onclick: () => { if (simulateContact()) toast("Simulierter Alarm gesendet"); } }, "Simulieren"))),
      h("section.card", {},
        h("h2", {}, "Komplettprobe"),
        h("p.hint", {}, "Routinen schalten wirklich (Licht an). Die PC-Aktion wird nur angezeigt."),
        h("div.row", {}, h("button.btn", { onclick: () => { if (confirm("Komplettprobe starten? Licht und Geräte schalten wirklich.")) fullProbe(); } }, "Probe starten"))),
    ),

    h("section.card", {},
      h("div.card-head", {}, h("h2", {}, "Verbindungstest"),
        h("button.btn.small", { onclick: () => connectionTest(rerender), disabled: lastTest?.running }, lastTest?.running ? "Läuft …" : "Jetzt testen")),
      lastTest?.checks?.length ? checkList(lastTest.checks) : h("p.hint", {}, "Prüft Zentrale, Dienst, ESP32, Zigbee und andere Apps."),
      lastTest?.ts && h("p.meta", {}, `Getestet ${fmtTime(lastTest.ts)}`)),

    h("section.card", {},
      h("div.card-head", {}, h("h2", {}, "Wöchentlicher Selbsttest"),
        h("button.btn.small", { onclick: () => { publish("heimalarm/cmd/selftest", {}); toast("Selbsttest läuft auf der Zentrale"); } }, "Jetzt ausführen")),
      report ? [
        h("p.meta", {}, `${report.ok ? "Alles in Ordnung" : "Probleme gefunden"} · ${fmtDate(report.ts)} ${fmtTime(report.ts)} · ${fmtAgo(report.ts)}`),
        checkList(report.checks),
      ] : h("p.hint", {}, "Die Zentrale prüft jeden Sonntag um 10 Uhr alle Teile und legt hier einen Bericht ab.")),
  );
}
