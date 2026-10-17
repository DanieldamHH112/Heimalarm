// E3 – Übersicht / Dashboard: alles Wichtige auf einen Blick.
import { h, fmtAgo, fmtTime, fmtDate, toast } from "../ui/dom.js";
import { state, publish } from "../core/mqtt.js";
import { shared } from "../core/shared.js";
import { settings, isConfigured } from "../core/settings.js";
import { getLog } from "../core/log.js";
import { ACTIONS, wakeOnLan } from "../core/pc.js";
import { testAlarm, simulateContact, engine, answerApps } from "../core/engine.js";
import { setDiveraStatus, divera, loadDivera } from "../core/divera.js";
import { hasPcFeatures, platformName, isTauri } from "../core/platform.js";
import { themeToggle } from "../ui/theme.js";

const chip = (kind, text) => h("span.chip" + (kind ? "." + kind : ""), {}, text);

function uptime(sec) {
  if (!Number.isFinite(sec)) return "–";
  const d = Math.floor(sec / 86400), hr = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return d > 0 ? `${d} T ${hr} h` : hr > 0 ? `${hr} h ${m} min` : `${m} min`;
}

/** WLAN-Signal als 4 Balken + dBm */
function signal(rssi) {
  if (!Number.isFinite(rssi)) return h("span.muted", {}, "–");
  const bars = rssi > -55 ? 4 : rssi > -67 ? 3 : rssi > -78 ? 2 : 1;
  return h("span.signal", { title: `${rssi} dBm` },
    h("span.bars", { "data-bars": bars }, h("i"), h("i"), h("i"), h("i")), `${rssi} dBm`);
}

function setupCard() {
  const me = settings().alarm.me;
  return h("section.card.span-all", {},
    h("div.card-head", {}, h("h2", {}, "In 3 Schritten startklar")),
    h("ol.steps", {},
      h("li", {}, h("div", {}, "Zentrale eintragen", h("small", {}, "IP-Adresse des Raspberry Pi unter Einstellungen → Verbindung."))),
      h("li", {}, h("div", {}, "Kennung prüfen", h("small", {}, `Muss zum ESP32 passen (alarm/${me}).`))),
      h("li", {}, h("div", {}, "Testalarm auslösen", h("small", {}, "Zeigt die Abfrage, ohne dass etwas passiert."))),
    ),
    h("div.row", {}, h("a.btn.primary", { href: "#/einstellungen" }, "Einrichten")),
  );
}

const tile = (label, value, status) => h("div.tile", {}, h("span.tile-label", {}, label), h("b", {}, value), status);

function tiles() {
  const s = settings();
  const dev = state.devices[s.alarm.me];
  const apps = Object.values(state.clients).filter((c) => c.online).length;
  const alarms24 = getLog("alarm").filter((e) => Date.now() - e.ts < 86400e3).length;
  return h("div.tiles", {},
    tile("Zentrale", state.connected ? "Verbunden" : isConfigured() ? "Getrennt" : "Fehlt",
      state.connected ? chip("ok", s.broker.host || "aktiv") : chip(isConfigured() ? "bad" : "", isConfigured() ? "nicht erreichbar" : "nicht eingerichtet")),
    tile("Mein ESP32", !dev || dev.online === null ? "Kein Signal" : dev.online ? "Online" : "Offline",
      dev?.online ? chip("ok", `seit ${fmtAgo(dev.since).replace("vor ", "")}`) : chip(dev ? "bad" : "", dev ? `seit ${fmtTime(dev.since)}` : `alarm/${s.alarm.me}`)),
    tile("Apps verbunden", String(apps), chip(apps > 0 ? "ok" : "", apps > 0 ? "inkl. dieser" : "keine")),
    tile("Alarme 24 h", String(alarms24), chip(alarms24 > 0 ? "bad" : "", alarms24 > 0 ? fmtAgo(getLog("alarm")[0].ts) : "ruhig")),
  );
}

function espCard() {
  const me = settings().alarm.me;
  const list = Object.entries(state.devices).toSorted(([a], [b]) => (a === me ? -1 : b === me ? 1 : a.localeCompare(b)));
  return h("section.card", {},
    h("div.card-head", {}, h("h2", {}, "ESP32 an der Ladeschale")),
    list.length === 0
      ? h("p.hint", {}, "Noch kein ESP32 gemeldet. Er sendet unter ", h("code", {}, `alarm/${me}`), ".")
      : h("ul.rows", {}, list.map(([who, d]) => h("li", {},
          h("div.row-main", {},
            h("b", {}, who, who === me ? h("span.badge", {}, "ich") : null),
            d.online ? chip("ok", "online") : d.online === false ? chip("bad", "offline") : chip("", "unbekannt")),
          h("dl.facts", {},
            h("div", {}, h("dt", {}, "WLAN"), h("dd", {}, signal(d.rssi))),
            h("div", {}, h("dt", {}, "Laufzeit"), h("dd", {}, uptime(d.uptime))),
            h("div", {}, h("dt", {}, "IP"), h("dd.mono", {}, d.ip || "–")),
            h("div", {}, h("dt", {}, "Firmware"), h("dd", {}, d.version || "–")),
          ),
        ))),
  );
}

/** D11 – PC per Wake-on-LAN wecken: direkt (App) oder über den Zentralen-Dienst. */
function wake(c) {
  const viaZentrale = () => publish("heimalarm/cmd/wol", { mac: c.mac }) && toast(`Weckruf an „${c.name}“ über die Zentrale`);
  if (isTauri) wakeOnLan(c.mac).then(() => toast(`Weckruf an „${c.name}“ gesendet`)).catch(viaZentrale);
  else viaZentrale();
}

/** Schnellaktionen (statt Startbildschirm-Widget): Testalarm, Wieder da, manuelle Routinen */
function quickCard() {
  const manual = (shared().routines || []).filter((r) => r.enabled && r.trigger?.type === "manual");
  return h("section.card", {},
    h("div.card-head", {}, h("h2", {}, "Schnellaktionen")),
    h("div.quick", {},
      h("button.btn", { onclick: testAlarm }, "Testalarm"),
      h("button.btn", { onclick: () => simulateContact() && toast("Simulierter Alarm gesendet") }, "Kontakt simulieren"),
      h("button.btn", { onclick: () => publish("heimalarm/cmd/restore", {}) && toast("Vorheriger Zustand wird wiederhergestellt") }, "Wieder da"),
      ...manual.map((r) => h("button.btn", { onclick: () => publish("heimalarm/cmd/run", { id: r.id }) && toast(`„${r.name}“ läuft`) }, r.name))),
  );
}

function appsCard() {
  const myId = settings().device.id;
  const list = Object.entries(state.clients).toSorted(([, a], [, b]) => Number(b.online) - Number(a.online) || b.ts - a.ts);
  return h("section.card", {},
    h("div.card-head", {}, h("h2", {}, "Verbundene Apps")),
    list.length === 0
      ? h("p.hint", {}, state.connected ? "Nur diese App ist verbunden." : "Sichtbar, sobald die Zentrale verbunden ist.")
      : h("ul.rows", {}, list.map(([id, c]) => h("li", {},
          h("div.row-main", {},
            h("b", {}, c.name || c.platform, id === myId ? h("span.badge", {}, "dieses Gerät") : null),
            c.online ? chip("ok", "online") : chip("", `zuletzt ${fmtAgo(c.ts)}`)),
          h("p.hint", {}, `${c.platform} · Version ${c.version}`),
          !c.online && c.mac && h("div.row", {}, h("button.btn.small", { onclick: () => wake(c) }, "Aufwecken")),
        ))),
  );
}

function alarmsCard() {
  const alarms = getLog("alarm").slice(0, 5);
  const recent = alarms[0] && Date.now() - alarms[0].ts < 3600e3;
  return h("section.card" + (recent ? ".alarm" : ""), {},
    h("div.card-head", {}, h("h2", {}, "Letzte Einsätze"), h("a.link", { href: "#/protokoll" }, "Alle")),
    alarms.length === 0 ? h("p.hint", {}, "Bisher kein Alarm.")
      : h("ul.log", {}, alarms.map((e) => h("li.alarm", {},
          h("time", {}, fmtTime(e.ts)), h("span.ico", {}),
          h("div", {}, e.text, h("small", {}, `${fmtDate(e.ts)} · ${fmtAgo(e.ts)} · ${e.detail}`))))),
  );
}

function eventsCard() {
  const ev = getLog().filter((e) => e.kind !== "alarm").slice(0, 6);
  return h("section.card", {},
    h("div.card-head", {}, h("h2", {}, "Letzte Ereignisse"), h("a.link", { href: "#/protokoll" }, "Protokoll")),
    ev.length === 0 ? h("p.hint", {}, "Noch nichts passiert.")
      : h("ul.log", {}, ev.map((e) => h("li." + e.kind, {}, h("time", {}, fmtTime(e.ts)), h("span.ico", {}), h("div", {}, e.text, e.detail && h("small", {}, e.detail))))),
  );
}

function zigbeeCard() {
  const z = state.zigbee;
  return h("section.card", {},
    h("div.card-head", {}, h("h2", {}, h("a", { href: "#/geraete", style: "text-decoration:none" }, "Licht & Geräte")), z ? chip("ok", `${z.length} Geräte`) : chip("", "noch nicht eingerichtet")),
    z && z.length > 0
      ? h("ul.rows.compact", {}, z.slice(0, 8).map((d) => h("li", {}, h("div.row-main", {}, h("b", {}, d.friendly_name), h("span.hint", {}, d.definition?.description || d.type)))))
      : h("p.hint", {}, z ? "Zigbee2MQTT läuft, aber noch kein Gerät angelernt." : "Zigbee2MQTT auf der Zentrale starten, dann unter Geräte anlernen."),
  );
}

function pcCard() {
  const p = settings().pc;
  return h("section.card", {},
    h("div.card-head", {}, h("h2", {}, "Bei Alarm am PC"), h("a.link", { href: "#/einstellungen" }, "Ändern")),
    h("div.stat", {}, h("b", {}, ACTIONS[p.action]?.label), h("span", {}, `Countdown ${p.countdownSec} s · ohne Antwort ${p.onTimeout === "run" ? "ausführen" : "abbrechen"}`)),
  );
}

const sendAnswer = (going) => answerApps(going).then((ok) => toast(ok ? "Antwort gesendet" : "Nicht angekommen – siehe Protokoll"));

/** Eigener Einsatz läuft (max. 30 min): Antwort an Divera / aPager direkt vom Handy. */
function answerCard() {
  const a = engine.last, st = settings();
  const viaDivera = st.alarm.apps.divera.on && st.divera.key && (st.divera.answerGo || st.divera.statusGo || st.divera.answerStay || st.divera.statusStay);
  const apager = st.alarm.apps.apager.on && st.apager.key && st.apager.feedback;
  if (hasPcFeatures || !a?.own || a.test || Date.now() - a.ts > 30 * 60_000 || !(viaDivera || apager)) return null;
  return h("section.card.span-all.answer", {},
    h("div.card-head", {}, h("h2", {}, `Einsatz · ${fmtTime(a.ts)}`), a.keyword && h("span.chip.bad", {}, a.keyword)),
    a.address && h("p.meta", {}, a.address),
    h("div.row", {},
      h("button.btn.primary", { onclick: () => sendAnswer(true) }, st.pc.goText || "Ich fahre"),
      h("button.btn", { onclick: () => sendAnswer(false) }, st.pc.stayText || "Ich fahre nicht")),
    h("small.meta", {}, `Meldet an ${[viaDivera && "Divera", apager && "aPager"].filter(Boolean).join(" und ")}.`));
}

/** Eigener Divera-Status: anzeigen und mit einem Tipp ändern. */
function diveraCard() {
  const d = settings().divera;
  if (!settings().alarm.apps.divera.on || !d.key || !d.statuses.length) return null;
  return h("section.card.divera-card", {},
    h("div.card-head", {}, h("h2", {}, "Mein Divera-Status"), divera.ok === false && h("span.chip.bad", {}, "Fehler")),
    h("div.status-pills", { role: "group", "aria-label": "Status setzen" }, d.statuses.map((x) =>
      h("button.status-pill", { "aria-pressed": String(divera.current === x.id), style: x.color ? `--c:${x.color}` : "",
        onclick: () => setDiveraStatus(x.id).then((ok) => toast(ok ? `Status: ${x.name}` : "Nicht gesetzt")) }, x.name))),
    h("small.meta", {}, d.unit || "Divera 24/7"));
}

export function overview() {
  const s = settings();
  if (divera.current === null && s.divera.key && s.alarm.apps.divera.on && !divera.loading) { divera.loading = true; loadDivera().catch(() => {}); }
  return h("div.page", {},
    h("header.page-head", {},
      h("div", {}, h("h1", {}, "Übersicht"), h("p", {}, `${s.device.name || platformName} · Kennung `, h("code", {}, s.alarm.me))),
      h("div.row", {}, themeToggle("only-mobile"), h("button.btn.primary", { onclick: testAlarm }, "Testalarm")),
    ),
    !isConfigured() && setupCard(),
    answerCard(),
    tiles(),
    h("div.dash", {},
      h("div.dash-main", {}, alarmsCard(), espCard(), zigbeeCard()),
      h("div.dash-side", {}, diveraCard(), quickCard(), hasPcFeatures && pcCard(), appsCard(), eventsCard()),
    ),
  );
}
