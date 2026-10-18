// Einstellungen. Alles wird sofort gespeichert; allgemeine Werte gleichen sich über die Zentrale ab.
import { modeChoice, setupFlow } from "../ui/setup.js";
import { update, checkUpdate, installUpdate, RELEASES_URL } from "../core/update.js";
import { h, toast, fmtAgo } from "../ui/dom.js";
import { field, text, toggle, segmented, select, section, switchRow, copyText, download, dialog } from "../ui/form.js";
import { settings, set, get, replace, isConfigured, mode } from "../core/settings.js";
import { has } from "../core/features.js";
import { direct, startReceiver, renewCode, openPairing, webhookUrl, renewHookKey, pingPeer, addPeer, editPeer, removePeer, syncPeers, unpairPhone, renamePhone } from "../core/direct.js";
import { runsHere } from "../core/routines-local.js";
import { shared, updateShared, sha256, newId } from "../core/shared.js";
import { connect, state, publish, APP_VERSION } from "../core/mqtt.js";
import { ACTIONS, setAutostart, hibernateEnabled, enableHibernate, macAddress } from "../core/pc.js";
import { hasPcFeatures, isAndroid, isTauri } from "../core/platform.js";
import { requireAdmin, isAdmin } from "../core/admin.js";
import { androidStatus, openBatterySettings, openNotificationAccess, setBackgroundService } from "../core/android.js";
import { applyTheme } from "../ui/theme.js";
import { biometricLabel } from "../core/biometric.js";
import { recentApps, testAlarm } from "../core/engine.js";
import { divera, loadDivera, restartDivera } from "../core/divera.js";
import { answerApager } from "../core/apager.js";
import qrcode from "qrcode-generator";
import { playAlarmTone } from "../ui/sound.js";

const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|localhost$|[a-z0-9-]+\.local$|[a-z0-9-]+$)/iu;
let hibernateOn = null;
let android = null;

// ── Abschnitte ─────────────────────────────────────
function peerDialog(rerender, peer) {
  const host = h("input.input", { placeholder: "z. B. 192.168.1.20", inputmode: "url", value: peer?.host || "" });
  const port = h("input.input", { placeholder: "8765", inputmode: "numeric", value: String(peer?.port || 8765) });
  const code = h("input.input", { placeholder: peer ? "nur zum Neu-Koppeln" : "8-stelliger Code", inputmode: "numeric" });
  const name = h("input.input", { placeholder: "z. B. PC Arbeitszimmer", value: peer?.nameSet ? peer.name : "" });
  const close = dialog(peer ? `„${peer.name}“ bearbeiten` : "PC koppeln",
    field("Adresse", host, "Steht am PC unter Einstellungen → Betrieb."),
    field("Kopplungscode", code, peer ? "Leer lassen, außer der PC wurde entkoppelt." : "Steht am PC daneben. Vorher am PC „Koppeln erlauben“ drücken. Danach bekommt dieses Handy einen eigenen Code."),
    field("Name", name, "Leer = Name des PCs übernehmen."),
    field("Port", port),
    h("div.row", {}, h("button.btn.primary", { onclick: async () => {
      const c = code.value.replace(/\D/gu, "");
      const data = { host: host.value.trim(), port: Number(port.value) || 8765, code: c, name: name.value.trim() };
      if (!data.host) return toast("Adresse eintragen");
      if ((!peer || c) && c.length !== 8) return toast("8-stelligen Code eintragen");
      close(); toast("Verbinde …");
      const ok = peer ? await editPeer(peer.id, data) : await addPeer(data);
      rerender();
      toast(ok ? "Gekoppelt – Einstellungen werden abgeglichen" : "Gespeichert, aber PC nicht erreicht");
    } }, peer ? "Speichern" : "Koppeln")));
}

function renamePhoneDialog(rerender, p) {
  const name = h("input.input", { value: p.name });
  const close = dialog("Handy umbenennen", field("Name", name, "Nur an diesem PC."),
    h("div.row", {}, h("button.btn.primary", { onclick: () => { renamePhone(p.id, name.value.trim() || p.name); close(); rerender(); } }, "Speichern")));
}

const ago = (ts) => (ts ? fmtAgo(ts) : "noch nie");

// ── Betrieb: mit oder ohne Zentrale ─────────────────
function betrieb(rerender) {
  const m = mode();
  const d = settings().direct;
  const syncHint = h("small.meta", {}, settings().sync?.enabled === false
    ? "Abgleich ist aus (Einstellungen → Dieses Gerät)."
    : "Gekoppelte Geräte gleichen Betriebsart, Alarm-, PC- und Darstellungs-Einstellungen ab – ohne Zentrale auch Routinen und WLAN-Geräte. Divera-/aPager-Schlüssel bleiben auf dem Gerät.");
  const pcPart = () => {
    const phones = d.phones || [];
    return h("div.item", {},
      h("div.item-head", {}, h("b", {}, "Handy koppeln"), direct.error ? h("span.chip.bad", {}, "Fehler") : direct.ip ? h("span.chip.ok", {}, "bereit") : h("span.chip", {}, "startet …")),
      h("p.meta", {}, "„Koppeln erlauben“ drücken, dann am Handy unter Einstellungen → Betrieb → „PC koppeln“ eintragen:"),
      h("div.pair-big", {},
        h("div", {}, h("small", {}, "Adresse"), h("code", {}, direct.ip ? `${direct.ip}` : "–")),
        h("div", {}, h("small", {}, "Kopplungscode"), h("code", {}, (d.code || "–").replace(/(\d{4})(\d{4})/u, "$1 $2")))),
      direct.error && h("p.meta.err", {}, direct.error),
      h("div.row", {},
        direct.pairUntil > Date.now()
          ? [h("span.chip.ok", {}, `Koppeln erlaubt bis ${new Date(direct.pairUntil).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`),
             h("button.btn.small.ghost", { onclick: async () => { await openPairing(0); rerender(); } }, "Beenden")]
          : h("button.btn.small.primary", { onclick: async () => { await openPairing(5); rerender(); } }, "Koppeln erlauben (5 Minuten)"),
        h("button.btn.small.ghost", { onclick: async () => { if (confirm("Neuen Kopplungscode erzeugen? Bereits gekoppelte Handys bleiben gekoppelt.")) { await renewCode(); rerender(); } } }, "Neuer Kopplungscode")),
      h("small.meta", {}, "Neue Handys werden nur angenommen, solange „Koppeln erlauben“ läuft. Nach 10 falschen Codes ist ein Gerät 5 Minuten gesperrt."),
      h("div.item-head", { style: "margin-top:var(--s4)" }, h("b", {}, "Gekoppelte Handys")),
      phones.length === 0 ? h("p.meta", {}, "Noch keins.")
        : h("ul.rows.compact", {}, phones.map((p) => h("li", {}, h("div.row-main", {},
            h("div", {}, h("b", {}, p.name), h("div.meta", {}, `zuletzt ${ago(p.lastSeen)}`)),
            h("div.row", {},
              h("button.btn.small.ghost", { onclick: () => renamePhoneDialog(rerender, p) }, "Umbenennen"),
              h("button.btn.small.ghost.danger", { onclick: async () => { if (confirm(`„${p.name}“ entkoppeln? Das Handy erreicht diesen PC danach nicht mehr.`)) { await unpairPhone(p.id); rerender(); } } }, "Entkoppeln")))))),
      syncHint,
      h("small.meta", {}, "Windows fragt beim ersten Mal nach der Firewall – „Private Netzwerke“ erlauben."));
  };
  const phonePart = () => {
    const peers = d.peers || [];
    return h("div.item", {},
      h("div.item-head", {}, h("b", {}, "Gekoppelte PCs"), h("button.btn.small", { onclick: () => peerDialog(rerender) }, "PC koppeln")),
      peers.length === 0 ? h("p.meta", {}, "Noch kein PC. Ohne PC gibt es nur Meldung, Rückmeldung und Licht.")
        : h("ul.rows.compact", {}, peers.map((p) => {
            const st = direct.peers[p.id];
            return h("li", {}, h("div.row-main", {},
              h("div", {}, h("b", {}, p.name, st && h("span.badge" + (st.ok ? "" : ".bad"), {}, st.ok ? "erreichbar" : st.error)),
                h("div.meta", {}, `${p.host}:${p.port || 8765}${p.paired ? "" : " · noch nicht gekoppelt"}`)),
              h("div.row", {},
                h("button.btn.small.ghost", { onclick: () => pingPeer(p).then(rerender) }, "Prüfen"),
                h("button.btn.small.ghost", { onclick: () => peerDialog(rerender, p) }, "Bearbeiten"),
                h("button.btn.small.ghost.danger", { onclick: () => { if (confirm(`„${p.name}“ entfernen? Am PC zusätzlich „Entkoppeln“ wählen.`)) { removePeer(p.id); rerender(); } } }, "Entfernen"))));
          })),
      peers.some((p) => p.paired) && h("div.row", {},
        h("button.btn.small.ghost", { onclick: () => syncPeers().then(() => { rerender(); toast("Abgeglichen"); }) }, "Jetzt abgleichen"),
        direct.lastSync ? h("small.meta", {}, `Zuletzt abgeglichen ${fmtAgo(direct.lastSync)}`) : null),
      syncHint,
      h("small.meta", {}, "Handy und PC müssen im selben WLAN sein."));
  };
  return section("betrieb", "Betrieb", "Wie der Alarm zu deinen Geräten kommt. Gekoppelte Geräte übernehmen die Betriebsart automatisch.",
    modeChoice((v) => { set("mode", v); connect(); startReceiver(); rerender(); }),
    h("details.item.flow-wrap", {}, h("summary", {}, h("b", {}, "So läuft ein Alarm")), setupFlow()),
    hasPcFeatures ? pcPart() : phonePart(),
    m === "direkt" && switchRow("Routinen auf diesem Gerät ausführen", hasPcFeatures ? "Normalerweise macht das das Handy. Nur einschalten, wenn kein Handy Routinen ausführt." : "Licht und Alexa bei Alarm. Nur auf einem Gerät einschalten.",
      runsHere(), (v) => { set("direct.routines", v); rerender(); }),
  );
}

function verbindung(rerender) {
  const host = settings().broker.host;
  return section("verbindung", "Verbindung", "Die Zentrale – jeder Computer, der immer läuft und Docker kann: NAS, Mini-PC, Raspberry Pi oder ein alter Laptop. Darauf läuft das Heimalarm-Docker-Projekt. Ohne sie kommt kein Melder-Alarm an.",
    h("div.fields", {},
      field("Adresse", text("broker.host", { placeholder: "z. B. 192.168.1.10", inputmode: "url", autocomplete: "off" }), "IP oder Name im Heimnetz"),
      field("Port", text("broker.port", { type: "number", min: 1, max: 65535 }), "WebSocket, Standard 9001"),
      field("Benutzer", text("broker.user", { autocomplete: "off" }), "Aus zentrale/.env (MQTT_USER, Standard: heimalarm)"),
      field("Passwort", text("broker.pass", { type: "password", autocomplete: "off" }), "MQTT_PASSWORD aus zentrale/.env – ohne Passwort lässt die Zentrale niemanden rein.")),
    toggle("broker.tls", "Verschlüsselt (TLS)", "Nur aktivieren, wenn die Zentrale ein Zertifikat hat (H1)."),
    host && !PRIVATE.test(host) && h("div.banner.warn", {}, h("div", {}, h("b", {}, "Adresse liegt nicht im Heimnetz"), "Für unterwegs besser ein VPN (z. B. WireGuard) nutzen, statt die Zentrale ins Internet zu stellen (H3).")),
    h("div.row", {}, h("button.btn.primary", { onclick: () => { connect(); toast("Verbinde mit der Zentrale …"); setTimeout(rerender, 1500); } }, "Speichern & verbinden")),
  );
}

function alarm() {
  const me = settings().alarm.me;
  return section("alarm", "Alarm", "Wie die App mit Alarmen umgeht – egal aus welcher Quelle.",
    h("div.fields", {},
      field("Meine Kennung", text("alarm.me", { autocomplete: "off" }), "Gleich wie beim Melder: alarm/<kennung>. Auf jedem eigenen Gerät dieselbe – dann reagieren alle PCs und Laptops gemeinsam."),
      field("Sperrzeit (Sekunden)", text("alarm.lockoutSec", { type: "number", min: 0, max: 600 }), "Meldungen derselben Person kurz danach zählen als derselbe Einsatz – auch aus verschiedenen Quellen.")),
    toggle("alarm.testMode", "Testmodus", "Alle Alarme nur anzeigen – keine PC-Aktion (A11)."),
    h("div.row", {}, h("button.btn", { onclick: testAlarm }, "Testalarm"), h("a.btn.ghost", { href: "#/diagnose" }, "Weitere Tests")),
    h("p.meta", {}, "Aktuelle Kennung: ", h("code", {}, `alarm/${me}`)),
  );
}

// ── Alarmquellen ───────────────────────────────────
// Aufbau je Quelle: Kopfzeile (Name, Kurzinfo was aktiv ist, Schalter) → aufgeklappt in Gruppen
// „Zugang“, „Alarm empfangen“, „Rückmeldung“. Alles optional, jede Quelle für sich.

/** Paketname per „Erkennen“: zuletzt gesehene Apps mit Benachrichtigungen zur Auswahl. */
function pickPackage(path, rerender) {
  const list = [...recentApps.keys()].toReversed();
  const close = dialog("App erkennen",
    h("p.meta", {}, list.length ? "Apps mit den letzten Benachrichtigungen. Tippe auf die Alarm-App." : "Noch keine Benachrichtigung gesehen. Schick dir aus der Alarm-App eine Testmeldung und öffne das hier erneut."),
    list.length && h("ul.rows.compact", {}, list.map((pkg) => h("li", {}, h("button.btn.ghost.pick", { onclick: () => { set(path, pkg); close(); rerender(); toast("Übernommen"); } }, h("code", {}, pkg))))));
}

/** Erste lesbare Zeile der Release-Notizen – ohne Markdown, Links und „Full Changelog“. */
const noteLine = (notes = "") => notes.split("\n").map((l) => l.replace(/[*_#`>]/gu, "").replace(/https?:\/\/\S+/gu, "").trim())
  .find((l) => l && !/^full changelog:?$/iu.test(l)) || "";

const group = (title, ...body) => h("div.group", {}, h("h3.group-title", {}, title), ...body.flat().filter(Boolean));

function sourceRow({ id, title, summary, on, onToggle, badge, body }) {
  return h("div.source" + (on ? ".on" : ""), { id: `quelle-${id}` },
    h("label.switch.source-head", {},
      h("div", {}, h("b", {}, title, badge), h("small", {}, summary)),
      h("input", { type: "checkbox", role: "switch", checked: on, "aria-label": `${title} als Alarmquelle`, onchange: (e) => onToggle(e.target.checked) })),
    on && body && h("div.source-body", {}, ...body.filter(Boolean)));
}

/** Benachrichtigung mitlesen (nur Android) – auf PC nur Hinweis. */
function notifGroup(id, rerender) {
  if (!isAndroid) return group("Alarm empfangen", h("p.meta", {}, id === "divera" ? "Am Handy: Benachrichtigung mitlesen. Hier: Abfrage per API (unten)." : "Das Handy liest mit und gibt den Alarm über die Zentrale an diesen PC."));
  return group("Alarm empfangen",
    h("div.inline", {},
      field("App auf dem Handy", text(`alarm.apps.${id}.pkg`, { autocomplete: "off", placeholder: "über „Erkennen“ wählen" }), "Paketname, ein Teil reicht."),
      h("button.btn.small", { onclick: () => pickPackage(`alarm.apps.${id}.pkg`, rerender) }, "Erkennen")));
}

const statusSelect = (path, list, empty = "– nichts –") => list.length
  ? select([["", empty], ...list.map((x) => [x.id, x.name])], get(path), (v) => set(path, v))
  : text(path, { inputmode: "numeric", placeholder: "Status-ID" });

function diveraSource(rerender) {
  const d = settings().divera, on = settings().alarm.apps.divera.on;
  const load = async (e) => {
    e.target.disabled = true;
    try { const r = await loadDivera(); toast(`Verbunden${r.unit ? " · " + r.unit : ""}`); rerender(); }
    catch (err) { toast(err.message); rerender(); }
    e.target.disabled = false;
  };
  const parts = [isAndroid && settings().alarm.apps.divera.pkg && "Mitlesen", d.key && d.poll && `Abfrage ${d.pollSec} s`, d.key && (d.answer || d.setStatus) && "Rückmeldung"].filter(Boolean);
  const badge = !d.key ? null : divera.ok === false ? h("span.badge.bad", {}, "Fehler") : d.unit ? h("span.badge", {}, d.unit) : null;
  return sourceRow({
    id: "divera", title: "Divera 24/7", on, badge,
    summary: on && parts.length ? parts.join(" · ") : "Mitlesen, Abfrage per API, Rückmeldung und Status.",
    onToggle: (v) => { set("alarm.apps.divera.on", v); restartDivera(); rerender(); },
    body: [
      group("Zugang",
        h("div.inline", {},
          field("Persönlicher Accesskey", h("input.input", { type: "password", autocomplete: "off", spellcheck: "false", value: d.key, placeholder: "dvpat-…",
            onchange: (e) => { set("divera.key", e.target.value.trim()); restartDivera(); rerender(); } }), "Divera → Profil → Login → API-Schlüssel. Bleibt auf diesem Gerät."),
          h("button.btn.small", { onclick: load, disabled: !d.key }, d.unit ? "Neu laden" : "Verbinden")),
        divera.ok === false && h("p.meta.err", {}, divera.error)),
      notifGroup("divera", rerender),
      d.key && h("div.group-cont", {},
        toggle("divera.poll", "Bei Divera abfragen", "Ohne Benachrichtigung, solange die App läuft.", () => { restartDivera(); rerender(); }),
        d.poll && field("Abfrage alle (Sekunden)", text("divera.pollSec", { type: "number", min: 10, max: 300 }, { onSave: restartDivera }), "15–30 s reichen.")),
      d.key && group("Rückmeldung bei Antwort (optional)",
        h("p.meta", {}, "Nach „Fährst du?“ am PC oder per Karte in der Übersicht. Beides ist aus, bis du es einschaltest."),
        toggle("divera.answer", "Rückmeldung zum Einsatz senden", "Antwortet in Divera auf den Alarm, z. B. „Komme“ / „Komme nicht“.", () => rerender()),
        d.answer && h("div.fields", {},
          field("Bei „Ich fahre“", statusSelect("divera.answerGo", d.answers), "Rückmeldung zum Divera-Alarm."),
          field("Bei „Ich fahre nicht“", statusSelect("divera.answerStay", d.answers))),
        toggle("divera.setStatus", "Meinen Status setzen", "Setzt deinen Divera-Status – egal über welche Quelle der Alarm kam.", () => rerender()),
        d.setStatus && h("div.fields", {},
          field("Bei „Ich fahre“", statusSelect("divera.statusGo", d.statuses)),
          field("Bei „Ich fahre nicht“", statusSelect("divera.statusStay", d.statuses))),
        d.setStatus && h("div.fields", {},
          field("Status zurücksetzen nach (min)", text("divera.resetMin", { type: "number", min: 0, max: 720 }), "0 = nie"),
          d.resetMin > 0 && field("… auf", statusSelect("divera.resetTo", d.statuses, "– wählen –"))),
        (d.answer || d.setStatus) && field("Notiz", text("divera.note", { placeholder: "z. B. per Heimalarm", maxlength: 80 }), "Optional, erscheint in Divera."),
        (d.answer || d.setStatus) && !d.statuses.length && h("p.meta", {}, "Tipp: „Verbinden“ lädt eure Status als Auswahl.")),
    ],
  });
}

function apagerSource(rerender) {
  const a = settings().apager, on = settings().alarm.apps.apager.on;
  const parts = [isAndroid && settings().alarm.apps.apager.pkg && "Mitlesen", shared().webhookSecret && "Webhook", a.key && a.feedback && "Rückmeldung"].filter(Boolean);
  return sourceRow({
    id: "apager", title: "aPager PRO", on,
    summary: on && parts.length ? parts.join(" · ") : "Mitlesen, Webhook (Zentrale oder PC), Rückmeldung.",
    onToggle: (v) => { set("alarm.apps.apager.on", v); rerender(); },
    body: [
      notifGroup("apager", rerender),
      group("Webhook (Smart-Home-Paket in aPager)",
        h("p.meta", {}, "aPager auf dem Handy ruft bei Alarm eine Adresse auf – mit Stichwort und Einheit, ohne Alarmtext. In aPager unter Einstellungen → Labor → Webhooks eintragen und in der Einheit „Webhooks aktivieren“."),
        h("p.meta", {}, "An die Zentrale: Adresse unter ", h("a", { href: "#/einstellungen/zentrale" }, "Zentrale"), ". Geht von überall, wenn die Zentrale erreichbar ist."),
        hasPcFeatures ? h("div.field", {}, h("span", {}, "Direkt an diesen PC (ohne Zentrale)"),
          webhookUrl() ? h("code", { style: "overflow-wrap:anywhere" }, webhookUrl()) : h("small", {}, "Startet gerade …"),
          h("div.row", {},
            webhookUrl() && h("button.btn.small.ghost", { onclick: () => copyText(webhookUrl()).then(() => toast("Kopiert")) }, "Kopieren"),
            h("button.btn.small.ghost", { onclick: async () => { if (confirm("Neuen Schlüssel erzeugen? Die alte Adresse in aPager funktioniert dann nicht mehr.")) { await renewHookKey(); rerender(); } } }, "Neuer Schlüssel")),
          h("small", {}, "Funktioniert, solange das Handy mit aPager im selben WLAN ist wie der PC."))
          : h("p.meta", {}, "Direkt an einen PC geht auch: Die Adresse steht am PC unter Alarmquellen → aPager PRO.")),
      group("Rückmeldung bei Antwort (optional)",
        h("div.inline", {},
          field("API-Schlüssel", h("input.input", { type: "password", autocomplete: "off", value: a.key, onchange: (e) => { set("apager.key", e.target.value.trim()); rerender(); } }),
            "aPager → Verfügbarkeit → Zahnrad → Externer Zugriff. Smart-Home-Abo nötig."),
          h("button.btn.small", { disabled: !a.key, onclick: async () => { const r = await answerApager(true, { quiet: true }); toast(r.code === 204 ? "Schlüssel ok – gerade kein Alarm" : r.text); } }, "Prüfen")),
        a.key && toggle("apager.feedback", "Zusage / Absage senden", "„Ich fahre“ = komme, „Ich fahre nicht“ = komme nicht. Nur Alarme der letzten 3 Minuten."),
        a.key && toggle("apager.silent", "Ohne Bestätigungs-Push", "aPager zeigt dann keine eigene Meldung.")),
    ],
  });
}

function quellen(rerender) {
  const a = settings().alarm;
  const sybosOn = a.apps.sybos.on;
  const anyNotif = Object.values(a.apps).some((x) => x.on) || a.filterApps;
  return section("quellen", "Alarmquellen", "Mehrere gleichzeitig möglich. Die Sperrzeit macht daraus einen Einsatz.",
    h("div.sources", {},
      sourceRow({ id: "esp32", title: "Melder", summary: mode() === "zentrale" ? "Ladeschale über ESP32 oder Funk-Alarmschalter (Tuya-Brücke). Hauptweg." : "Braucht die Zentrale (Betrieb → Mit Zentrale).", on: a.mqtt && mode() === "zentrale", onToggle: (v) => { set("alarm.mqtt", v); rerender(); } }),
      sourceRow({ id: "sybos", title: "SYBOS", on: sybosOn,
        summary: "Benachrichtigung der SYBOS-App mitlesen.",
        onToggle: (v) => { set("alarm.apps.sybos.on", v); rerender(); },
        body: [notifGroup("sybos", rerender), group("Rückmeldung", h("p.meta", {}, "SYBOS bietet dafür keine offene Schnittstelle. Rückmeldung weiter in der SYBOS-App."))] }),
      apagerSource(rerender),
      diveraSource(rerender),
    ),
    isAndroid && h("details.more", {},
      h("summary", {}, "Weitere Apps & Filter"),
      field("Weitere Apps", text("alarm.filterApps", { placeholder: "z. B. de.example.alarm" }), "Paketnamen, kommagetrennt."),
      field("Schlüsselwörter", text("alarm.filterWords"), "Eines muss in der Meldung stehen. Leer = jede Meldung.")),
    isAndroid && anyNotif && android && !android.notificationAccess && h("div.banner.warn", {}, h("div", {}, h("b", {}, "Mitlesen nicht erlaubt"), "Ohne Erlaubnis erkennt die App keine Alarme aus anderen Apps.",
      h("div.row", { style: "margin-top:8px" }, h("button.btn.small", { onclick: () => openNotificationAccess() }, "Erlauben")))),
  );
}

// ── Sprachassistenten ──────────────────────────────
function qrSvg(textValue) {
  const q = qrcode(0, "M");
  q.addData(textValue); q.make();
  const box = h("div.qr", { role: "img", "aria-label": "Matter-QR-Code" });
  box.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  return box;
}

function sprache(rerender) {
  const v = state.voice;
  const cfg = { enabled: true, openSec: 30, tests: false, ...shared().voice };
  const setCfg = async (patch) => { if (await requireAdmin()) { updateShared({ voice: { ...cfg, ...patch } }); rerender(); } };
  const host = settings().broker.host || "<zentrale>";
  const sensors = v?.sensors || [];
  const statusChip = !state.connected ? h("span.chip", {}, "Zentrale getrennt")
    : !v ? h("span.chip", {}, "Dienst meldet nichts")
    : !cfg.enabled ? h("span.chip", {}, "aus")
    : v.running ? h("span.chip" + (v.commissioned ? ".ok" : ".warn"), {}, v.commissioned ? `gekoppelt · ${v.fabrics?.length || 1}` : "bereit zum Koppeln")
    : h("span.chip.bad", {}, "startet nicht");
  const vm = shared().voicemonkey || {};
  const vmItem = h("div.item", {},
    h("div.item-head", {}, h("b", {}, "Alexa über Voice Monkey"), h("span.chip" + (vm.token ? ".ok" : ""), {}, vm.token ? "eingerichtet" : "aus")),
    h("p.meta", {}, "Startet Alexa-Routinen per Internet – geht auch ohne Zentrale. In Routinen als Aktion „+ Alexa“."),
    field("API-Token", h("input.input", { type: "password", autocomplete: "off", value: vm.token || "", placeholder: "aus voicemonkey.io → Dashboard → API",
      onchange: async (e) => { if (await requireAdmin()) { updateShared({ voicemonkey: { token: e.target.value.trim() } }); rerender(); } } }),
      "In Voice Monkey einen „Routine Trigger“ anlegen und in der Alexa-App als Auslöser einer Routine wählen."));
  if (!has.pi()) {
    return section("sprache", "Alexa & Google Home", "Ohne Zentrale über Voice Monkey (Alexa). Matter und Google brauchen die Zentrale.", vmItem);
  }
  return section("sprache", "Alexa & Google Home", "Lokal über Matter – oder Alexa per Voice Monkey.",
    vmItem,
    h("div.item", {},
      h("div.item-head", {}, h("b", {}, "Alarm als Auslöser (Matter)"), statusChip),
      h("p.meta", {}, "Die Zentrale meldet sich als Kontaktsensor. Bei Alarm öffnet er sich kurz – damit startest du in Alexa oder Google Home eine Routine, z. B. Ansage „Einsatz!“ auf allen Lautsprechern."),
      switchRow("Sensoren bereitstellen", "Gilt für die ganze Zentrale.", cfg.enabled, (on) => setCfg({ enabled: on })),
      cfg.enabled && v?.error && !v.running && h("div.banner.warn", {}, h("div", {}, h("b", {}, "Matter startet nicht"), v.error)),
      cfg.enabled && v?.running && h("div.pair", {},
        qrSvg(v.qr),
        h("div.pair-text", {},
          h("b", {}, v.commissioned ? "Weiteren Assistenten koppeln" : "So koppelst du"),
          h("ol.pair-steps", {},
            h("li", {}, h("b", {}, "Alexa: "), "Geräte → + → Gerät hinzufügen → Matter."),
            h("li", {}, h("b", {}, "Google Home: "), "+ → Gerät einrichten → Neues Gerät → Matter."),
            h("li", {}, "QR-Code scannen oder Code eingeben:")),
          h("div.row", {}, h("code.pair-code", {}, v.manual.replace(/(\d{4})(\d{3})(\d{4})/u, "$1-$2-$3")),
            h("button.btn.small.ghost", { onclick: () => copyText(v.manual).then(() => toast("Kopiert")) }, "Kopieren")),
          h("small.meta", {}, "Ein Gerät kann mit Alexa und Google Home gleichzeitig gekoppelt sein. Für den zweiten Assistenten in der ersten App „Mit anderer App teilen“ wählen."))),
      cfg.enabled && sensors.length > 0 && h("div.field", {}, h("span", {}, "Sensoren"),
        h("div.row", {}, sensors.map((n) => h("span.badge", {}, n))),
        h("small", {}, "„Heimalarm Einsatz“ bei jedem Alarm, dazu einer je Person aus „Personen“.")),
      cfg.enabled && h("div.fields", {},
        field("Sensor bleibt offen (Sekunden)", h("input.input", { type: "number", min: 5, max: 600, value: cfg.openSec, onchange: (e) => setCfg({ openSec: Math.max(5, Number(e.target.value) || 30) }) }), "Danach meldet er wieder „geschlossen“.")),
      cfg.enabled && switchRow("Auch bei Testalarmen auslösen", "Sonst nur echte Alarme und Komplettprobe.", cfg.tests, (on) => setCfg({ tests: on })),
      cfg.enabled && v?.running && h("div.row", {},
        h("button.btn.small", { onclick: () => { if (publish("heimalarm/cmd/voice/test", {})) toast("Sensor geöffnet – Routine sollte starten"); } }, "Routine testen"),
        v.commissioned && h("button.btn.small.ghost.danger", { onclick: async () => { if (await requireAdmin() && confirm("Alle Kopplungen mit Alexa/Google Home löschen? Routinen dort müssen danach neu angelegt werden.")) publish("heimalarm/cmd/voice/reset", {}); } }, "Kopplungen löschen"))),
    h("div.item", {},
      h("div.item-head", {}, h("b", {}, "Licht & Geräte steuern")),
      h("p.meta", {}, "Zigbee-Lichter und -Gruppen erscheinen in Alexa und Google Home – „Alexa, Flurlicht an“. Dafür läuft Matterbridge auf der Zentrale."),
      h("ol.pair-steps", {},
        h("li", {}, "Auf der Zentrale: ", h("code", {}, "docker compose --profile zigbee --profile matter up -d")),
        h("li", {}, "Oberfläche öffnen, Plugin ", h("code", {}, "matterbridge-zigbee2mqtt"), " hinzufügen."),
        h("li", {}, "Den dort gezeigten QR-Code in Alexa bzw. Google Home scannen.")),
      h("div.row", {}, h("a.btn.small", { href: `http://${host}:8283`, target: "_blank", rel: "noopener" }, "Matterbridge öffnen"))),
    h("p.meta", {}, "Nötig: ein Echo mit Matter-Unterstützung bzw. ein Nest-Lautsprecher, Nest Hub oder Google TV im selben WLAN."),
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
  return section("pc", "PC bei Alarm", "Was nach der Abfrage „Fährst du?“ passiert. Jeder PC mit Heimalarm fragt selbst – mehrere PCs und Laptops gehen also gleichzeitig.",
    field("Abfrage auch bei Alarm von", text("pc.alsoFor", { autocomplete: "off", placeholder: "z. B. kollege" }), "Weitere Kennungen mit Komma – für einen gemeinsamen PC, der bei mehreren Personen ausgehen soll. Leer = nur bei eigener Kennung."),
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
    p.sound && (() => {
      const label = h("span", {}, `Lautstärke ${p.volume} %`);
      return h("div.field", {}, label,
      h("div.row", {}, h("input", { type: "range", min: 10, max: 100, value: p.volume, style: "flex:1;accent-color:var(--signal)", "aria-label": "Lautstärke", oninput: (e) => { label.textContent = `Lautstärke ${e.target.value} %`; }, onchange: (e) => set("pc.volume", Number(e.target.value)) }),
        h("button.btn.small", { onclick: () => playAlarmTone(1500) }, "Ton testen")));
    })(),
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

// ── Zusatzfunktionen: alles aus, bis man es einschaltet ─
function funktionen(rerender) {
  const f = settings().features || {};
  return section("funktionen", "Funktionen", "Zusätzliche Funktionen. Alle sind aus, bis du sie einschaltest – gilt für alle abgeglichenen Geräte.",
    toggle("features.logbuch", "Einsatz-Logbuch", "Speichert jede echte Alarmierung mit allen Infos (Stichwort, Einheiten, Adresse, Text, Antwort). Mit Notizen, Fahrzeug und Funktion. Unter Protokoll → Einsätze.", () => rerender()),
    f.logbuch
      ? toggle("features.stats", "Statistik und Jahresrückblick", "Zahlen, Verlauf, Verteilung nach Art und Rückblick je Jahr – aus dem Logbuch.", () => rerender())
      : h("p.meta", {}, "Statistik und Jahresrückblick gibt es, sobald das Logbuch an ist."),
    h("p.meta", {}, "Rückmeldung an Divera und aPager schaltest du unter Alarmquellen bei der jeweiligen App ein."));
}

function geraet() {
  return section("geraet", "Dieses Gerät", "So erscheint die App bei den anderen unter „Verbundene Apps“.",
    field("Gerätename", text("device.name", { placeholder: hasPcFeatures ? "z. B. PC Arbeitszimmer" : "z. B. Handy Daniel", autocomplete: "off" }, { onSave: () => connect() })),
    toggle("notify.enabled", "Benachrichtigung bei Alarm", hasPcFeatures ? "Für Alarme anderer Personen. Eigene Alarme zeigen die Abfrage." : "Systemmeldung, auch im Hintergrund (E1)."),
    toggle("sync.enabled", "Einstellungen abgleichen", "Einstellungen mit der Zentrale und gekoppelten Geräten abgleichen. Schlüssel für Divera und aPager bleiben immer hier."),
    !hasPcFeatures && settings().sync?.enabled !== false && field("Abgleich ohne Zentrale alle",
      select([["30", "30 Sekunden"], ["60", "1 Minute"], ["120", "2 Minuten"], ["300", "5 Minuten"], ["900", "15 Minuten"]], String(settings().sync?.intervalSec || 120), (v) => set("sync.intervalSec", Number(v))),
      "Wie oft das Handy bei gekoppelten PCs nachschaut. Nach jeder Änderung und beim Öffnen der App gleicht es ohnehin sofort ab. Mit Zentrale läuft der Abgleich sofort."),
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
      h("small", {}, "In aPager PRO unter Einstellungen → Labor → Webhooks eintragen (Smart-Home-Paket nötig) und in der Einheit „Webhooks aktivieren“. aPager liefert nur Stichwort und Einheit – mehrere Einheiten werden zu einem Einsatz zusammengefasst, Rückalarm wird vermerkt.")),
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
      h("button.btn.small", { onclick: setPin("App-PIN", (v) => set("lock.pinHash", v)) }, "PIN festlegen"),
      bioToggle(rerender)),
    h("div.item", {}, h("div.item-head", {}, h("b", {}, "Admin-PIN (G3)"), h("span.chip" + (shared().adminPinHash ? ".ok" : ""), {}, shared().adminPinHash ? (isAdmin() ? "entsperrt" : "gesperrt") : "aus")),
      h("p.meta", {}, "Ohne Admin-PIN darf jeder Routinen, Geräte und Personen ändern. Mit PIN können andere nur steuern."),
      h("button.btn.small", { onclick: async () => { if (await requireAdmin()) setPin("Admin-PIN", (v) => updateShared({ adminPinHash: v }))(); } }, "PIN festlegen")),
  );
}

/** Fingerabdruck / Windows Hello zusätzlich zur App-PIN – nur zeigen, wenn das Gerät es kann. */
let bioLabel = null;
function bioToggle(rerender) {
  if (bioLabel === null) { bioLabel = ""; biometricLabel().then((l) => { bioLabel = l; if (l) rerender(); }); return null; }
  if (!bioLabel) return null;
  if (!settings().lock.pinHash) return h("p.meta", {}, `${bioLabel} geht, sobald eine App-PIN festgelegt ist (als Rückfall).`);
  return toggle("lock.biometric", `Mit ${bioLabel} entsperren`, "Die PIN bleibt als Rückfall, falls es nicht klappt.");
}

/** Backup. Ohne Häkchen bleiben Schlüssel, Passwörter und Codes draußen (Zwischenablage ist nicht geheim). */
const SECRET_SETTINGS = [["divera", "key"], ["apager", "key"], ["broker", "pass"], ["direct", "code"], ["direct", "hookKey"], ["lock", "pinHash"]];
function exportAll(withSecrets) {
  const s = structuredClone(settings());
  const sh = structuredClone(shared());
  if (!withSecrets) {
    for (const [a, b] of SECRET_SETTINGS) if (s[a]) s[a][b] = "";
    s.direct.peers = (s.direct.peers || []).map((p) => ({ ...p, code: "", paired: false }));
    s.direct.phones = [];
    sh.webhookSecret = ""; sh.adminPinHash = "";
    sh.voicemonkey = { ...sh.voicemonkey, token: "" };
    sh.wifi = (sh.wifi || []).map((d) => ({ ...d, user: "" }));
  }
  return JSON.stringify({ heimalarm: "backup", version: 1, app: APP_VERSION, ts: Date.now(), secrets: Boolean(withSecrets), settings: s, shared: sh }, null, 2);
}

/** Beim Wiederherstellen leere Geheimnisse nicht über vorhandene schreiben. */
function keepSecrets(k, v) {
  const cur = settings()[k];
  if (!cur || !v || typeof v !== "object") return v;
  const out = { ...v };
  for (const [a, b] of SECRET_SETTINGS) if (a === k && !out[b] && cur[b]) out[b] = cur[b];
  if (k === "direct") {
    if (!(out.phones || []).length) out.phones = cur.phones;
    out.peers = (out.peers || []).map((p) => { const old = (cur.peers || []).find((x) => x.host === p.host); return !p.code && old ? { ...p, code: old.code, paired: old.paired } : p; });
  }
  return out;
}

let backupSecrets = false;
function backup(rerender) {
  return section("backup", "Backup", "Einstellungen sichern oder auf ein anderes Gerät übertragen.",
    switchRow("Schlüssel und Passwörter mitsichern", "Divera-/aPager-Schlüssel, Zentrale-Passwort, PINs und Kopplungscodes. Nur einschalten, wenn du das Backup sicher aufbewahrst – am Handy landet es in der Zwischenablage.",
      backupSecrets, (v) => { backupSecrets = v; rerender(); }),
    h("div.row", {},
      h("button.btn", { onclick: async () => { const t = exportAll(backupSecrets); if (await copyText(t)) toast(backupSecrets ? "Backup mit Schlüsseln kopiert" : "Backup (ohne Schlüssel) kopiert"); if (!isAndroid) download("heimalarm-backup.json", t); } }, "Backup erstellen"),
      h("button.btn", { onclick: () => {
        const ta = h("textarea.input", { placeholder: "Backup-Text einfügen" });
        const close = dialog("Backup wiederherstellen", ta, h("p.meta", {}, "Überschreibt die Einstellungen dieses Geräts. Gemeinsame Daten nur mit Admin-Rechten."),
          h("div.row", {}, h("button.btn.primary", { onclick: async () => {
            try {
              const b = JSON.parse(ta.value);
              for (const [k, v] of Object.entries(b.settings || {})) if (k !== "device") replace(k, keepSecrets(k, v));
              if (b.shared && (await requireAdmin())) {
                const sh = { ...b.shared };
                if (!sh.webhookSecret) sh.webhookSecret = shared().webhookSecret;
                if (!sh.adminPinHash) sh.adminPinHash = shared().adminPinHash;
                if (!sh.voicemonkey?.token) sh.voicemonkey = shared().voicemonkey;
                sh.wifi = (sh.wifi || []).map((d) => (d.user ? d : { ...d, user: (shared().wifi || []).find((x) => x.id === d.id)?.user || "" }));
                updateShared(sh);
              }
              close(); applyTheme(); connect(); rerender(); toast("Backup wiederhergestellt");
            } catch { toast("Kein gültiges Backup"); }
          } }, "Wiederherstellen")));
      } }, "Wiederherstellen")),
  );
}

function updates(rerender) {
  const u = update;
  const when = u.checkedAt ? ` · geprüft ${new Date(u.checkedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}` : "";
  return section("updates", "Updates", "Neue Versionen kommen von GitHub. Die App lädt sie, prüft die Prüfsumme und installiert – ohne zusätzliche Programme.",
    h("p.meta", {}, `Installiert: ${APP_VERSION}${state.dienst?.version ? " · Dienst " + state.dienst.version : ""}`),
    toggle("update.auto", "Beim Start nach Updates suchen", "Nur eine kurze Abfrage bei GitHub, nichts wird ohne dich installiert."),
    u.available
      ? h("div.banner.update", {}, h("div", {}, h("b", {}, `Version ${u.available.version} verfügbar`), u.progress || noteLine(u.available.notes)),
          h("div.row", {},
            h("button.btn.primary.small", { onclick: () => installUpdate().then(rerender), disabled: u.installing }, u.installing ? "Lädt …" : "Installieren"),
            h("a.btn.small", { href: u.available.page, target: "_blank", rel: "noopener" }, "Änderungen")))
      : h("p.meta", {}, (u.message || "Noch nicht geprüft.") + when),
    h("div.row", {},
      h("button.btn.small", { onclick: () => checkUpdate().then(rerender), disabled: u.checking }, u.checking ? "Suche …" : "Jetzt prüfen"),
      h("a.btn.small.ghost", { href: RELEASES_URL, target: "_blank", rel: "noopener" }, "Alle Versionen")),
    isAndroid && h("small.meta", {}, "Beim ersten Update fragt Android, ob Heimalarm Apps installieren darf – einmal erlauben."),
  );
}

function darstellung() {
  return section("darstellung", "Darstellung", null,
    h("div.field", {}, h("span", {}, "Farbschema"), segmented([["dark", "Dunkel"], ["light", "Hell"]], get("ui.theme"), (v) => { set("ui.theme", v); applyTheme(); })));
}

export function settingsView(rerender) {
  const z = mode() === "zentrale";
  const parts = [
    ["betrieb", "Betrieb", betrieb(rerender)],
    z && ["verbindung", "Verbindung", verbindung(rerender)],
    ["quellen", "Alarmquellen", quellen(rerender)],
    ["funktionen", "Funktionen", funktionen(rerender)],
    ["alarm", "Alarm", alarm()],
    isConfigured() && ["esp32", "ESP32", esp32()],
    hasPcFeatures && ["pc", "PC", pc(rerender)],
    isTauri && isAndroid && ["android", "Android", androidSection(rerender)],
    ["geraet", "Dieses Gerät", geraet()],
    ["personen", "Personen", personen(rerender)],
    ["sprache", "Alexa & Google", sprache(rerender)],
    z && ["zentrale", "Zentrale", zentrale(rerender)],
    ["sicherheit", "Sicherheit", sicherheit(rerender)],
    ["backup", "Backup", backup(rerender)],
    isTauri && ["updates", "Updates", updates(rerender)],
    ["darstellung", "Darstellung", darstellung()],
  ].filter(Boolean);
  const index = h("nav.section-index", { "aria-label": "Abschnitte" },
    h("ol", {}, parts.map(([id, label]) => h("li", {}, h("a", {
      href: `#/einstellungen/${id}`, "data-id": id,
      // Ohne Hash-Wechsel scrollen: sonst springt jede spätere Änderung wieder zum Abschnitt zurück.
      onclick: (e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); markSection(index, id); },
    }, label)))));
  queueMicrotask(() => { watchSections(index, parts.map(([id]) => id)); applySearch(); });
  const empty = h("p.empty.search-empty", { hidden: true }, "Nichts gefunden. Anderen Begriff versuchen, z. B. „PIN“, „Alexa“ oder „Kennung“.");
  const searchField = h("input.input", {
    type: "search", value: query, placeholder: "Einstellung suchen …", "aria-label": "Einstellungen durchsuchen",
    autocomplete: "off", spellcheck: "false", enterkeyhint: "search",
    oninput: (e) => { query = e.target.value; applySearch(); },
    onkeydown: (e) => { if (e.key === "Escape") { query = ""; e.target.value = ""; applySearch(); } },
  });
  const top = h("div.settings-top", {},
    h("header.page-head", {}, h("div", {}, h("h1", {}, "Einstellungen"), h("p", {}, "Änderungen werden sofort gespeichert.")),
      h("a.btn", { href: "#/diagnose" }, "Test & Diagnose")),
    h("label.search", {}, SEARCH_ICON(), searchField));
  // Höhe der fixierten Kopfzeile für Abschnittsliste und Sprungziele bereitstellen.
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => document.documentElement.style.setProperty("--settings-top-h", `${top.offsetHeight}px`)).observe(top);
  }
  return h("div.page", {},
    top,
    h("div.settings-layout", {}, index, h("div.settings-body", {}, ...parts.map(([, , el]) => el), empty)),
  );
}

/* ── Suche: blendet Abschnitte aus, die nicht passen, und markiert Treffer ── */
let query = "";
// Begriffe, die nicht wörtlich im Abschnitt stehen, aber danach gesucht wird
const KEYWORDS = {
  betrieb: "zentrale nas ugreen raspberry pi koppeln handy pc direkt",
  verbindung: "zentrale nas ip adresse port broker mqtt mosquitto",
  quellen: "melder esp32 sybos apager divera alarm app quelle",
  alarm: "kennung sperrzeit testalarm testmodus",
  esp32: "melder firmware update mindestdauer",
  pc: "ruhezustand herunterfahren sperren autostart windows wake on lan countdown",
  android: "akku hintergrund benachrichtigung dienst",
  geraet: "name gerätename benachrichtigung abgleich sync intervall",
  funktionen: "logbuch statistik jahresrückblick einsätze zusatz",
  personen: "kollege kennung person",
  sprache: "alexa google matter voice monkey ansage sprachassistent",
  zentrale: "selbsttest webhook dienst",
  sicherheit: "pin sperre admin passwort",
  backup: "sichern wiederherstellen export import",
  updates: "update version aktualisieren neue github installieren",
  darstellung: "dunkel hell theme farbe design",
};
const SEARCH_ICON = () => {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>';
  return svg;
};
const norm = (t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function applySearch() {
  const q = norm(query.trim());
  const words = q.split(/\s+/).filter(Boolean);
  const sections = [...document.querySelectorAll(".settings-body > .section")];
  let shown = 0;
  for (const sec of sections) {
    const hay = norm(sec.textContent + " " + (KEYWORDS[sec.id] || ""));
    const hit = words.every((w) => hay.includes(w));
    sec.hidden = !hit;
    if (hit) shown++;
    document.querySelector(`.section-index a[data-id="${sec.id}"]`)?.closest("li")?.toggleAttribute("hidden", !hit);
  }
  const empty = document.querySelector(".search-empty");
  if (empty) empty.hidden = shown > 0;
  highlight(sections.filter((s) => !s.hidden), query.trim().toLowerCase().split(/\s+/).filter(Boolean));
}
// Treffer markieren, ohne das DOM zu verändern (CSS Custom Highlight API)
function highlight(sections, words) {
  if (!globalThis.CSS?.highlights) return;
  CSS.highlights.delete("suche");
  if (!words.length) return;
  const ranges = [];
  for (const sec of sections) {
    const walker = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const str = n.textContent.toLowerCase(); // ohne NFD, damit die Positionen stimmen
      for (const w of words) {
        for (let i = str.indexOf(w); i !== -1; i = str.indexOf(w, i + w.length)) {
          const r = new Range(); r.setStart(n, i); r.setEnd(n, i + w.length); ranges.push(r);
        }
      }
    }
  }
  CSS.highlights.set("suche", new Highlight(...ranges));
}

/* Aktiven Abschnitt in der Abschnittsliste markieren (folgt dem Scrollen). */
let sectionObserver = null;
function markSection(index, id) {
  index.querySelectorAll("a").forEach((a) => {
    const on = a.dataset.id === id;
    if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    // In der waagerechten Leiste (Handy) den aktiven Eintrag sichtbar halten
    if (on && index.scrollWidth > index.clientWidth) index.scrollTo({ left: a.offsetLeft - 16, behavior: "smooth" });
  });
}
function watchSections(index, ids) {
  sectionObserver?.disconnect();
  const visible = new Map();
  sectionObserver = new IntersectionObserver((entries) => {
    for (const e of entries) visible.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : null);
    const top = ids.find((id) => visible.get(id) != null);
    if (top) markSection(index, top);
  }, { rootMargin: "-20% 0px -60% 0px" });
  ids.forEach((id) => { const el = document.getElementById(id); if (el) sectionObserver.observe(el); });
  markSection(index, ids[0]);
}
