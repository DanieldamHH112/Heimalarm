// WLAN-Geräte direkt im Heimnetz schalten – ohne Cloud, ohne Zentrale.
// Gleicher Code im Zentralen-Dienst (zentrale/dienst/src/wifi.js) – bei Änderungen beide anpassen.
//
// Gerät: { id, name, type, host, user?, target? }
//   shelly  – Gen2/3: /rpc/Switch.Set, Gen1: /relay/0 (automatisch)
//   hue     – Hue Bridge (lokale API v1): user = Schlüssel aus „Koppeln“, target = "light:3" | "group:1"
//   wled    – /json/state
//   tasmota – /cm?cmnd=…
// Zustand: { on: bool, bri?: 0–100 }

export const WIFI_TYPES = {
  shelly: { label: "Shelly", hint: "Schalter, Zwischenstecker, Dimmer" },
  hue: { label: "Philips Hue Bridge", hint: "auch IKEA- und andere Zigbee-Lampen an der Bridge" },
  wled: { label: "WLED", hint: "LED-Streifen" },
  tasmota: { label: "Tasmota", hint: "umgeflashte Steckdosen und Lampen" },
};

const json = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const put = (body) => ({ ...json(body), method: "PUT" });
const clamp = (v) => Math.max(1, Math.min(100, Math.round(v)));

async function ok(r) {
  if (!r.ok) throw new Error(`Gerät antwortet mit Fehler ${r.status}`);
  return r.json().catch(() => ({}));
}

/** Gerät schalten. `fetchFn` ist fetch (Node) bzw. das Tauri-HTTP-fetch (App). */
export async function wifiSet(dev, state, fetchFn) {
  const base = `http://${dev.host}`;
  const on = Boolean(state.on);
  const bri = state.bri != null ? clamp(state.bri) : null;
  switch (dev.type) {
    case "shelly": {
      if (bri != null && on) {
        const r = await fetchFn(`${base}/rpc/Light.Set?id=0&on=true&brightness=${bri}`).catch(() => null);
        if (r?.ok) return;
      }
      const r2 = await fetchFn(`${base}/rpc/Switch.Set?id=0&on=${on}`).catch(() => null);
      if (r2?.ok) return;
      await ok(await fetchFn(`${base}/relay/0?turn=${on ? "on" : "off"}`));
      return;
    }
    case "hue": {
      const [kind, id] = String(dev.target || "group:0").split(":");
      const path = kind === "light" ? `lights/${id}/state` : `groups/${id}/action`;
      const body = { on, ...(bri != null && on ? { bri: Math.round((bri / 100) * 254) } : {}) };
      const res = await ok(await fetchFn(`${base}/api/${dev.user}/${path}`, put(body)));
      if (Array.isArray(res) && res[0]?.error) throw new Error(res[0].error.description);
      return;
    }
    case "wled":
      await ok(await fetchFn(`${base}/json/state`, json({ on, ...(bri != null && on ? { bri: Math.round((bri / 100) * 255) } : {}) })));
      return;
    case "tasmota": {
      const cmd = bri != null && on ? `Dimmer ${bri}` : `Power ${on ? "On" : "Off"}`;
      await ok(await fetchFn(`${base}/cm?cmnd=${encodeURIComponent(cmd)}`));
      return;
    }
    default: throw new Error(`Unbekannter Gerätetyp ${dev.type}`);
  }
}

/** Hue Bridge koppeln – vorher den Knopf auf der Bridge drücken. Liefert den Schlüssel. */
export async function huePair(host, fetchFn) {
  const res = await ok(await fetchFn(`http://${host}/api`, json({ devicetype: "heimalarm#app" })));
  if (res[0]?.success?.username) return res[0].success.username;
  throw new Error(res[0]?.error?.type === 101 ? "Bitte zuerst den Knopf auf der Bridge drücken" : res[0]?.error?.description || "Koppeln fehlgeschlagen");
}

/** Lampen und Räume einer Hue Bridge: [{ target, name }] */
export async function hueTargets(host, user, fetchFn) {
  const [lights, groups] = await Promise.all([
    ok(await fetchFn(`http://${host}/api/${user}/lights`)),
    ok(await fetchFn(`http://${host}/api/${user}/groups`)),
  ]);
  return [
    ...Object.entries(groups || {}).map(([id, g]) => ({ target: `group:${id}`, name: `${g.name} (Raum)` })),
    ...Object.entries(lights || {}).map(([id, l]) => ({ target: `light:${id}`, name: l.name })),
  ];
}

/** Alexa-Routine über Voice Monkey starten (Cloud). */
export async function voiceMonkey(token, device, fetchFn) {
  const r = await fetchFn(`https://api-v3.voicemonkey.io/trigger?token=${encodeURIComponent(token)}&device=${encodeURIComponent(device)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) throw new Error({ INVALID_TOKEN: "Token ungültig", DEVICE_NOT_FOUND: "Auslöser nicht gefunden", THROTTLED: "Zu viele Aufrufe", MONTHLY_QUOTA_EXCEEDED: "Monatslimit erreicht" }[j.error] || `Voice Monkey: Fehler ${r.status}`);
}

/** Platzhalter in Texten füllen: {stichwort} {einheit} {adresse} {text} {quelle} {person} {uhrzeit}. Leere fallen weg. */
export function fillTemplate(tpl, ev = {}) {
  const t = ev.ts ? new Date(ev.ts) : new Date();
  const vals = {
    stichwort: ev.keyword, einheit: ev.unit, adresse: ev.address, text: ev.text, quelle: ev.source,
    person: ev.who, uhrzeit: `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`,
  };
  return String(tpl || "")
    .replace(/\{(\w+)\}/gu, (m, k) => (k in vals ? String(vals[k] ?? "").trim() : m))
    .replace(/\s+([,.:;!?])/gu, "$1").replace(/([,:;–-])\s*(?=[,.:;!?]|$)/gu, "").replace(/\s{2,}/gu, " ").trim().replace(/^[,:;–-]\s*/u, "");
}

/** Alexa spricht einen Text auf einem Echo (Voice Monkey „Speaker“-Gerät). a = { device, speech, voice, chime, show } */
export async function voiceMonkeyAnnounce(token, a, ev, fetchFn) {
  const speech = fillTemplate(a.speech || "Einsatz. {stichwort}. {adresse}", ev).slice(0, 400) || "Einsatz";
  const q = new URLSearchParams({ token, device: a.device || "", speech, language: "de-DE" });
  if (a.voice) q.set("voice", a.voice);
  if (a.chime) q.set("chime", a.chime);
  if (a.show) { q.set("text_display", speech); q.set("text_display_bg_colour", "#C42D21"); q.set("text_display_size", "40"); }
  const r = await fetchFn(`https://api-v3.voicemonkey.io/announce?${q}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) throw new Error({ INVALID_TOKEN: "Token ungültig", DEVICE_NOT_FOUND: "Lautsprecher nicht gefunden", THROTTLED: "Zu viele Aufrufe", MONTHLY_QUOTA_EXCEEDED: "Monatslimit erreicht" }[j.error] || `Voice Monkey: Fehler ${r.status}`);
  return speech;
}
