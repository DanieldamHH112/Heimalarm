# Heimalarm – was bisher gemacht wurde

Stand: 18.10.2026 · Repo: `DanieldamHH112/Heimalarm` (privat)

## Ausgangslage

Zwei Einsatzkräfte mit Motorola TPG2200 in der Ladeschale. Alarm kommt über den Melder sowie die Apps SYBOS, aPager PRO und Divera. Ziel: Bei Alarm soll zuhause automatisch etwas passieren – PC in den Ruhezustand, Licht an, Ansage über Alexa/Google. Der vorhandene Funkhandel-Alarmschalter (Tuya) bleibt als eigener zweiter Weg erhalten.

## Konzept

- Konzept-PDF mit Varianten, Hardware und Anleitung (`docs/Konzept.pdf`).
- Entscheidung: **eigene App „Heimalarm“**, keine Tuya-Cloud, kostenlos, lokal, Open Source.
- Name und Logo: **Heimalarm**, Haus mit Funkwellen auf Signalrot.

## Gebaut

| Bereich | Stand |
|---|---|
| **App für Windows und Android** | Tauri 2, Oberfläche in HTML/CSS/JS. Dunkel als Standard, hell wählbar, responsiv, kurze Texte, Ecken minimal gerundet. |
| **„Fährst du?“ am PC** | Vollbild mit Countdown und Ton. Danach Ruhezustand, Sperren, Herunterfahren oder nichts. Ausnahmen, Ruhezeiten, Medien stoppen, Wake-on-LAN, Autostart. |
| **Alarmquellen** | Melder (ESP32), SYBOS, aPager PRO, Divera 24/7 – mehrere gleichzeitig, Sperrzeit fasst sie zu einem Einsatz zusammen. |
| **Divera** | Persönlicher Accesskey: Alarme abfragen, Rückmeldung zum Einsatz, eigenen Status setzen (auch mit Rücksetzen), Status-Karte auf Start. |
| **aPager PRO** | Mitlesen, Webhook an die Zentrale, Zu-/Absage über die Alamos-API (Smart-Home-Abo nötig). |
| **SYBOS** | Mitlesen der Benachrichtigung. Recherche: keine offene Schnittstelle für Mitglieder. |
| **Zentrale** (Docker) | Mosquitto, Heimalarm-Dienst (Routinen, Webhook, Protokoll, Selbsttest), optional Zigbee2MQTT und Matterbridge. |
| **ESP32** | ESPHome-Konfiguration für ESP32 (GPIO27) und ESP32-S3 (GPIO4), Mindestdauer, Lebenszeichen, Update per WLAN. |
| **Licht & Geräte** | Zigbee über die Zentrale; WLAN-Geräte (Shelly, Hue, WLED, Tasmota) mit und ohne Zentrale. |
| **Routinen** | Auslöser Alarm/Uhrzeit/Gerät/Knopf, Bedingungen (Nacht, dunkel, Wochentag, Stichwort …), pro Person, „Wieder da“, Urlaubsmodus. |
| **Alexa & Google** | Lokal über Matter (Kontaktsensor „Heimalarm Einsatz“ + Matterbridge) oder Alexa über Voice Monkey. |
| **Ohne Zentrale** | Handy und PC koppeln sich mit Code im WLAN; Handy meldet Alarme an den PC und führt Routinen aus. |
| **Bedienung** | Start zeigt Aktiv/Verbindet/Inaktiv und nur, was eingerichtet ist. Einstellungen, Geräte, Routinen und Protokoll in zwei Spalten, Bereichsfarben. Testalarm auf Start und unter Test & Diagnose. Einstellungen gleichen sich zwischen Geräten ab. |
| **Test & Diagnose** | Testalarm, Kontakt simulieren, Komplettprobe, Verbindungstest, wöchentlicher Selbsttest. |
| **Sicherheit** | App-PIN, Admin-PIN, API-Schlüssel bleiben auf dem Gerät, keine Geheimnisse im Repo. |
| **Doku** | README für Nutzer (Grafiken mit/ohne Zentrale, Geräteliste, Einrichtung), `Context.md` für Entwicklung (Ordner, Abhängigkeiten, Schnittstellen, Vorsicht bei Änderungen). |
| **Release** | GitHub Actions nur bei Tag `v*`: Windows `.exe` + Android `.apk`. Keine Tests im Workflow, damit Bugfix-Releases schnell gehen. |

## Hardware-Entscheidungen

- **Zentrale:** vorhandene **UGREEN NASync DXP2800** (Intel N100, 8 GB) statt Raspberry Pi – reicht locker.
- **Melder:** **ESP32-S3 DevKitC-1 (N16R8)** + Jumper-Kabel (ELEGOO-Set) – Konfiguration `esp32/alarm-ich-s3.yaml`.
- **Zigbee** optional: USB-Stick (Sonoff ZBDongle-E) oder Netzwerk-Koordinator (SLZB-06), weil UGREEN USB in Docker nicht offiziell unterstützt.

## Offen

- **Funkhandel-Alarmschalter umflashen?** Er ist ein Tuya-Gerät mit WLAN-Modul und eigenem Steuerchip (Firmware v1.0.10). Nächster Schritt: Auto-Update aus, Gerät öffnen, Platine fotografieren → dann Entscheidung.
- Mit echter Hardware prüfen: Koppeln Handy↔PC, Android-Mitlesen, Divera mit echtem Alarm, Matter auf der NAS, WLAN-Geräte.
- NAS-Einrichtung durchspielen (Docker-Projekt, Ports, Zigbee).
- Fester Android-Signierschlüssel; dabei Cleartext-HTTP fürs Heimnetz freigeben.
- Erstes Release `v0.1.0`.
