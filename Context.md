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
| Rust-Kern | PC-Aktionen (Ruhezustand usw.), Autostart | `app/src-tauri/` |
| ESP32 | ESPHome | `esp32/` |
| Zentrale | Docker: Mosquitto (+ Zigbee2MQTT vorbereitet) | `zentrale/` |
| Release | GitHub Actions, nur bei Tag `v*` | `.github/workflows/release.yml` |

### MQTT-Topics

| Topic | Inhalt | Von |
|---|---|---|
| `alarm/<kennung>` | `ALARM` | ESP32 |
| `alarm/<kennung>/status` | `online` / `offline` (automatisch, Last Will) | ESP32 |
| `alarm/<kennung>/sensor/wifi_signal\|uptime/state` | WLAN in dBm, Laufzeit in s | ESP32 |
| `alarm/<kennung>/text_sensor/ip\|version/state` | IP, Firmware | ESP32 |
| `heimalarm/clients/<id>` | JSON `{name, platform, version, online, ts}` (retained, Last Will) | jede App |
| `zigbee2mqtt/bridge/devices` | Geräteliste | Zigbee2MQTT |

Ports der Zentrale: `1883` (ESP32), `9001` (App über WebSocket).
Eigene Kennung (Standard `ich`) löst am PC die Abfrage aus. Fremde Kennungen erscheinen nur als Hinweis.

### App-Struktur

```
app/src/
  main.js            Start, Router, Live-Aktualisierung
  core/              Logik ohne Oberfläche
    settings.js      Einstellungen + Standardwerte (localStorage)
    mqtt.js          Verbindung zur Zentrale, Topics auswerten
    engine.js        Alarm-Logik: Sperrzeit, eigen/fremd, Testalarm, Entscheidung
    pc.js            PC-Aktionen, Vollbild, Autostart (Aufruf Rust-Kern)
    log.js           Protokoll (E7), max. 500 Einträge
    notify.js        System-Benachrichtigung (E1)
    platform.js      Windows / Android / Browser erkennen
    events.js        Ereignis-Bus
  views/             Seiten: overview, log, settings, takeover („Fährst du?“)
  ui/                dom.js (Helfer), theme.js (Hell/Dunkel + Umschalter)
  dev/demo.js        Beispieldaten, nur `npm run dev` mit ?demo
  styles/            tokens.css (Farben, Typo, Abstände), base, layout, components, takeover
```

Neue Funktion = neues Modul in `core/` + ggf. Ansicht in `views/`. Einstellungen immer in `settings.js` mit Standardwert ergänzen.

### PC-Aktionen (Rust, nur Windows)

| Aktion | Befehl |
|---|---|
| Ruhezustand (Standard) | `shutdown /h` (vorher einmalig `powercfg /h on`) |
| Energiesparen | `rundll32 powrprof.dll,SetSuspendState 0,1,0` |
| Sperren | `rundll32 user32.dll,LockWorkStation` |
| Herunterfahren | `shutdown /s /t 0` |
| Mischform | Herunterfahren, nach 120 s sonst Ruhezustand |

Ein Windows-Befehl „alle Programme speichern“ existiert nicht, deshalb ist der Ruhezustand die Standardaktion.

## Design-System

Farbwelt **„Leitstelle“**: ruhig und kontrastreich, Signalrot nur für Alarm und Hauptaktion. Hell und Dunkel, folgt dem System.

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
| 1 | ESP32-Konfiguration, Mosquitto-Zentrale, App-Grundgerüst | ✅ erste Version |
| 2 | Windows: „Fährst du?“, Ruhezustand, Autostart | ✅ erste Version |
| 3 | Zigbee2MQTT + Regel-Dienst: Licht bei Alarm | offen |
| 4 | Handy: Geräte anlernen, steuern, Routinen | offen |
| 5 | Android: Benachrichtigungen (SYBOS/aPager) mitlesen, aPager-Webhook | offen |

## Funktionsliste (Stand)

Nummern wie im Konzept (Seiten „Funktionsliste“). ★ = Grundausstattung. ✅ = umgesetzt.

- **A Alarmeingang:** A1 ★ Quellen (✅ ESP32 an/aus) · A2 ★ Entprellen (✅ im ESP32) · A3 Mindestdauer · A4 ★ Sperrzeit ✅ · A5 Quellen zusammenführen · A6 Benachrichtigungs-Filter · A7 Stichwort/Einheit · A8 ★ Offline-Warnung ✅ · A9 Lebenszeichen ✅ (ESPHome-Status) · A10 Firmware-Update · A11 Testmodus
- **B Routinen:** B1–B11 offen (Stufe 3)
- **C Licht & Geräte:** C1–C11 offen (Stufe 3/4)
- **D Windows-PC:** D1 ★ Aktion ✅ · D2 ★ Countdown ✅ · D3 ★ Standard ohne Klick ✅ · D4 Texte · D5 Ton · D6 Über Vollbild ✅ (immer oben + Vollbild) · D7 Ausnahmen · D8 Medien pausieren · D9 ★ Autostart ✅ · D10 Ruhezustand einrichten · D11 Wake-on-LAN · D12 Zeitfenster
- **E Handy-App:** E1 ★ Benachrichtigung ✅ · E2 Widget · E3 Dashboard ✅ (Übersicht) · E4 Alarmverlauf ✅ · E5 Darstellung ✅ · E6 Akku-Optimierung · E7 ★ Protokoll ✅
- **F Zentrale:** F1 ★ Adresse ✅ · F2 ★ Zugangsdaten ✅ · F3 Backup · F4 Updates · F5 Logs · F6 Zeitzone/Standort
- **G Personen:** G1 mehrere Personen (✅ Kennungen) · G2 Routinen pro Person · G3 Rollen
- **H Sicherheit:** H1 ★ TLS (✅ Schalter) · H2 Webhook-Schlüssel · H3 nur Heimnetz/VPN · H4 App-Sperre
- **I Test & Diagnose:** I1 ★ Testalarm ✅ · I2 Komplettprobe · I3 Verbindungstest · I4 Wochen-Selbsttest

## Prüfen (lokal, nicht in CI)

- `cd app && npm run lint` – Oxlint (Konfiguration `.oxlintrc.json`): Fehler und doppelte/fragwürdige Stellen finden.
- `npm run dev` und `http://localhost:1420/?demo` – Übersicht mit Beispieldaten ansehen.

## Offene Punkte / Hinweise

- Android: Läuft die App im Hintergrund, kann Android sie anhalten. Zuverlässiger Empfang braucht einen Vordergrund-Dienst (Stufe 5, zusammen mit E6).

- Relaiskontakt der Ladeschale vor dem Anschluss messen (potentialfrei?). Sonst Optokoppler.
- Android-APK ist vorerst **debug-signiert** (installierbar, aber Updates nur mit gleichem Schlüssel). Fester Signierschlüssel als GitHub-Secret folgt.
- Android-Release erlaubt `ws://` nur mit Cleartext-Freigabe; bei Bedarf TLS (`wss://`) an der Zentrale aktivieren.
- Teilen von Alarmen zwischen Haushalten (Zentralen-Kopplung über VPN, „nur benachrichtigen“) ist als Idee notiert, nicht geplant.
