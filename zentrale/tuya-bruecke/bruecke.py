"""Heimalarm – Tuya-Brücke (Übergangslösung ohne ESP32)

Liest einen Tuya-Tür-/Fensterkontakt (z. B. Funkhandel-Alarmschalter / NX-4900)
über die Smart-Life-Cloud mit und meldet einen Alarm wie der ESP32:
"ALARM" auf alarm/<kennung>.

Anmeldung: Weboberfläche http://<nas>:8082 → User Code eingeben → QR-Code mit
der Smart-Life-App scannen. Die Anmeldung wird in /data/tuya.json gespeichert.
"""

from __future__ import annotations

import html
import io
import json
import logging
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

import paho.mqtt.client as mqtt
import qrcode
import qrcode.image.svg
from tuya_sharing import LoginControl, Manager, SharingDeviceListener, SharingTokenListener

# Offizielle Zugangsdaten der Smart-Life-Anmeldung (wie in der Home-Assistant-Integration)
CLIENT_ID = "HA_3y9q4ak7g4ephrvke"
SCHEMA = "haauthorize"

DATA = os.environ.get("DATA_DIR", "/data")
STORE = os.path.join(DATA, "tuya.json")
KENNUNG = os.environ.get("KENNUNG", "ich")
MQTT_HOST = os.environ.get("MQTT_HOST", "127.0.0.1")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
MQTT_USER = os.environ.get("MQTT_USER", "")
MQTT_PW = os.environ.get("MQTT_PW", "")
WEB_PORT = int(os.environ.get("WEB_PORT", "8082"))
GERAET = os.environ.get("GERAET", "").strip()  # Name oder ID; leer = erster Kontaktsensor
ALARM_BEI = os.environ.get("ALARM_BEI", "geschlossen").strip().lower()  # geschlossen | offen
SPERRE = int(os.environ.get("SPERRE_S", "30"))  # gleiche Meldung innerhalb dieser Zeit ignorieren

CONTACT_CODES = ("doorcontact_state", "contact_state", "switch")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("bruecke")
logging.getLogger("tuya_sharing").setLevel(logging.WARNING)

state = {
    "angemeldet": False,
    "qr": None,          # laufende Anmeldung: {"token", "user_code"}
    "fehler": "",
    "geraete": [],       # [{id, name, online, kontakt}]
    "ziel": None,        # überwachtes Gerät
    "letzter_alarm": None,
    "verlauf": [],       # letzte Meldungen
}
lock = threading.Lock()
manager: Manager | None = None
last_alarm = 0.0


# ---------- Speicher ----------

def load() -> dict:
    try:
        with open(STORE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save(data: dict) -> None:
    os.makedirs(DATA, exist_ok=True)
    tmp = STORE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f)
    os.replace(tmp, STORE)


class TokenListener(SharingTokenListener):
    def update_token(self, token_info):
        data = load()
        data["token"] = token_info
        save(data)


# ---------- MQTT zur Zentrale ----------

broker = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"tuya-bruecke-{KENNUNG}")
if MQTT_USER:
    broker.username_pw_set(MQTT_USER, MQTT_PW)
broker.will_set("heimalarm/tuya/status", json.dumps({"online": False}), qos=1, retain=True)


def on_broker_connect(client, *_):
    log.info("Mit Zentrale verbunden (%s:%s)", MQTT_HOST, MQTT_PORT)
    publish_status()


broker.on_connect = on_broker_connect


def publish_status():
    with lock:
        ziel = state["ziel"]
        payload = {
            "online": True,
            "angemeldet": state["angemeldet"],
            "kennung": KENNUNG,
            "geraet": ziel["name"] if ziel else None,
            "ts": int(time.time() * 1000),
        }
    broker.publish("heimalarm/tuya/status", json.dumps(payload), qos=1, retain=True)


def fire_alarm(name: str):
    global last_alarm
    now = time.time()
    if now - last_alarm < SPERRE:
        log.info("Meldung von %s innerhalb der Sperrzeit – ignoriert", name)
        return
    last_alarm = now
    broker.publish(f"alarm/{KENNUNG}", "ALARM", qos=1)
    with lock:
        state["letzter_alarm"] = time.strftime("%d.%m.%Y %H:%M:%S")
    log.warning("ALARM von %s → alarm/%s", name, KENNUNG)


# ---------- Tuya ----------

def contact_value(status: dict):
    for code in CONTACT_CODES:
        if code in status:
            return code, status[code]
    return None, None


def is_alarm(value) -> bool:
    # doorcontact_state: True = offen, False = geschlossen
    offen = bool(value)
    return offen if ALARM_BEI == "offen" else not offen


class DeviceListener(SharingDeviceListener):
    def update_device(self, device, updated_status_properties=None, dp_timestamps=None):
        code, value = contact_value(device.status)
        with lock:
            ziel = state["ziel"]
            state["verlauf"] = ([{
                "zeit": time.strftime("%H:%M:%S"),
                "name": device.name,
                "status": {k: device.status.get(k) for k in (updated_status_properties or [])},
            }] + state["verlauf"])[:15]
        refresh_list()
        if not ziel or device.id != ziel["id"] or code is None:
            return
        if updated_status_properties and code not in updated_status_properties:
            return
        zustand = "offen" if value else "geschlossen"
        log.info("%s: %s", device.name, zustand)
        if is_alarm(value):
            fire_alarm(device.name)

    def add_device(self, device):
        refresh_list()

    def remove_device(self, device_id):
        refresh_list()


def refresh_list():
    if not manager:
        return
    geraete = []
    for d in manager.device_map.values():
        code, value = contact_value(d.status)
        geraete.append({
            "id": d.id,
            "name": d.name,
            "online": bool(getattr(d, "online", False)),
            "kontakt": None if code is None else ("offen" if value else "geschlossen"),
        })
    ziel = None
    for g in geraete:
        if GERAET and (g["id"] == GERAET or g["name"].lower() == GERAET.lower()):
            ziel = g
            break
    if not ziel and not GERAET:
        ziel = next((g for g in geraete if g["kontakt"] is not None), None)
    with lock:
        state["geraete"] = geraete
        state["ziel"] = ziel


def start_manager(data: dict) -> None:
    global manager
    manager = Manager(
        CLIENT_ID,
        data["user_code"],
        data["terminal_id"],
        data["endpoint"],
        data["token"],
        TokenListener(),
    )
    manager.add_device_listener(DeviceListener())
    manager.update_device_cache()
    manager.refresh_mq()
    refresh_list()
    with lock:
        state["angemeldet"] = True
        state["fehler"] = ""
        ziel = state["ziel"]
    publish_status()
    if ziel:
        log.info("Überwache „%s“ (Alarm bei: %s)", ziel["name"], ALARM_BEI)
    else:
        log.warning("Kein Kontaktsensor gefunden – GERAET prüfen")


def try_start_saved() -> None:
    data = load()
    if not data.get("token"):
        log.info("Noch nicht angemeldet – Weboberfläche auf Port %s öffnen", WEB_PORT)
        return
    try:
        start_manager(data)
    except Exception as err:  # noqa: BLE001
        log.error("Anmeldung abgelaufen oder ungültig: %s", err)
        with lock:
            state["angemeldet"] = False
            state["fehler"] = "Anmeldung abgelaufen – bitte neu anmelden."


def begin_login(user_code: str) -> None:
    res = LoginControl().qr_code(CLIENT_ID, SCHEMA, user_code)
    if not res.get("success"):
        raise RuntimeError(res.get("msg") or "QR-Code konnte nicht erzeugt werden")
    with lock:
        state["qr"] = {"token": res["result"]["qrcode"], "user_code": user_code}
        state["fehler"] = ""
    threading.Thread(target=wait_login, daemon=True).start()


def wait_login() -> None:
    with lock:
        qr = state["qr"]
    if not qr:
        return
    ctl = LoginControl()
    for _ in range(100):  # ca. 5 Minuten
        time.sleep(3)
        ok, info = ctl.login_result(qr["token"], CLIENT_ID, qr["user_code"])
        if ok:
            data = {
                "user_code": qr["user_code"],
                "terminal_id": info["terminal_id"],
                "endpoint": info["endpoint"],
                "token": {k: info.get(k) for k in ("t", "uid", "expire_time", "access_token", "refresh_token")},
            }
            save(data)
            with lock:
                state["qr"] = None
            log.info("Bei Smart Life angemeldet")
            try:
                start_manager(data)
            except Exception as err:  # noqa: BLE001
                with lock:
                    state["fehler"] = f"Start fehlgeschlagen: {err}"
            return
    with lock:
        state["qr"] = None
        state["fehler"] = "QR-Code abgelaufen – bitte erneut versuchen."


# ---------- Weboberfläche ----------

CSS = """
:root{color-scheme:dark;--bg:#14161a;--fg:#e8e9eb;--muted:#9aa0a8;--card:#1d2026;--line:#2c3038;--red:#d7262e;--ok:#3fb27f}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{max-width:560px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px}h1 span{color:var(--red)}
p{color:var(--muted);margin:4px 0 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:4px;padding:16px;margin:12px 0}
input,button{font:inherit;padding:10px 12px;border-radius:3px;border:1px solid var(--line);background:#101216;color:var(--fg)}
button{background:var(--red);border-color:var(--red);cursor:pointer}
form{display:flex;gap:8px;flex-wrap:wrap}input{flex:1;min-width:180px}
.qr{background:#fff;padding:12px;display:inline-block;border-radius:3px}.qr svg{width:240px;height:240px;display:block}
table{width:100%;border-collapse:collapse;font-size:14px}td{padding:6px 4px;border-top:1px solid var(--line)}
.ok{color:var(--ok)}.err{color:#ff6b6b}.muted{color:var(--muted)}
"""


def qr_svg(text: str) -> str:
    img = qrcode.make(text, image_factory=qrcode.image.svg.SvgPathImage, box_size=10, border=1)
    buf = io.BytesIO()
    img.save(buf)
    return buf.getvalue().decode("utf-8").split("?>", 1)[-1]


def page() -> str:
    e = html.escape
    with lock:
        s = json.loads(json.dumps(state))
    parts = [f"<h1><span>Heimalarm</span> · Tuya-Brücke</h1>",
             f"<p>Meldet den Smart-Life-Kontakt als Melder-Alarm an <code>alarm/{e(KENNUNG)}</code>.</p>"]
    if s["fehler"]:
        parts.append(f'<div class="card err">{e(s["fehler"])}</div>')
    if s["qr"]:
        parts.append('<div class="card"><b>Mit Smart Life scannen</b>'
                     '<p>App öffnen → oben rechts <b>+</b> → <b>Scannen</b>. Danach in der App bestätigen.</p>'
                     f'<div class="qr">{qr_svg("tuyaSmart--qrLogin?token=" + s["qr"]["token"])}</div>'
                     '<p class="muted">Seite aktualisiert sich von selbst.</p></div>')
    elif not s["angemeldet"]:
        parts.append('<div class="card"><b>Anmelden</b>'
                     '<p>User Code aus Smart Life: <b>Ich → Zahnrad → Konto und Sicherheit → User Code</b>.</p>'
                     '<form method="post" action="/login"><input name="code" placeholder="User Code" required>'
                     '<button>QR-Code anzeigen</button></form></div>')
    else:
        ziel = s["ziel"]
        parts.append('<div class="card"><b class="ok">● Angemeldet</b>'
                     f'<p>Überwacht: <b>{e(ziel["name"]) if ziel else "– kein Kontaktsensor –"}</b>'
                     f' · Alarm bei <b>{e(ALARM_BEI)}</b><br>Letzter Alarm: {e(s["letzter_alarm"] or "–")}</p>'
                     '<form method="post" action="/abmelden"><button>Abmelden</button></form></div>')
        rows = "".join(
            f'<tr><td>{e(g["name"])}</td><td class="muted">{e(g["id"])}</td>'
            f'<td>{e(g["kontakt"] or "")}</td></tr>' for g in s["geraete"])
        parts.append(f'<div class="card"><b>Geräte im Smart-Life-Konto</b><table>{rows}</table></div>')
        if s["verlauf"]:
            rows = "".join(f'<tr><td>{e(v["zeit"])}</td><td>{e(v["name"])}</td>'
                           f'<td class="muted">{e(json.dumps(v["status"], ensure_ascii=False))}</td></tr>'
                           for v in s["verlauf"])
            parts.append(f'<div class="card"><b>Letzte Meldungen</b><table>{rows}</table></div>')
    refresh = '<meta http-equiv="refresh" content="4">' if s["qr"] else '<meta http-equiv="refresh" content="15">'
    return ('<!doctype html><html lang="de"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>Tuya-Brücke</title>{refresh}<style>{CSS}</style></head>'
            f'<body><main>{"".join(parts)}</main></body></html>')


class Web(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def send(self, code: int, body: str, ctype="text/html; charset=utf-8"):
        raw = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def redirect(self):
        self.send_response(303)
        self.send_header("Location", "/")
        self.end_headers()

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/status":
            with lock:
                self.send(200, json.dumps(state, ensure_ascii=False), "application/json")
        else:
            self.send(200, page())

    def do_POST(self):
        path = urlsplit(self.path).path
        length = int(self.headers.get("Content-Length") or 0)
        form = parse_qs(self.rfile.read(length).decode("utf-8"))
        if path == "/login":
            code = (form.get("code") or [""])[0].strip()
            try:
                begin_login(code)
            except Exception as err:  # noqa: BLE001
                with lock:
                    state["fehler"] = f"Anmeldung nicht möglich: {err}"
        elif path == "/abmelden":
            logout()
        self.redirect()


def logout():
    global manager
    if manager:
        try:
            if manager.mq:
                manager.mq.stop()
            manager.unload()
        except Exception:  # noqa: BLE001
            pass
        manager = None
    try:
        os.remove(STORE)
    except OSError:
        pass
    with lock:
        state.update(angemeldet=False, geraete=[], ziel=None, verlauf=[])
    publish_status()


def main():
    broker.connect_async(MQTT_HOST, MQTT_PORT)
    broker.loop_start()
    try_start_saved()
    log.info("Weboberfläche auf Port %s", WEB_PORT)
    ThreadingHTTPServer(("0.0.0.0", WEB_PORT), Web).serve_forever()


if __name__ == "__main__":
    main()
