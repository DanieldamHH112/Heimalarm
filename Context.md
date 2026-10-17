# Heimalarm – Projekt-Kontext

> Diese Datei ist die Arbeitsgrundlage für alle, die am Projekt mitarbeiten (Menschen und KI).
> Ausführliches Konzept mit Diagrammen: [`docs/Konzept.pdf`](docs/Konzept.pdf)

## Was ist Heimalarm?

Eine eigene App für **Windows-PC und Android-Handy**, die einen Feuerwehr-Alarm zuhause weitergibt:

- Ein **ESP32** liest bei Alarm den Relaiskontakt der Ladeschale des Melders (Motorola TPG2200).
- Eine kleine **Zentrale** im Heimnetz (Raspberry Pi mit Mosquitto, später Zigbee2MQTT) verteilt das Signal.
- Am **PC** erscheint ein Vollbild-Fenster **„Fährst du?“** mit Countdown. Bei „Ich fahre“ oder ohne Antwort geht der PC in den **Ruhezustand** (einstellbar).
- **Licht und Geräte** werden über Routinen geschaltet (Zigbee, Stufe 3).

**Grundsätze:** kostenlos, Open Source, rein lokal (keine Cloud, kein Tuya), eine Codebasis für PC und Handy.
Die Automation ist eine **Komfortfunktion**, die eigentliche Alarmierung bleibt der Melder.

Der vorhandene Funkhandel-Alarmschalter (Tuya/ELESION/Alexa) bleibt **unverändert als separater zweiter Weg** und ist nicht Teil von Heimalarm. Er teilt sich den Relaiskontakt mit dem ESP32 über einen Y-Verteiler.

## Arbeitsweise & Regeln

- **Workflows kurz und schnell halten.** Wörtlich vom Projektinhaber:
  > „Ich möchte das die workflows kurz und schnell ist, es soll keine selftest etc enthalten so dads wenn wir commiten und pushen bsw eine Release version erstellen wollen das es nicht lange dauert wenn wir zb nur bug fixes gemacht haben“

  Konkret: keine Tests, kein Linting, keine Prüfschritte in GitHub Actions. Normale Pushes lösen keinen Build aus. Nur ein Tag `v*` (oder manueller Start) baut das Release.
- **UI in HTML, CSS und JavaScript** (Tauri 2). Kein Framework, ES-Module, klein und modular.
- **Texte kurz, informativ, gut lesbar**, auf Deutsch, ohne Fachjargon. Jede Einstellung hat einen Satz Erklärung.
- **Ohne Vorwissen einrichtbar:** Übersicht zeigt „In 3 Schritten startklar“, sinnvolle Standardwerte, Testalarm ohne Folgen.
- **Responsiv:** Seitenleiste (breit) → nur Symbole (mittel, ≤ 1080 px) → Leiste unten (Handy, ≤ 760 px).
- **Keine Geheimnisse im Repo.** WLAN-, MQTT- und Signier-Daten nur lokal (`secrets.yaml`) oder als GitHub-Secret.
- iOS-Build vorerst **nicht** vorgesehen.

## Technik

| Teil | Technik | Ort |
|---|---|---|
| App (PC + Android) | Tauri 2, Vite, Vanilla JS, mqtt.js | `app/` |
| Rust-Kern | PC-Aktionen, Prozesse, Medien, Wake-on-LAN, Autostart | `app/src-tauri/` |
| Android-Plugin | Hintergrund-Dienst, Akku-Optimierung, Benachrichtigungen mitlesen (Kotlin) | `app/plugins/heimalarm/` |
| Zentralen-Dienst | Node: Routinen, Webhook, Protokoll, Selbsttest, Wake-on-LAN | `zentrale/dienst/` |
| ESP32 | ESPHome | `esp32/` |
| Zentrale | Docker: Mosquitto, Dienst, Zigbee2MQTT (Profil `zigbee`) | `zentrale/` |
| Release | GitHub Actions, nur bei Tag `v*` | `.github/workflows/release.yml` |

### MQTT-Topics

| Topic | Inhalt | Von |
|---|---|---|
| `alarm/<kennung>` | `ALARM` oder JSON `{source, keyword, unit, test, probe}` | ESP32, Dienst (Webhook), App (Simulation/Benachrichtigung) |
| `alarm/<kennung>/status` | `online` / `offline` (Last Will) | ESP32 |
| `alarm/<kennung>/sensor/wifi_signal\|uptime/state` | WLAN in dBm, Laufzeit in s | ESP32 |
| `alarm/<kennung>/text_sensor/ip\|version/state` | IP, Firmware | ESP32 |
| `alarm/<kennung>/number/min_duration/command\|state` | Mindestdauer Kontakt in ms (A3) | App ↔ ESP32 |
| `alarm/<kennung>/ota` | `<url>|<md5>` – Firmware-Update (A10) | App |
| `heimalarm/clients/<id>` | JSON `{name, platform, version, online, ts, mac}` (retained, Last Will) | jede App |
| `heimalarm/config/shared` | gemeinsame Konfiguration (retained): Personen, Routinen, Standort, Urlaubsmodus, Webhook-Schlüssel, Admin-PIN, synchronisierte Einstellungen | Apps |
| `heimalarm/cmd/run\|restore\|wol\|selftest` | Routine ausführen, „Wieder da“, Wake-on-LAN, Selbsttest | Apps → Dienst |
| `heimalarm/log`, `heimalarm/log/recent` | Protokoll der Zentrale (letzte 200 retained) | Dienst |
| `heimalarm/report` | Wöchentlicher Selbsttest (retained) | Dienst |
| `heimalarm/dienst/status`, `heimalarm/ping` → `heimalarm/pong` | Dienst-Status, Verbindungstest | Dienst |
| `zigbee2mqtt/#` | Geräte, Gruppen, Zustände, Befehle | Zigbee2MQTT |

Ports der Zentrale: `1883` (ESP32, Dienst), `9001` (App über WebSocket), `8080` (Webhook), `8081` (Zigbee2MQTT-Oberfläche).
Eigene Kennung löst am PC die Abfrage aus. Fremde Kennungen erscheinen als Benachrichtigung.

### Einstellungen & Synchronisation

- **Lokal je Gerät** (`settings.js`, localStorage): Verbindung, PC-Einstellungen, Gerätename, App-PIN.
- **Gemeinsam** (`shared.js`, retained auf der Zentrale): Personen, Routinen, Standort, Urlaubsmodus, Webhook-Schlüssel, Admin-PIN.
- **Abgeglichen zwischen Handy und PC:** Alarm-, Benachrichtigungs- und Darstellungs-Einstellungen (außer der eigenen Kennung). Abschaltbar unter *Dieses Gerät*.

### App-Struktur

```
app/src/
  main.js            Start, Router, Live-Aktualisierung, Warnungen
  core/
    settings.js      lokale Einstellungen + Standardwerte
    shared.js        gemeinsame Konfiguration + Sync
    mqtt.js          Verbindung, Topics auswerten, Zigbee-Befehle
    engine.js        Alarm-Logik: Sperrzeit je Person, Test/Probe, Ruhezeit, Ausnahmen
    pc.js            PC-Funktionen (Rust-Kern)
    android.js       Android-Plugin (Dienst, Akku, Benachrichtigungen)
    admin.js         Admin-PIN (G3), App-Sperre (H4)
    notify.js        System-Benachrichtigung
    log.js           Protokoll dieses Geräts
    platform.js, events.js
  views/             overview, devices, routines, log, settings, diagnose, takeover
  ui/                dom.js, form.js (Formular-Bausteine, Dialog), theme.js, sound.js
  dev/demo.js        Beispieldaten (nur npm run dev mit ?demo)
  styles/            tokens (Farben/Typo), base, layout, components, takeover
```

Neue Funktion = Modul in `core/` + ggf. Ansicht in `views/`. Lokale Einstellungen in `settings.js`, gemeinsame in `shared.js` mit Standardwert ergänzen.

### PC-Aktionen (Rust, nur Windows)

| Aktion | Befehl |
|---|---|
| Ruhezustand (Standard) | `shutdown /h` (Einschalten per Knopf: `powercfg /h on` mit Admin-Abfrage) |
| Energiesparen | `rundll32 powrprof.dll,SetSuspendState 0,1,0` |
| Sperren | `rundll32 user32.dll,LockWorkStation` |
| Herunterfahren | `shutdown /s /t 0` |
| Mischform | Herunterfahren, nach 120 s sonst Ruhezustand |
| Medien stoppen (D8) | Medientaste „Stopp“ |
| Ausnahmen (D7) | `tasklist` – läuft ein genanntes Programm, wird nur gesperrt |

Ein Windows-Befehl „alle Programme speichern“ existiert nicht, deshalb ist der Ruhezustand die Standardaktion.

## Design-System

Farbwelt **„Leitstelle“**: ruhig und kontrastreich, Signalrot nur für Alarm und Hauptaktion. **Dunkel ist Standard**, Hell die zweite Auswahl (Umschalter in der Navigation).
Schriftgrößen: mindestens 14 px (Labels, Metadaten), Hilfstexte 15 px, Fließtext 16 px.

| Token | Hell | Dunkel | Einsatz |
|---|---|---|---|
| `--bg` | `#f4f2ee` | `#0e1013` | Hintergrund |
| `--surface` | `#ffffff` | `#171a1f` | Karten, Navigation |
| `--line` | `#e2ddd4` | `#2b3039` | Linien |
| `--text` / `--text-2` | `#16181d` / `#4c525d` | `#f1f2f4` / `#a3aab5` | Text / Hilfstext |
| `--signal` | `#c42d21` | `#e5432f` | Alarm, Hauptknopf |
| `--ok` | `#24704a` | `#4cc287` | Verbunden, online |
| `--warn` | `#8f5d0e` | `#e9a945` | Warnungen |
| `--info` | `#2c5a88` | `#74a9df` | Hinweise, Fokus |

Schrift: **Archivo** (Text und Titel, leicht schmal für Titel), **JetBrains Mono** (Topics, Uhrzeiten). Beide liegen in `app/public/fonts`, funktionieren also offline.
Logo: Haus mit Funkwellen auf Signalrot, `docs/logo.svg`.

## Fahrplan

| Stufe | Inhalt | Stand |
|---|---|---|
| 1 | ESP32, Mosquitto-Zentrale, App-Grundgerüst | ✅ |
| 2 | Windows: „Fährst du?“, Ruhezustand, Autostart | ✅ |
| 3 | Zigbee2MQTT + Zentralen-Dienst: Routinen, Licht | ✅ erste Version |
| 4 | Handy: Geräte anlernen, steuern, Routinen | ✅ erste Version |
| 5 | Android: Benachrichtigungen mitlesen, Hintergrund-Dienst, Webhook | ✅ erste Version, auf echtem Gerät zu prüfen |

## Funktionsliste (Stand)

Nummern wie im Konzept. Alle Punkte A–I sind in einer ersten Version umgesetzt. Ausnahmen und Einschränkungen:

- **E2 Widget:** Ein echtes Startbildschirm-Widget braucht eigenen nativen Android-Code. Ersatz: Karte **Schnellaktionen** in der Übersicht (Testalarm, Simulation, „Wieder da“, Routinen „Nur per Knopf“).
- **D5 Ton bei stummem PC:** Der Ton läuft über die App mit eigener Lautstärke; eine Windows-Stummschaltung wird nicht aufgehoben.
- **A10 Firmware-Update:** braucht eine mit ESPHome gebaute `.ota.bin` im Heimnetz plus MD5-Summe.
- **C10 Netzwerkkarte:** als Tabelle (Gerät → über → Signal), keine Grafik.
- **H4 App-Sperre:** PIN; Fingerabdruck ist nicht eingebaut.
- **F4 Updates:** prüft die neueste GitHub-Version – funktioniert erst, wenn das Repo öffentlich ist.
- **Android-Teile** (Dienst, Akku, Benachrichtigungen) werden in CI gebaut, sind aber noch nicht auf einem echten Handy getestet.

| Bereich | Wo in der App |
|---|---|
| A Alarmeingang | Einstellungen → Alarm, ESP32 · Engine |
| B Routinen | Seite Routinen (Dienst führt aus) |
| C Licht & Geräte | Seite Geräte |
| D Windows-PC | Einstellungen → PC · Vollbild-Abfrage |
| E Handy-App | Übersicht, Protokoll, Einstellungen → Android/Dieses Gerät/Darstellung |
| F Zentrale | Einstellungen → Verbindung, Zentrale, Backup · Protokoll → Zentrale |
| G Personen | Einstellungen → Personen, Sicherheit · Routinen „Für wen“ |
| H Sicherheit | Einstellungen → Verbindung (TLS, Heimnetz-Warnung), Zentrale (Webhook-Schlüssel), Sicherheit |
| I Test & Diagnose | Einstellungen → Test & Diagnose · Übersicht → Schnellaktionen |

## Prüfen (lokal, nicht in CI)

- `cd app && npm run lint` – Oxlint (`.oxlintrc.json`): Fehler, doppelte und fragwürdige Stellen.
- `npm run dev` und `http://localhost:1420/?demo` – Übersicht mit Beispieldaten.
- Ohne Hardware: in `zentrale/dienst` `npm run devbroker`, `MQTT_URL=mqtt://127.0.0.1:1883 npm start`, `node tools/sim.js` – App mit Adresse `127.0.0.1` verbinden.
- ESP32-Konfiguration prüfen: `esphome config esp32/alarm-ich.yaml`.

## Offene Punkte / Hinweise

- Android: Der Hintergrund-Dienst hält die App am Leben. Akku-Optimierung trotzdem ausschalten (Einstellungen → Android).

- Relaiskontakt der Ladeschale vor dem Anschluss messen (potentialfrei?). Sonst Optokoppler.
- Android-APK ist vorerst **debug-signiert** (installierbar, aber Updates nur mit gleichem Schlüssel). Fester Signierschlüssel als GitHub-Secret folgt.
- Android-Release erlaubt `ws://` nur mit Cleartext-Freigabe; bei Bedarf TLS (`wss://`) an der Zentrale aktivieren.
- Teilen von Alarmen zwischen Haushalten (Zentralen-Kopplung über VPN, „nur benachrichtigen“) ist als Idee notiert, nicht geplant.
