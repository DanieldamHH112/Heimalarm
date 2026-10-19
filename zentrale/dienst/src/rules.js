// B – Routinen & Regeln.
//
// Routine = { id, name, enabled, who: [kennung] (leer = alle),
//   trigger: { type: "alarm" | "time" | "device" | "manual", at, device, property, value },
//   conditions: { mode: "and" | "or", items: [ { type, ... } ] },
//   actions: [ { type: "device" | "group" | "delay" | "restore" | "publish", ... } ],
//   restoreAfterMin }  // B8: vorherigen Zustand nach X min wiederherstellen (0 = aus)
//
// Bedingungen: time {from,to} · weekday {days:[1..7]} · sun {is:"dark"|"light"} ·
//              home {who:"any"|clientId} · keyword {contains} · unit {contains} · night {}
import SunCalc from "suncalc";
import { wifiSet, voiceMonkey, voiceMonkeyAnnounce } from "./wifi.js";

export function createRules(ctx, log) {
  const lastAlarm = new Map();   // Sperrzeit je Person
  const timers = new Set();      // laufende Verzögerungen / Ausschalt-Timer
  let snapshot = null;           // B8 – Zustand vor der letzten Routine
  let clock = null;

  const pub = (topic, payload) => ctx.client.publish(topic, typeof payload === "string" ? payload : JSON.stringify(payload), { qos: 1 });
  const wifiDev = (name) => (ctx.config.wifi || []).find((d) => d.name === name);
  /** Zigbee-Payload ({ state, brightness 0–254 }) auf WLAN-Gerät anwenden. */
  const setWifi = (dev, payload) => wifiSet(dev, {
    on: String(payload.state || "ON").toUpperCase() !== "OFF",
    bri: payload.brightness != null ? (Number(payload.brightness) / 254) * 100 : null,
  }, fetch).catch((e) => log.warn(`WLAN-Gerät ${dev.name}`, e.message));
  /** Gerät oder Gruppe schalten – Zigbee über MQTT, WLAN direkt. */
  const switchDevice = (name, payload) => {
    const w = wifiDev(name);
    if (w) setWifi(w, payload); else pub(`zigbee2mqtt/${name}/set`, payload);
  };
  const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };

  // ── Bedingungen ───────────────────────────────────
  function minutesNow(d = new Date()) { return d.getHours() * 60 + d.getMinutes(); }
  const toMin = (hhmm = "00:00") => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };

  function check(cond, event) {
    switch (cond.type) {
      case "time": {
        const n = minutesNow(), a = toMin(cond.from), b = toMin(cond.to);
        return a <= b ? n >= a && n < b : n >= a || n < b; // über Mitternacht
      }
      case "weekday": return (cond.days || []).includes(((new Date().getDay() + 6) % 7) + 1); // 1 = Montag
      case "sun": {
        const { lat, lon } = ctx.config.location || {};
        const t = SunCalc.getTimes(new Date(), lat, lon);
        const dark = Date.now() < t.sunrise.getTime() || Date.now() > t.sunset.getTime();
        return cond.is === "light" ? !dark : dark;
      }
      case "home": {
        const phones = Object.entries(ctx.clients).filter(([, c]) => c.online && c.platform === "Android");
        return cond.who && cond.who !== "any" ? phones.some(([id]) => id === cond.who) : phones.length > 0;
      }
      case "keyword": return String(event?.keyword || "").toLowerCase().includes(String(cond.contains || "").toLowerCase());
      case "unit": return String(event?.unit || "").toLowerCase().includes(String(cond.contains || "").toLowerCase());
      default: return true;
    }
  }

  function allowed(routine, event) {
    const items = routine.conditions?.items || [];
    if (items.length === 0) return true;
    return routine.conditions.mode === "or" ? items.some((c) => check(c, event)) : items.every((c) => check(c, event));
  }

  // ── Aktionen ─────────────────────────────────────
  function takeSnapshot(actions) {
    const names = new Set(actions.filter((a) => a.type === "device").map((a) => a.device));
    snapshot = {};
    for (const n of names) {
      const s = ctx.devices[n];
      if (s) snapshot[n] = pick(s, ["state", "brightness", "color_temp", "color"]);
    }
  }

  function restore() {
    if (!snapshot) return log.info("Nichts wiederherzustellen");
    for (const [n, s] of Object.entries(snapshot)) pub(`zigbee2mqtt/${n}/set`, s);
    log.action("Vorheriger Zustand wiederhergestellt", Object.keys(snapshot).join(", "));
    snapshot = null;
  }

  async function runActions(routine, { dry = false, event = {} } = {}) {
    let wait = 0;
    for (const a of routine.actions || []) {
      if (a.type === "delay") { wait += (Number(a.sec) || 0) * 1000; continue; }
      const run = () => {
        if (dry) return log.info(`Probe: ${describe(a)}`, routine.name);
        if (a.type === "device") {
          switchDevice(a.device, { ...a.payload, ...(a.transition && !wifiDev(a.device) ? { transition: Number(a.transition) } : {}) });
          if (Number(a.offAfterSec) > 0) later(Number(a.offAfterSec) * 1000, () => switchDevice(a.device, { state: "OFF" })); // B7
        } else if (a.type === "group") {
          pub(`zigbee2mqtt/${a.group}/set`, a.payload || { state: "ON" });
        } else if (a.type === "voicemonkey") {
          const token = ctx.config.voicemonkey?.token;
          if (!token) log.warn("Voice Monkey: kein Token eingetragen");
          else voiceMonkey(token, a.device, fetch).then(() => log.action("Alexa-Routine gestartet", a.device)).catch((e) => log.warn("Voice Monkey", e.message));
        } else if (a.type === "announce") {
          const token = ctx.config.voicemonkey?.token;
          if (!token) log.warn("Alexa-Ansage: kein Voice-Monkey-Token eingetragen");
          else voiceMonkeyAnnounce(token, a, event, fetch).then((t) => log.action("Alexa sagt an", t)).catch((e) => log.warn("Alexa-Ansage", e.message));
        } else if (a.type === "publish") {
          pub(a.topic, a.payload ?? "");
        } else if (a.type === "restore") {
          restore();
        }
      };
      if (wait > 0) later(wait, run); else run();
    }
  }

  function describe(a) {
    if (a.type === "device") return `${a.device}: ${JSON.stringify(a.payload)}`;
    if (a.type === "group") return `Gruppe ${a.group}`;
    if (a.type === "voicemonkey") return `Alexa-Routine ${a.device}`;
    if (a.type === "announce") return `Alexa-Ansage auf ${a.device}`;
    return a.type;
  }

  function fire(routine, event = {}) {
    if (!routine.enabled) return;
    if (ctx.config.vacation && !(ctx.config.readiness?.until && ctx.config.readiness.until <= Date.now()) && routine.trigger?.type !== "manual") return log.info("Nicht verfügbar: Routine übersprungen", routine.name); // B9
    // Per Knopf ausgeführt: Bedingungen gelten nicht
    if (!event.manual && !allowed(routine, event)) return log.info("Bedingungen nicht erfüllt", routine.name);
    const dry = Boolean(event.test);
    log.action(dry ? `Routine (Test): ${routine.name}` : `Routine: ${routine.name}`, event.who ? `alarm/${event.who}` : routine.trigger?.type);
    if (!dry) takeSnapshot(routine.actions || []);
    runActions(routine, { dry, event });
    if (!dry && Number(routine.restoreAfterMin) > 0) later(routine.restoreAfterMin * 60e3, restore);
  }

  // ── Auslöser ─────────────────────────────────────
  function onAlarm(who, data) {
    if (!data) return;
    const lockMs = (ctx.config.lockoutSec ?? 60) * 1000;
    if (!data.test && !data.probe && Date.now() - (lastAlarm.get(who) || 0) < lockMs) return;
    if (!data.test && !data.probe) lastAlarm.set(who, Date.now());
    log.alarm(data.test ? "Testalarm" : data.probe ? "Generalprobe" : "Alarm", `${data.source || "?"} · alarm/${who}${data.keyword ? " · " + data.keyword : ""}`);
    const event = { ...data, who, test: Boolean(data.test) };
    ctx.onAlarmAccepted?.(event);
    for (const r of ctx.config.routines || []) {
      if (r.trigger?.type !== "alarm") continue;
      if (r.who?.length && !r.who.includes(who)) continue;   // G2 – Routinen pro Person
      fire(r, event);
    }
  }

  function onDevice(name, s) {
    for (const r of ctx.config.routines || []) {
      const t = r.trigger || {};
      if (t.type === "device" && t.device === name && String(s?.[t.property]) === String(t.value)) fire(r, { device: name });
    }
  }

  function command(cmd, data) {
    if (cmd === "restore") return restore();                                 // B8 – „Wieder da“
    if (cmd === "run") {                                                     // B2 – manuell
      const r = (ctx.config.routines || []).find((x) => x.id === data.id);
      if (r) fire({ ...r, enabled: true }, { manual: true, test: Boolean(data.test) });
      return;
    }
    if (cmd === "wol" && data.mac) return wol(data.mac);                      // D11
  }

  function wol(mac) {
    import("node:dgram").then(({ createSocket }) => {
      const hex = mac.replace(/[^0-9a-f]/giu, "");
      const m = Buffer.from(hex, "hex");
      const pkt = Buffer.concat([Buffer.alloc(6, 0xff), ...Array(16).fill(m)]);
      const s = createSocket("udp4");
      s.bind(() => { s.setBroadcast(true); s.send(pkt, 9, "255.255.255.255", () => s.close()); });
      log.action("Wake-on-LAN gesendet", mac);
    });
  }

  // Zeit-Auslöser: jede Minute prüfen
  function reschedule() {
    clearInterval(clock);
    clock = setInterval(() => {
      const hhmm = new Date().toTimeString().slice(0, 5);
      for (const r of ctx.config.routines || []) if (r.trigger?.type === "time" && r.trigger.at === hhmm) fire(r, { time: hhmm });
    }, 60e3);
  }

  return { onAlarm, onDevice, command, reschedule };
}

function pick(o, keys) {
  const out = {};
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
}
