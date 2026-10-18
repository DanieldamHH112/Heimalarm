# Heimalarm – Projekt-Kontext

> Arbeitsgrundlage für alle, die am Projekt mitarbeiten (Menschen und KI).
> **Vor jeder Änderung lesen:** Abschnitt [Abhängigkeiten](#abhängigkeiten--was-braucht-was) und [Vorsicht bei Änderungen](#vorsicht-bei-änderungen) zeigen, was sonst kaputtgehen kann.
> Ausführliches Konzept mit Diagrammen: [`docs/Konzept.pdf`](docs/Konzept.pdf) (Stand vor Divera, Ohne-Zentrale und Matter).

## Was ist Heimalarm?

Eine App für **Windows-PC und Android-Handy**, die einen Einsatz-Alarm zuhause weitergibt (Feuerwehr, Rettungsdienst, Wasserwacht, Katastrophenschutz …):

- **Alarm kommt an** über den Melder in der Ladeschale (ESP32 liest den Relaiskontakt, z. B. Motorola TPG2200) und/oder über Alarm-Apps (SYBOS, aPager PRO, Divera 24/7).
- **PC:** Vollbild **„Fährst du?“** mit Countdown, danach Ruhezustand (einstellbar).
- **Handy:** Meldung, Rückmeldung an Divera/aPager, Divera-Status.
- **Zuhause:** Routinen schalten Licht (Zigbee, WLAN-Geräte) und starten Alexa/Google-Routinen.

Zwei **Betriebsarten** (Einstellungen → Betrieb):

| | Mit Zentrale | Ohne Zentrale („direkt“) |
|---|---|---|
| Wer verteilt den Alarm | Raspberry Pi (Mosquitto) | Handy schickt per WLAN an gekoppelte PCs |
| Wer führt Routinen aus | Zentralen-Dienst auf dem Pi | Handy (`routines-local.js`) |
| ESP32-Melder, Zigbee, Matter, Webhook, Selbsttest | ✅ | – |
| WLAN-Geräte, Voice Monkey, Divera, aPager-Rückmeldung | ✅ | ✅ |

**Grundsätze:** kostenlos, Open Source, lokal (Cloud nur, wo der Nutzer sie ausdrücklich wählt: Divera, aPager-API, Voice Monkey), eine Codebasis für PC und Handy. Heimalarm ist eine **Komfortfunktion** – Melder und Alarm-App bleiben die eigentliche Alarmierung.

Der vorhandene Funkhandel-Alarmschalter (Tuya/ELESION/Alexa) bleibt **unverändert als separater zweiter Weg** und ist nicht Teil von Heimalarm. Er teilt sich den Relaiskontakt mit dem ESP32 über einen Y-Verteiler.

## Arbeitsweise & Regeln

- **Workflows kurz und schnell halten.** Wörtlich vom Projektinhaber:
  > „Ich möchte das die workflows kurz und schnell ist, es soll keine selftest etc enthalten so dads wenn wir commiten und pushen bsw eine Release version erstellen wollen das es nicht lange dauert wenn wir zb nur bug fixes gemacht haben“

  Konkret: keine Tests, kein Linting, keine Prüfschritte in GitHub Actions. Normale Pushes lösen keinen Build aus. Nur ein Tag `v*` (oder manueller Start) baut das Release.
- **Prüfen passiert lokal** (siehe [Prüfen](#prüfen-lokal-nicht-in-ci)): Oxlint muss 0 Befunde haben.
- **UI in HTML, CSS und JavaScript** (Tauri 2). Kein Framework, ES-Module, klein und modular.
- **Texte kurz, informativ, gut lesbar**, auf Deutsch, ohne Fachjargon. Jede Einstellung hat einen Satz Erklärung.
- **Nur zeigen, was eingerichtet ist:** Übersicht, Diagnose, Navigation und Protokoll blenden alles aus, was der Nutzer nicht nutzt (`core/features.js`). **Einstellungen zeigen immer alles.**
- **Tests nicht im Dashboard:** Testalarm und Simulation liegen unter Einstellungen → Alarm bzw. Test & Diagnose.
- **Ohne Vorwissen einrichtbar:** sinnvolle Standardwerte, „In 3 Schritten startklar“, Testalarm ohne Folgen.
- **Responsiv:** Seitenleiste (breit) → nur Symbole (≤ 1080 px) → Leiste unten (Handy, ≤ 760 px).
- **Dunkel ist Standard**, Hell die zweite Auswahl. **Ecken nur minimal gerundet** (`--radius` 4 px, `--radius-sm` 3 px).
- **Keine Geheimnisse im Repo.** WLAN-, MQTT- und Signier-Daten nur lokal (`secrets.yaml`) oder als GitHub-Secret. API-Schlüssel der Nutzer (Divera, aPager) bleiben nur auf dem Gerät.
- **Repo bleibt privat** während der Entwicklung. **iOS-Build** vorerst nicht vorgesehen.
- **UI-Arbeit** mit den Skills `/impeccable` und `/frontend-design`.
- **Nicht raten:** Bei unklaren Anforderungen oder unbekannten Schnittstellen nachfragen bzw. Quelle prüfen (Doku, Spec).

## Ordner – was liegt wo

```
Heimalarm/
├─ README.md               Für Nutzer: was es kann, Einrichtung, kompatible Geräte
├─ Context.md              Diese Datei (für Entwicklung)
├─ .github/workflows/
│  └─ release.yml          Build nur bei Tag v*: Windows (.exe, NSIS) + Android (.apk, debug-signiert)
├─ app/                    Die App für PC und Handy (Tauri 2)
│  ├─ index.html           Grundgerüst, Navigation (5 Punkte; Handy: „Mehr“ statt „Einstellungen“)
│  ├─ package.json         Version der App (gilt auch für tauri.conf.json), Skript „lint“
│  ├─ vite.config.js       Port 1420, setzt PACKAGE_VERSION
│  ├─ .oxlintrc.json       Lint-Regeln
│  ├─ public/fonts/        Archivo, JetBrains Mono (offline)
│  ├─ src/                 Oberfläche (HTML/CSS/JS) – siehe „App-Struktur“
│  ├─ src-tauri/           Rust-Kern + Tauri-Konfiguration
│  │  ├─ src/lib.rs        Befehle: PC-Aktionen, Prozesse, Medien, Ruhezustand, MAC, Wake-on-LAN
│  │  ├─ src/direct.rs     Empfänger für Alarme vom Handy (ohne Zentrale), Port 8765
│  │  ├─ capabilities/     Rechte der Oberfläche: default.json (inkl. HTTP-Scope), desktop.json (Autostart)
│  │  └─ tauri.conf.json   Fenster, Bundle, Android-Einstellungen
│  └─ plugins/heimalarm/   Eigenes Tauri-Plugin (Rust + Kotlin) für Android:
│                          AlarmListener (Benachrichtigungen mitlesen), KeepAliveService (Hintergrund), Akku-Optimierung
├─ zentrale/               Alles für den Raspberry Pi (nur Betriebsart „Mit Zentrale“)
│  ├─ docker-compose.yml   mosquitto · dienst · zigbee2mqtt (Profil zigbee) · matterbridge (Profil matter)
│  ├─ mosquitto/           mosquitto.conf (1883 TCP, 9001 WebSocket)
│  └─ dienst/              Zentralen-Dienst (Node.js)
│     ├─ src/index.js      Start, MQTT, Konfiguration (DEFAULTS), verteilt Nachrichten
│     ├─ src/rules.js      Routinen: Auslöser, Bedingungen, Aktionen, „Wieder da“, Wake-on-LAN
│     ├─ src/webhook.js    aPager-Webhook (Port 8080, mit Schlüssel)
│     ├─ src/selftest.js   wöchentlicher Selbsttest
│     ├─ src/voice.js      Matter-Bridge (Kontaktsensoren für Alexa/Google), Port 5541
│     ├─ src/wifi.js       WLAN-Geräte + Voice Monkey (KOPIE von app/src/core/wifi.js)
│     ├─ src/log.js        Protokoll der Zentrale
│     └─ tools/            devbroker.js (Test-Broker), sim.js (ESP32/Zigbee-Simulator)
├─ esp32/                  ESPHome: alarm-ich.yaml (ESP32, GPIO27), alarm-ich-s3.yaml (ESP32-S3, GPIO4), secrets.example.yaml
└─ docs/                   Konzept.pdf, logo.svg, ablauf.svg, ohne-pi.svg, screenshots/
```

### App-Struktur (`app/src/`)

| Datei | Aufgabe |
|---|---|
| `main.js` | Start, Router, Live-Aktualisierung, ESP32-Warnungen, startet Divera-Abfrage, PC-Empfänger, lokale Routinen |
| **core/** | |
| `settings.js` | Lokale Einstellungen + Standardwerte, `mode()`, `isConfigured()`, `SYNC_KEYS` |
| `shared.js` | Gemeinsame Daten (Personen, Routinen, WLAN-Geräte, Voice Monkey …): mit Zentrale retained über MQTT, ohne lokal |
| `features.js` | `has.*` – was ist eingerichtet? Steuert, was Ansichten zeigen |
| `mqtt.js` | Verbindung zur Zentrale, Topics auswerten, Zigbee-Befehle, `state` |
| `engine.js` | Alarm-Logik: Quellen, Sperrzeit je Person, Test/Probe, Ruhezeit, „Fährst du?“, Antwort an Apps |
| `direct.js` | Ohne Zentrale: PC-Empfänger starten, Handy sendet an gekoppelte PCs |
| `routines-local.js` | Ohne Zentrale: Routinen auf dem Handy ausführen |
| `wifi.js` | WLAN-Geräte (Shelly, Hue, WLED, Tasmota) + Voice Monkey (KOPIE in zentrale/dienst/src/wifi.js) |
| `divera.js` | Divera-API: laden, Alarme abfragen, Rückmeldung, Status |
| `apager.js` | aPager-Rückmeldung (Alamos-API) |
| `pc.js` | PC-Funktionen (Rust-Befehle) |
| `android.js` | Android-Plugin (Dienst, Akku, Benachrichtigungen) |
| `admin.js` | Admin-PIN (G3), App-Sperre (H4) |
| `notify.js`, `log.js`, `platform.js`, `events.js` | Systemmeldung, Geräte-Protokoll, Plattform, Ereignisse |
| **views/** | `overview` (Übersicht), `devices` + `wifi` (Geräte), `routines`, `log`, `settings`, `diagnose`, `takeover` („Fährst du?“) |
| **ui/** | `dom.js` (`h()`, toast), `form.js` (Felder, Schalter, Dialog), `theme.js`, `sound.js` |
| **styles/** | `tokens.css` (Farben, Schrift, Radien), `base`, `layout`, `components`, `takeover` |
| `dev/demo.js` | Beispieldaten (nur `npm run dev` mit `?demo`) |

Neue Funktion = Modul in `core/` + ggf. Ansicht in `views/`. Lokale Einstellungen in `settings.js` (`defaults`), gemeinsame in `shared.js` (`sharedDefaults`) und im Dienst (`DEFAULTS` in `index.js`) mit Standardwert ergänzen. Sichtbarkeit über `features.js`.

## Abhängigkeiten – was braucht was

```
                ┌──────────── Mit Zentrale ─────────────┐
ESP32 ──MQTT──► Mosquitto ◄──WebSocket 9001──► App (PC/Handy)
                   ▲   ▲                          │
   Zigbee2MQTT ────┘   └──── Zentralen-Dienst ────┘ (Routinen, Webhook, Matter, Selbsttest)
                                 │
              WLAN-Geräte (HTTP) ┘ · Voice Monkey (Internet) · Alexa/Google (Matter, mDNS)

                ┌──────────── Ohne Zentrale ────────────┐
Alarm-App ─► Handy (liest mit) ──HTTP 8765 + Code──► PC (direct.rs)
                 └─► WLAN-Geräte (HTTP) · Voice Monkey (Internet)
Divera-API ◄── PC und Handy fragen selbst ab (beide Betriebsarten)
```

| Teil | Braucht | Wird gebraucht von |
|---|---|---|
| **ESP32** | WLAN, Mosquitto (1883), `secrets.yaml` | Quelle „Melder“ |
| **Mosquitto** | Docker auf dem Pi | ESP32, Dienst, Zigbee2MQTT, Matterbridge, App (9001) |
| **Zentralen-Dienst** | Mosquitto, `network_mode: host` (Wake-on-LAN, Matter-mDNS), Volume `dienst/data` | Routinen, Webhook, Matter-Sensoren, Selbsttest, „Wieder da“ |
| **Zigbee2MQTT** | Zigbee-USB-Stick, Mosquitto, Profil `zigbee` | Seite Geräte (Zigbee), Routinen mit Zigbee-Geräten, Matterbridge |
| **Matterbridge** | Zigbee2MQTT, Profil `matter`, Port 8283 | Zigbee-Licht in Alexa/Google |
| **Matter-Sensoren** (`voice.js`) | IPv6 + mDNS im Heimnetz, Dienst | Alexa/Google-Routinen bei Alarm |
| **App (Zentrale)** | Adresse der Zentrale, Port 9001 | – |
| **App (direkt), PC** | `direct.rs`, freier Port 8765, Firewall „Private Netzwerke“ | Handy sendet Alarme |
| **App (direkt), Handy** | Android-Plugin (Benachrichtigungen, Hintergrund-Dienst), gekoppelte PCs | Routinen ohne Zentrale |
| **Android-Plugin** | Rechte: Benachrichtigungszugriff, Akku-Ausnahme, Foreground-Service | SYBOS/aPager/Divera mitlesen |
| **Divera** | persönlicher Accesskey, Internet, HTTP-Scope `*.divera247.com` | Quelle Divera, Rückmeldung, Status-Karte |
| **aPager-Rückmeldung** | API-Schlüssel + Smart-Home-Abo, Scope `alamos-backend…` | „Ich fahre / nicht“ |
| **WLAN-Geräte** | Geräte-IP im Heimnetz, Scope `http://*:*/*` | Routinen (Handy oder Dienst) |
| **Voice Monkey** | Token, Internet, Scope `api-v3.voicemonkey.io` | Routinen-Aktion „Alexa“ |

## Schnittstellen

### MQTT-Topics (nur mit Zentrale)

| Topic | Inhalt | Von → An |
|---|---|---|
| `alarm/<kennung>` | `ALARM` oder JSON `{source, keyword, unit, text, address, diveraId, test, probe}` | ESP32, Webhook, App → alle |
| `alarm/<kennung>/status` | `online` / `offline` (Last Will) | ESP32 |
| `alarm/<kennung>/sensor/wifi_signal\|uptime/state`, `…/text_sensor/ip\|version/state` | WLAN, Laufzeit, IP, Firmware | ESP32 |
| `alarm/<kennung>/number/min_duration/command\|state` | Mindestdauer Kontakt (A3) | App ↔ ESP32 |
| `alarm/<kennung>/ota` | `<url>|<md5>` Firmware-Update (A10) | App → ESP32 |
| `heimalarm/clients/<id>` | `{name, platform, version, online, ts, mac}` (retained, Last Will) | jede App |
| `heimalarm/config/shared` | gemeinsame Daten (retained), siehe unten | Apps ↔ Dienst |
| `heimalarm/cmd/run\|restore\|wol\|selftest` | Routine, „Wieder da“, Wake-on-LAN, Selbsttest | App → Dienst |
| `heimalarm/cmd/voice/test\|reset` | Matter-Sensor testen, Kopplungen löschen | App → Dienst |
| `heimalarm/voice/status` | `{enabled, running, qr, manual, commissioned, fabrics, sensors, error}` (retained) | Dienst |
| `heimalarm/log`, `heimalarm/log/recent` | Protokoll der Zentrale | Dienst |
| `heimalarm/report` | Selbsttest-Bericht (retained) | Dienst |
| `heimalarm/dienst/status`, `heimalarm/ping` → `heimalarm/pong` | Dienst-Status, Verbindungstest | Dienst |
| `zigbee2mqtt/#` | Geräte, Gruppen, Zustände, Befehle | Zigbee2MQTT |

### Ports

| Port | Wo | Wofür |
|---|---|---|
| 1883 | Pi | MQTT (ESP32, Dienst, Matterbridge) |
| 9001 | Pi | MQTT über WebSocket (App) |
| 8080 | Pi | aPager-Webhook `/alarm/<schlüssel>?who=<kennung>` |
| 8081 | Pi | Zigbee2MQTT-Oberfläche |
| 5541 | Pi | Matter-Sensoren (Dienst) |
| 5540, 8283 | Pi | Matterbridge (Matter, Oberfläche) |
| 8765 | PC | Empfänger für Alarme vom Handy (ohne Zentrale) |

### Direktverbindung (ohne Zentrale)

`GET /ping`, `POST /alarm` (JSON wie `alarm/<kennung>`), Kopfzeile `X-Heimalarm-Key: <8-stelliger Code>`. Falscher Code → 403. Code am PC unter Einstellungen → Betrieb, „Neuer Code“ macht alte Kopplungen ungültig. Nur Heimnetz, kein TLS.

### Externe APIs

| Dienst | Endpunkte | Schlüssel |
|---|---|---|
| **Divera 24/7** (Spec: `api.divera247.com/docs/*.yaml`) | `GET /api/v2/pull/all` (Einheit, `cluster.status`, `statussorting_statusgeber`/`_alarm`, `status.status_id`) · `GET /api/v2/alarms` · `POST /api/v2/alarms/confirm/{id}` `{Status:{id,note}}` · `POST /api/v2/statusgeber/set-status` `{Status:{id,note,reset_date,reset_to}}` | `?accesskey=` persönlich; ungültig → 401 |
| **aPager PRO** (Alamos) | `GET alamos-backend.ey.r.appspot.com/fe2/feedback/user/external?authToken&mode=accept\|reject[&suppressNotification=true]` – 200 ok, 204 kein Alarm (3 min), 403 Schlüssel, 409 kein Abo | aPager → Verfügbarkeit → Externer Zugriff |
| **Voice Monkey** | `GET https://api-v3.voicemonkey.io/trigger?token&device` | Token aus voicemonkey.io |
| **Shelly** | Gen2/3 `/rpc/Switch.Set`, `/rpc/Light.Set`; Gen1 `/relay/0?turn=` | – |
| **Hue Bridge** (API v1) | `POST /api {devicetype}` nach Knopfdruck → Schlüssel; `PUT /api/<key>/lights/<id>/state`, `/groups/<id>/action` | Schlüssel aus Koppeln |
| **WLED / Tasmota** | `POST /json/state` · `/cm?cmnd=Power On\|Dimmer 40` | – |
| **SYBOS** | keine offene Schnittstelle für Mitglieder (syBOS-Webservices nur mit Berechtigung der Verwaltung, liefern Einsatzarchiv). Nur Mitlesen der Benachrichtigung. | – |

Android-Paketnamen: SYBOS `at.syPhone`, aPager PRO `org.xcrypt.apager.android2`, Divera über „Erkennen“ in der App.

## Daten & Einstellungen

| Wo | Inhalt | Synchronisiert? |
|---|---|---|
| `settings.js` (localStorage `heimalarm.settings.v1`) | Betrieb, Verbindung, Alarm (Kennung, Quellen, Filter), PC, Gerät, Theme, App-PIN, Android, `divera` (Accesskey!), `apager` (Schlüssel!), `direct` (Code, gekoppelte PCs) | nur `SYNC_KEYS` = `alarm`, `notify`, `ui` (Kennung bleibt je Gerät), nur mit Zentrale |
| `shared.js` (`heimalarm/config/shared` bzw. localStorage `heimalarm.shared.local`) | Personen, Routinen, Standort, Urlaubsmodus, Webhook-Schlüssel, Admin-PIN-Hash, `voice`, `wifi` (Geräte), `voicemonkey.token`, `common` (synchronisierte Einstellungen) | mit Zentrale an alle Geräte; ohne Zentrale nur lokal |
| Dienst `DEFAULTS` (`zentrale/dienst/src/index.js`) | Standardwerte derselben gemeinsamen Daten | – |
| `localStorage heimalarm.divera.seen` | bereits gesehene Divera-Alarme | – |

Routine (gleiches Format in App und Dienst):
`{ id, name, enabled, who:[kennung], trigger:{type: alarm|time|device|manual, at, device, property, value}, conditions:{mode: and|or, items:[{type: time|weekday|sun|home|keyword|unit, …}]}, actions:[{type: device|group|delay|restore|voicemonkey|publish, …}], restoreAfterMin }`
Aktion `device` schaltet ein WLAN-Gerät, wenn ein Gerät mit diesem Namen in `shared.wifi` steht, sonst Zigbee.

## Vorsicht bei Änderungen

Diese Stellen hängen zusammen – eine Seite ändern heißt die andere mitziehen:

- **`app/src/core/wifi.js` ⇄ `zentrale/dienst/src/wifi.js`** sind dieselbe Datei. Immer beide ändern (kopieren).
- **Routinen-Format** wird in `views/routines.js` gebaut und von `zentrale/dienst/src/rules.js` **und** `core/routines-local.js` ausgeführt. Neue Aktion/Bedingung in allen dreien.
- **Gemeinsame Daten:** neues Feld in `shared.js` (`sharedDefaults`) **und** Dienst `DEFAULTS`. Der Dienst übernimmt die Konfiguration flach (`{...DEFAULTS, ...cfg}`) – verschachtelte Objekte immer komplett schreiben.
- **Alarm-JSON** (`alarm/<kennung>`, `POST /alarm`): `parseAlarm` gibt es in `core/mqtt.js` und `zentrale/dienst/src/index.js`; `engine.js` und `rules.js` lesen `keyword`, `unit`, `test`, `probe`, `diveraId`.
- **ESP32-Topics** (`alarm/<kennung>/…`) kommen aus `esp32/alarm-ich.yaml` bzw. `alarm-ich-s3.yaml` (`topic_prefix`, beide gleich halten). Umbenennen bricht App-Anzeige, Warnungen und Selbsttest.
- **HTTP aus der App** geht nur zu Adressen im Scope von `capabilities/default.json`. Neue externe API → Scope ergänzen, sonst schlägt `fetch` still fehl.
- **Rust-Befehle** müssen in `lib.rs` → `generate_handler!` stehen; Namen in JS (`invoke("…")`) gleich halten.
- **Android-Plugin:** Kotlin-Name `heimalarm`, Event `notification` `{app, title, text}` – wird in `core/android.js` abgehört.
- **Sperrzeit** prüft `engine.js` (App) und `rules.js` (Dienst) getrennt; `routines-local.js` verlässt sich auf `engine.js`.
- **Sichtbarkeit:** Neue Karten/Seiten über `has.*` in `features.js` freischalten, sonst erscheinen sie auch bei Nutzern ohne diese Ausstattung.
- **Betriebsart:** `isConfigured()` ist nur im Zentrale-Betrieb wahr. Code, der „ist eine Zentrale da?“ fragt, nutzt `has.pi()` bzw. `isConfigured()`, nicht nur `broker.host`.
- **Matter-Speicher** (`zentrale/dienst/data/matter`) enthält die Kopplungen. Löschen = alle Alexa/Google-Kopplungen weg.
- **Version** steht nur in `app/package.json` (Tauri liest sie von dort); Dienst-Version in `zentrale/dienst/src/index.js` (`VERSION`) und `package.json`.
- **Android Release-Build:** braucht Cleartext-Freigabe (siehe Offene Punkte), sonst bricht alles mit `http://`/`ws://` am Handy.
- **CI** (`release.yml`): Android nutzt das vorinstallierte SDK/NDK des Runners (kein setup-android). Keine Test-/Lint-Schritte hinzufügen (Regel oben).

## Design-System

Farbwelt **„Leitstelle“**: ruhig und kontrastreich, Signalrot nur für Alarm und Hauptaktion. Dunkel ist Standard. Ecken minimal (4 px / 3 px), Statuspunkte und der Countdown-Ring bleiben rund.
Schriftgrößen: mindestens 14 px (Labels), Hilfstexte 15 px, Fließtext 16 px.

| Token | Hell | Dunkel | Einsatz |
|---|---|---|---|
| `--bg` | `#f4f2ee` | `#0e1013` | Hintergrund |
| `--surface` | `#ffffff` | `#171a1f` | Karten, Navigation |
| `--line` | `#e2ddd4` | `#2c313a` | Linien |
| `--text` / `--text-2` | `#16181d` / `#4c525d` | `#f1f2f4` / `#a3aab5` | Text / Hilfstext |
| `--signal` | `#c42d21` | `#e5432f` | Alarm, Hauptknopf |
| `--ok` | `#24704a` | `#4cc287` | Verbunden, online |
| `--warn` | `#8f5d0e` | `#e9a945` | Warnungen |
| `--info` | `#2c5a88` | `#7cb0e4` | Hinweise, Fokus |
| `--radius` / `--radius-sm` | 4 px / 3 px | | Karten / Knöpfe, Chips, Felder |

Schrift: **Archivo** (Text, Titel), **JetBrains Mono** (Topics, Uhrzeiten, Codes) – in `app/public/fonts`. Logo: Haus mit Funkwellen auf Signalrot, `docs/logo.svg`. README-Grafiken (`docs/*.svg`) nutzen dieselben Farben und passen sich hell/dunkel an.

## Fahrplan

| Stufe | Inhalt | Stand |
|---|---|---|
| 1 | ESP32, Mosquitto-Zentrale, App-Grundgerüst | ✅ |
| 2 | Windows: „Fährst du?“, Ruhezustand, Autostart | ✅ |
| 3 | Zigbee2MQTT + Zentralen-Dienst: Routinen, Licht | ✅ erste Version |
| 4 | Handy: Geräte anlernen, steuern, Routinen | ✅ erste Version |
| 5 | Android: Benachrichtigungen mitlesen, Hintergrund-Dienst, Webhook | ✅ auf echtem Gerät zu prüfen |
| 6 | Alexa & Google über Matter (Sensoren + Matterbridge) | ✅ Kopplung am Pi zu prüfen |
| 7 | Alarmquellen wählbar, Divera-API, aPager-Rückmeldung | ✅ mit echtem Zugang zu prüfen |
| 8 | Nur zeigen, was eingerichtet ist | ✅ |
| 9 | Ohne Zentrale: Handy↔PC, WLAN-Geräte, Routinen auf dem Handy, Voice Monkey | ✅ mit echten Geräten zu prüfen |

## Funktionsliste – Einschränkungen

Nummern wie im Konzept (A–I). Alles in erster Version umgesetzt, außer:

- **E2 Widget:** kein echtes Android-Widget; Ersatz: Karte „Schnellaktionen“ („Wieder da“, Routinen „Nur per Knopf“).
- **D5 Ton:** über die App mit eigener Lautstärke; Windows-Stummschaltung wird nicht aufgehoben.
- **A10 Firmware-Update:** braucht eine `.ota.bin` im Heimnetz plus MD5.
- **C10 Netzwerkkarte:** Tabelle statt Grafik. **H4 App-Sperre:** PIN, kein Fingerabdruck.
- **F4 Updates:** prüft GitHub-Releases – erst bei öffentlichem Repo.
- **Ohne Zentrale:** kein ESP32, kein Zigbee (außer über Hue Bridge), kein Google Home, keine Bedingung „Jemand zuhause“, kein „Vorher-Zustand“.
- **Koppeln Handy↔PC:** per Adresse + Code (kein QR-Scan).

| Bereich | Wo in der App |
|---|---|
| Betrieb, Kopplung | Einstellungen → Betrieb |
| A Alarmeingang | Einstellungen → Alarmquellen, Alarm, ESP32 · `engine.js` |
| B Routinen | Seite Routinen (Dienst bzw. Handy führt aus) |
| C Licht & Geräte | Seite Geräte (WLAN, Zigbee) |
| D Windows-PC | Einstellungen → PC · Vollbild-Abfrage |
| E Handy | Übersicht, Protokoll, Einstellungen → Android/Dieses Gerät/Darstellung |
| F Zentrale | Einstellungen → Verbindung, Zentrale, Backup · Protokoll → Zentrale |
| G Personen | Einstellungen → Personen, Sicherheit · Routinen „Für wen“ |
| H Sicherheit | Einstellungen → Verbindung, Zentrale, Sicherheit |
| I Test & Diagnose | Einstellungen → Alarm (Testalarm) · Test & Diagnose |
| Sprachassistenten | Einstellungen → Alexa & Google |

## Prüfen (lokal, nicht in CI)

```bash
cd app && npm install
npm run lint                 # Oxlint – muss 0 Befunde haben
npm run dev                  # http://localhost:1420/?demo – Beispieldaten
npx tauri dev                # als Windows-Programm
cd src-tauri && cargo check  # Rust

cd zentrale/dienst && npm install
npm run devbroker                          # Test-Broker (Terminal 1)
MQTT_URL=mqtt://127.0.0.1:1883 npm start   # Dienst (Terminal 2)
node tools/sim.js                          # ESP32/Zigbee-Simulator (Terminal 3) – App mit 127.0.0.1 verbinden

esphome config esp32/alarm-ich.yaml        # ESP32-Konfiguration
git tag vX.Y.Z && git push --tags          # Release (.exe + .apk)
```

Nicht in der Cloud-Testumgebung prüfbar: Matter (braucht IPv6/mDNS), echte Android-Benachrichtigungen, Windows-PC-Aktionen.

## Offene Punkte / Hinweise

- Relaiskontakt der Ladeschale vor dem Anschluss messen (potentialfrei?). Sonst Optokoppler.
- Android: Akku-Optimierung trotz Hintergrund-Dienst ausschalten (Einstellungen → Android).
- Android-APK ist **debug-signiert**; fester Signierschlüssel als GitHub-Secret folgt.
- **Android und unverschlüsseltes HTTP:** Die Debug-APK erlaubt `ws://`/`http://` (Tauri setzt `usesCleartextTraffic` nur im Debug-Build). **Beim Wechsel auf eine signierte Release-APK** muss Cleartext freigegeben werden, sonst gehen Zentrale (`ws://`), PC-Kopplung und WLAN-Geräte am Handy nicht.
- Divera: Status-Namen aus `pull/all` mit echtem Zugang prüfen; Divera-App-Paketname per „Erkennen“.
- Teilen von Alarmen zwischen Haushalten: Idee, nicht geplant.
