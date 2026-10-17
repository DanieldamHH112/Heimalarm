import { h, toast } from "../ui/dom.js";
import { settings, set } from "../core/settings.js";
import { connect } from "../core/mqtt.js";
import { ACTIONS, setAutostart } from "../core/pc.js";
import { hasPcFeatures } from "../core/platform.js";
import { applyTheme } from "../ui/theme.js";

const field = (label, input, hint) => h("label.field", {}, h("span", {}, label), input, hint && h("small", {}, hint));

function text(path, attrs = {}) {
  const [a, b] = path.split(".");
  return h("input.input", { value: settings()[a][b] ?? "", ...attrs, onchange: (e) => set(path, attrs.type === "number" ? Number(e.target.value) : e.target.value) });
}

function toggle(path, label, hint, after) {
  const [a, b] = path.split(".");
  return h("label.switch", {},
    h("div", {}, label, hint && h("small", {}, hint)),
    h("input", { type: "checkbox", role: "switch", checked: !!settings()[a][b], onchange: (e) => { set(path, e.target.checked); after?.(e.target.checked); } }),
  );
}

function segmented(path, options, after) {
  const [a, b] = path.split(".");
  const wrap = h("div.segmented", { role: "group" });
  const render = () => {
    wrap.replaceChildren(...options.map(([v, label]) =>
      h("button", { type: "button", "aria-pressed": String(settings()[a][b] === v), onclick: () => { set(path, v); render(); after?.(v); } }, label)));
  };
  render();
  return wrap;
}

const section = (title, sub, ...body) => h("section.card.section", {}, h("header", {}, h("h2", {}, title), sub && h("p", {}, sub)), ...body);

export function settingsView(rerender) {
  const s = settings();

  const verbindung = section("Verbindung", "Die Zentrale (Raspberry Pi) mit Mosquitto. Ohne sie gibt es keine Alarme.",
    h("div.fields", {},
      field("Adresse", text("broker.host", { placeholder: "z. B. 192.168.1.10", inputmode: "url", autocomplete: "off" }), "IP oder Name im Heimnetz"),
      field("Port", text("broker.port", { type: "number", min: 1, max: 65535 }), "WebSocket, Standard 9001"),
      field("Benutzer", text("broker.user", { autocomplete: "off" }), "Leer lassen, wenn nicht nötig"),
      field("Passwort", text("broker.pass", { type: "password", autocomplete: "off" })),
    ),
    toggle("broker.tls", "Verschlüsselt (TLS)", "Nur aktivieren, wenn die Zentrale ein Zertifikat hat."),
    h("div.row", {}, h("button.btn.primary", { onclick: () => { connect(); toast("Verbinde mit der Zentrale …"); setTimeout(rerender, 1500); } }, "Speichern & verbinden")),
  );

  const alarm = section("Alarm", "Wann die App einen Alarm erkennt.",
    h("div.fields", {},
      field("Meine Kennung", text("alarm.me", { autocomplete: "off" }), "Gleich wie im ESP32: alarm/<kennung>. Andere Kennungen werden nur angezeigt."),
      field("Sperrzeit (Sekunden)", text("alarm.lockoutSec", { type: "number", min: 0, max: 600 }), "Weitere Signale in dieser Zeit zählen nicht als neuer Alarm."),
      field("Offline-Warnung nach (Sekunden)", text("alarm.offlineWarnSec", { type: "number", min: 30, max: 3600 }), "Warnung, wenn der ESP32 so lange nicht erreichbar ist."),
    ),
    toggle("alarm.mqtt", "Alarm vom ESP32 empfangen", "Hauptweg: Relaiskontakt an der Ladeschale."),
  );

  const pc = hasPcFeatures ? section("PC bei Alarm", "Was nach der Abfrage „Fährst du?“ passiert.",
    h("div.field", {}, h("span", {}, "Aktion"),
      h("select.select", { onchange: (e) => { set("pc.action", e.target.value); rerender(); } },
        Object.entries(ACTIONS).map(([k, v]) => h("option", { value: k, selected: s.pc.action === k }, v.label))),
      h("small", {}, ACTIONS[s.pc.action]?.hint)),
    h("div.fields", {},
      field("Countdown (Sekunden)", text("pc.countdownSec", { type: "number", min: 5, max: 300 })),
      h("div.field", {}, h("span", {}, "Ohne Antwort"), segmented("pc.onTimeout", [["run", "Ausführen"], ["cancel", "Abbrechen"]])),
    ),
    toggle("pc.autostart", "Mit Windows starten", "Damit kein Alarm verpasst wird.", (v) => setAutostart(v).catch(() => toast("Autostart konnte nicht geändert werden"))),
  ) : null;

  const darstellung = section("Darstellung", null,
    h("div.field", {}, h("span", {}, "Farbschema"), segmented("ui.theme", [["system", "System"], ["light", "Hell"], ["dark", "Dunkel"]], applyTheme)),
  );

  return h("div.page", {},
    h("header.page-head", {}, h("div", {}, h("h1", {}, "Einstellungen"), h("p", {}, "Änderungen werden sofort gespeichert."))),
    verbindung, alarm, pc, darstellung,
  );
}
