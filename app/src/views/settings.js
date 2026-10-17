// Einstellungen. Alles wird sofort gespeichert; allgemeine Werte gleichen sich über die Zentrale ab.
import { h, toast } from "../ui/dom.js";
import { field, text, toggle, segmented, select, section, switchRow, copyText, download, dialog } from "../ui/form.js";
import { settings, set, get, replace, isConfigured } from "../core/settings.js";
import { shared, updateShared, sha256, newId } from "../core/shared.js";
import { connect, state, publish, APP_VERSION } from "../core/mqtt.js";
import { ACTIONS, setAutostart, hibernateEnabled, enableHibernate, macAddress } from "../core/pc.js";
import { hasPcFeatures, isAndroid, isTauri } from "../core/platform.js";
import { requireAdmin, isAdmin } from "../core/admin.js";
import { androidStatus, openBatterySettings, openNotificationAccess, setBackgroundService } from "../core/android.js";
import { applyTheme } from "../ui/theme.js";
import { playAlarmTone } from "../ui/sound.js";

const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|localhost$|[a-z0-9-]+\.local$|[a-z0-9-]+$)/iu;
let hibernateOn = null;
let android = null;

// ── Abschnitte ─────────────────────────────────────
function verbindung(rerender) {
  const host = settings().broker.host;
  return section("verbindung", "Verbindung", "Die Zentrale (Raspberry Pi) mit Mosquitto. Ohne sie gibt es keine Alarme.",
    h("div.fields", {},
      field("Adresse", text("broker.host", { placeholder: "z. B. 192.168.1.10", inputmode: "url", autocomplete: "off" }), "IP oder Name im Heimnetz"),
      field("Port", text("broker.port", { type: "number", min: 1, max: 65535 }), "WebSocket, Standard 9001"),
      field("Benutzer", text("broker.user", { autocomplete: "off" }), "Leer lassen, wenn nicht nötig"),
      field("Passwort", text("broker.pass", { type: "password", autocomplete: "off" }))),
    toggle("broker.tls", "Verschlüsselt (TLS)", "Nur aktivieren, wenn die Zentrale ein Zertifikat hat (H1)."),
    host && !PRIVATE.test(host) && h("div.banner.warn", {}, h("div", {}, h("b", {}, "Adresse liegt nicht im Heimnetz"), "Für unterwegs besser ein VPN (z. B. WireGuard) nutzen, statt die Zentrale ins Internet zu stellen (H3).")),
    h("div.row", {}, h("button.btn.primary", { onclick: () => { connect(); toast("Verbinde mit der Zentrale …"); setTimeout(rerender, 1500); } }, "Speichern & verbinden")),
  );
}

function alarm() {
  const me = settings().alarm.me;
  return section("alarm", "Alarm", "Wann die App einen Alarm erkennt.",
    h("div.fields", {},
      field("Meine Kennung", text("alarm.me", { autocomplete: "off" }), "Gleich wie im ESP32: alarm/<kennung>. Andere Kennungen werden nur gemeldet."),
      field("Sperrzeit (Sekunden)", text("alarm.lockoutSec", { type: "number", min: 0, max: 600 }), "Weitere Signale derselben Person zählen als derselbe Einsatz.")),
    toggle("alarm.mqtt", "Alarm vom ESP32", "Hauptweg: Relaiskontakt an der Ladeschale."),
    isAndroid && toggle("alarm.notifications", "Alarm aus Benachrichtigungen", "SYBOS oder aPager auf diesem Handy mitlesen."),
    isAndroid && settings().alarm.notifications && h("div.fields", {},
      field("Apps (Paketnamen)", text("alarm.filterApps"), "Kommagetrennt, Teile reichen. SYBOS = at.syPhone"),
      field("Schlüsselwörter", text("alarm.filterWords"), "Mindestens eines muss im Text stehen.")),
    toggle("alarm.testMode", "Testmodus", "Alle Alarme nur anzeigen – keine PC-Aktion (A11)."),
    h("p.meta", {}, "Aktuelle Kennung: ", h("code", {}, `alarm/${me}`)),
  );
}

function esp32() {
  const me = settings().alarm.me;
  const d = state.devices[me];
  const url = h("input.input", { placeholder: "http://192.168.1.10/alarm-ich.ota.bin", inputmode: "url" });
  const md5 = h("input.input", { placeholder: "MD5-Prüfsumme (zeigt ESPHome beim Bauen)", autocomplete: "off" });
  return section("esp32", "ESP32", "Einstellungen, die an den ESP32 gesendet werden.",
    h("div.fields", {},
      field("Mindestdauer Kontakt (ms)", text("alarm.minDurationMs", { type: "number", min: 10, max: 5000 }, {
        onSave: (v) => { if (publish(`alarm/${me}/number/min_duration/command`, String(v))) toast("An den ESP32 gesendet"); },
      }), `Kürzere Impulse werden ignoriert (A3). Aktuell im ESP32: ${d?.minDuration ?? "–"} ms`),
      field("Lebenszeichen erwartet alle (s)", text("alarm.heartbeatSec", { type: "number", min: 60, max: 3600 }), "Kommt so lange nichts, gibt es eine Warnung (A9)."),
      field("Offline-Warnung nach (s)", text("alarm.offlineWarnSec", { type: "number", min: 30, max: 3600 }), "Ist der ESP32 so lange offline, kommt eine Meldung (A8).")),
    h("div.field", {}, h("span", {}, "Firmware-Update über WLAN (A10)"), url, md5,
      h("small", {}, "Adresse einer mit ESPHome gebauten .ota.bin-Datei im Heimnetz und ihre MD5-Prüfsumme.")),
    h("div.row", {}, h("button.btn", { onclick: () => {
      if (!url.value.trim() || md5.value.trim().length !== 32) return toast("Bitte Adresse und 32-stellige MD5-Summe eintragen");
      if (confirm("Firmware jetzt auf den ESP32 spielen? Er startet danach neu.") && publish(`alarm/${me}/ota`, `${url.value.trim()}|${md5.value.trim()}`)) toast("Update gestartet");
    } }, "Firmware aufspielen")),
  );
}

function pc(rerender) {
  const p = settings().pc;
  if (hibernateOn === null) hibernateEnabled().then((v) => { hibernateOn = v; rerender(); }).catch(() => (hibernateOn = false));
  return section("pc", "PC bei Alarm", "Was nach der Abfrage „Fährst du?“ passiert.",
    h("div.field", {}, h("span", {}, "Aktion"),
      select(Object.entries(ACTIONS).map(([k, v]) => [k, v.label]), p.action, (v) => { set("pc.action", v); rerender(); }),
      h("small", {}, ACTIONS[p.action]?.hint)),
    p.action === "hibernate" && hibernateOn === false && h("div.banner.warn", {}, h("div", {},
      h("b", {}, "Ruhezustand ist in Windows ausgeschaltet"), "Ohne ihn fährt der PC nicht richtig herunter.",
      h("div.row", { style: "margin-top:8px" }, h("button.btn.small", { onclick: () => enableHibernate().then(() => { toast("Bitte die Windows-Abfrage bestätigen"); setTimeout(() => { hibernateOn = null; rerender(); }, 6000); }) }, "Ruhezustand einschalten")))),
    h("div.fields", {},
      field("Countdown (Sekunden)", text("pc.countdownSec", { type: "number", min: 5, max: 300 })),
      h("div.field", {}, h("span", {}, "Ohne Antwort"), segmented([["run", "Ausführen"], ["cancel", "Abbrechen"]], p.onTimeout, (v) => set("pc.onTimeout", v)))),
    h("div.fields", {},
      field("Überschrift", text("pc.title")), field("Knopf „fahren“", text("pc.goText")), field("Knopf „bleiben“", text("pc.stayText"))),
    toggle("pc.sound", "Ton während des Countdowns", "Gut hörbar, auch mit Kopfhörern (D5)."),
    p.sound && h("div.field", {}, h("span", {}, `Lautstärke ${p.volume} %`),
      h("div.row", {}, h("input", { type: "range", min: 10, max: 100, value: p.volume, style: "flex:1;accent-color:var(--signal)", onchange: (e) => { set("pc.volume", Number(e.target.value)); rerender(); } }),
        h("button.btn.small", { onclick: () => playAlarmTone(1500) }, "Ton testen"))),
    toggle("pc.stopMedia", "Medien vorher stoppen", "Musik und Videos anhalten (D8)."),
    field("Ausnahmen", text("pc.exceptions", { placeholder: "z. B. obs64.exe, Teams.exe" }), "Läuft eines davon, wird der PC nur gesperrt (D7)."),
    h("div.fields", {},
      field("Ruhezeit von", text("pc.quietFrom", { type: "time" }), "Keine Abfrage in diesem Zeitraum (D12)"),
      field("bis", text("pc.quietTo", { type: "time" }))),
    h("div.field", {}, h("span", {}, "Wake-on-LAN (D11)"),
      h("div.row", {}, h("code", {}, p.wolMac || "noch nicht ermittelt"),
        h("button.btn.small", { onclick: () => macAddress().then((m) => { set("pc.wolMac", m); connect(); rerender(); toast("MAC gespeichert – andere Geräte können diesen PC wecken"); }).catch((e) => toast(String(e))) }, "MAC ermitteln")),
      h("small", {}, "Im BIOS/Netzwerkadapter muss Wake-on-LAN aktiviert sein.")),
    toggle("pc.autostart", "Mit Windows starten", "Damit kein Alarm verpasst wird (D9).", (v) => setAutostart(v).catch(() => toast("Autostart konnte nicht geändert werden"))),
  );
}

function androidSection(rerender) {
  if (android === null) androidStatus().then((s) => { android = s; rerender(); }).catch(() => (android = { supported: false }));
  const s = android || {};
  return section("android", "Android", "Damit Alarme auch ankommen, wenn die App im Hintergrund ist.",
    switchRow("Hintergrund-Dienst", "Dauerhafte Mitteilung, Android beendet die App dann nicht.", settings().android.service, (v) => setBackgroundService(v).then(() => { android = null; rerender(); })),
    h("div.item", {}, h("div.item-head", {}, h("b", {}, "Akku-Optimierung (E6)"), s.batteryOptimized ? h("span.chip.bad", {}, "aktiv – bitte ausschalten") : h("span.chip.ok", {}, "ausgeschaltet")),
      s.batteryOptimized && h("button.btn.small", { onclick: () => openBatterySettings().then(() => setTimeout(() => { android = null; rerender(); }, 4000)) }, "Ausnahme erlauben")),
    h("div.item", {}, h("div.item-head", {}, h("b", {}, "Benachrichtigungen mitlesen"), s.notificationAccess ? h("span.chip.ok", {}, "erlaubt") : h("span.chip", {}, "nicht erlaubt")),
      !s.notificationAccess && h("button.btn.small", { onclick: () => openNotificationAccess() }, "Zugriff erlauben")),
  );
}

function geraet() {
  return section("geraet", "Dieses Gerät", "So erscheint die App bei den anderen unter „Verbundene Apps“.",
    field("Gerätename", text("device.name", { placeholder: hasPcFeatures ? "z. B. PC Arbeitszimmer" : "z. B. Handy Daniel", autocomplete: "off" }, { onSave: () => connect() })),
    toggle("notify.enabled", "Benachrichtigung bei Alarm", hasPcFeatures ? "Für Alarme anderer Personen. Eigene Alarme zeigen die Abfrage." : "Systemmeldung, auch im Hintergrund (E1)."),
    toggle("sync.enabled", "Einstellungen abgleichen", "Alarm-, Benachrichtigungs- und Darstellungs-Einstellungen gelten für alle Geräte an dieser Zentrale."),
  );
}

function personen(rerender) {
  const persons = shared().persons || [];
  const edit = async () => {
    if (!(await requireAdmin())) return;
    const id = h("input.input", { placeholder: "z. B. kollege" });
    const name = h("input.input", { placeholder: "z. B. Max" });
    const close = dialog("Person hinzufügen", field("Kennung", id, "Wie im ESP32: alarm/<kennung>"), field("Name", name),
      h("div.row", {}, h("button.btn.primary", { onclick: () => { if (!id.value.trim()) return; updateShared({ persons: [...persons, { id: id.value.trim(), name: name.value.trim() || id.value.trim() }] }); close(); rerender(); } }, "Hinzufügen")));
  };
  return section("personen", "Personen", "Wer an dieser Zentrale alarmiert wird. Routinen können pro Person gelten (G1, G2).",
    h("ul.rows", {}, persons.map((p) => h("li", {}, h("div.row-main", {},
      h("b", {}, p.name, h("span.badge", {}, p.id)),
      h("button.btn.small.ghost.danger", { onclick: async () => { if (await requireAdmin() && confirm(`${p.name} entfernen?`)) { updateShared({ persons: persons.filter((x) => x.id !== p.id) }); rerender(); } } }, "Entfernen"))))),
    h("div.row", {}, h("button.btn.small", { onclick: edit }, "Person hinzufügen")),
  );
}

function zentrale(rerender) {
  const s = shared();
  const host = settings().broker.host || "<zentrale>";
  const hook = s.webhookSecret ? `http://${host}:8080/alarm/${s.webhookSecret}?who=${settings().alarm.me}` : "";
  return section("zentrale", "Zentrale", "Gilt für alle Geräte. Änderungen nur mit Admin-Rechten.",
    h("p.meta", {}, `Dienst: ${state.dienst?.online ? "läuft, Version " + state.dienst.version : "nicht erreichbar"}`),
    h("div.fields", {},
      field("Breitengrad", h("input.input", { type: "number", step: "0.01", value: s.location?.lat, onchange: async (e) => { if (await requireAdmin()) updateShared({ location: { ...s.location, lat: Number(e.target.value) } }); } }), "Für hell/dunkel in Routinen (F6)"),
      field("Längengrad", h("input.input", { type: "number", step: "0.01", value: s.location?.lon, onchange: async (e) => { if (await requireAdmin()) updateShared({ location: { ...s.location, lon: Number(e.target.value) } }); } }))),
    navigator.geolocation && h("div.row", {}, h("button.btn.small", { onclick: async () => {
      if (!(await requireAdmin())) return;
      navigator.geolocation.getCurrentPosition((pos) => { updateShared({ location: { lat: +pos.coords.latitude.toFixed(2), lon: +pos.coords.longitude.toFixed(2) } }); rerender(); toast("Standort übernommen"); }, () => toast("Standort nicht verfügbar"));
    } }, "Standort ermitteln")),
    h("div.field", {}, h("span", {}, "Webhook für aPager PRO (A7, H2)"),
      hook ? h("code", { style: "overflow-wrap:anywhere" }, hook) : h("small", {}, "Noch kein Schlüssel – ohne Schlüssel nimmt die Zentrale keine Webhooks an."),
      h("div.row", {},
        h("button.btn.small", { onclick: async () => { if (await requireAdmin()) { updateShared({ webhookSecret: newId() + newId() }); rerender(); } } }, hook ? "Neuen Schlüssel" : "Schlüssel erzeugen"),
        hook && h("button.btn.small.ghost", { onclick: () => copyText(hook).then(() => toast("Kopiert")) }, "Kopieren")),
      h("small", {}, "In aPager unter Smart Home → Webhooks eintragen. Stichwort und Einheit werden übernommen.")),
  );
}

function sicherheit(rerender) {
  const setPin = (title, after) => async () => {
    const a = h("input.input", { type: "password", inputmode: "numeric" });
    const close = dialog(title, field("Neue PIN", a, "Leer lassen zum Entfernen."),
      h("div.row", {}, h("button.btn.primary", { onclick: async () => { await after(a.value ? await sha256(a.value) : ""); close(); rerender(); toast(a.value ? "PIN gespeichert" : "PIN entfernt"); } }, "Speichern")));
  };
  return section("sicherheit", "Sicherheit", null,
    h("div.item", {}, h("div.item-head", {}, h("b", {}, "App-Sperre (H4)"), h("span.chip" + (settings().lock.pinHash ? ".ok" : ""), {}, settings().lock.pinHash ? "aktiv" : "aus")),
      h("p.meta", {}, "PIN beim Öffnen dieser App. Alarme kommen trotzdem an."),
      h("button.btn.small", { onclick: setPin("App-PIN", (v) => set("lock.pinHash", v)) }, "PIN festlegen")),
    h("div.item", {}, h("div.item-head", {}, h("b", {}, "Admin-PIN (G3)"), h("span.chip" + (shared().adminPinHash ? ".ok" : ""), {}, shared().adminPinHash ? (isAdmin() ? "entsperrt" : "gesperrt") : "aus")),
      h("p.meta", {}, "Ohne Admin-PIN darf jeder Routinen, Geräte und Personen ändern. Mit PIN können andere nur steuern."),
      h("button.btn.small", { onclick: async () => { if (await requireAdmin()) setPin("Admin-PIN", (v) => updateShared({ adminPinHash: v }))(); } }, "PIN festlegen")),
  );
}

const exportAll = () => JSON.stringify({ heimalarm: "backup", version: 1, app: APP_VERSION, ts: Date.now(), settings: settings(), shared: shared() }, null, 2);

function backup(rerender) {
  return section("backup", "Backup & Updates", null,
    h("div.row", {},
      h("button.btn", { onclick: async () => { const t = exportAll(); if (await copyText(t)) toast("Backup in die Zwischenablage kopiert"); if (!isAndroid) download("heimalarm-backup.json", t); } }, "Backup erstellen"),
      h("button.btn", { onclick: () => {
        const ta = h("textarea.input", { placeholder: "Backup-Text einfügen" });
        const close = dialog("Backup wiederherstellen", ta, h("p.meta", {}, "Überschreibt die Einstellungen dieses Geräts. Gemeinsame Daten nur mit Admin-Rechten."),
          h("div.row", {}, h("button.btn.primary", { onclick: async () => {
            try {
              const b = JSON.parse(ta.value);
              for (const [k, v] of Object.entries(b.settings || {})) if (k !== "device") replace(k, v);
              if (b.shared && (await requireAdmin())) updateShared(b.shared);
              close(); applyTheme(); connect(); rerender(); toast("Backup wiederhergestellt");
            } catch { toast("Kein gültiges Backup"); }
          } }, "Wiederherstellen")));
      } }, "Wiederherstellen")),
    h("p.meta", {}, `App-Version ${APP_VERSION}${state.dienst?.version ? " · Dienst " + state.dienst.version : ""}`),
    h("div.row", {}, h("button.btn.small", { onclick: async (e) => {
      e.target.disabled = true;
      try {
        const r = await fetch("https://api.github.com/repos/DanieldamHH112/Heimalarm/releases/latest");
        if (!r.ok) throw new Error(r.status === 404 ? "Keine Version gefunden (Repo privat?)" : `Fehler ${r.status}`);
        const j = await r.json();
        const latest = String(j.tag_name).replace(/^v/u, "");
        toast(latest === APP_VERSION ? "Heimalarm ist aktuell" : `Neue Version ${latest} verfügbar`);
        if (latest !== APP_VERSION) window.open(j.html_url, "_blank");
      } catch (err) { toast(String(err.message || err)); }
      e.target.disabled = false;
    } }, "Nach Updates suchen")),
  );
}

function darstellung() {
  return section("darstellung", "Darstellung", null,
    h("div.field", {}, h("span", {}, "Farbschema"), segmented([["dark", "Dunkel"], ["light", "Hell"]], get("ui.theme"), (v) => { set("ui.theme", v); applyTheme(); })));
}

export function settingsView(rerender) {
  const parts = [
    ["verbindung", "Verbindung", verbindung(rerender)],
    ["alarm", "Alarm", alarm()],
    isConfigured() && ["esp32", "ESP32", esp32()],
    hasPcFeatures && ["pc", "PC", pc(rerender)],
    isTauri && isAndroid && ["android", "Android", androidSection(rerender)],
    ["geraet", "Dieses Gerät", geraet()],
    ["personen", "Personen", personen(rerender)],
    ["zentrale", "Zentrale", zentrale(rerender)],
    ["sicherheit", "Sicherheit", sicherheit(rerender)],
    ["backup", "Backup", backup(rerender)],
    ["darstellung", "Darstellung", darstellung()],
  ].filter(Boolean);
  return h("div.page", {},
    h("header.page-head", {}, h("div", {}, h("h1", {}, "Einstellungen"), h("p", {}, "Änderungen werden sofort gespeichert.")),
      h("a.btn", { href: "#/diagnose" }, "Test & Diagnose")),
    h("nav.toc-chips", { "aria-label": "Abschnitte" }, parts.map(([id, label]) => h("a", { href: `#/einstellungen/${id}` }, label))),
    ...parts.map(([, , el]) => el),
  );
}
