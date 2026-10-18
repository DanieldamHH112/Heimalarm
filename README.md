<p align="center"><img src="docs/logo.svg" width="88" alt="Heimalarm Logo"></p>

<h1 align="center">Heimalarm</h1>
<p align="center">Einsatz-Alarme zuhause weitergeben.</p>

---

## Was ist Heimalarm?

Heimalarm ist für Einsatzkräfte, die zuhause alarmiert werden – egal ob Feuerwehr, Rettungsdienst, Wasserwacht oder Katastrophenschutz. Wenn der Alarm kommt, reagiert das Zuhause mit:

- **PC:** Ein Vollbild fragt „Fährst du?“. Ohne Gegenrede geht der PC in den Ruhezustand – offene Programme bleiben erhalten.
- **Handy:** Meldung mit Stichwort und Adresse, Rückmeldung mit einem Tipp.
- **Licht & Sprachassistenten:** Nachts geht das Flurlicht gedimmt an, Alexa oder Google sagen „Einsatz!“ an.

Alles läuft lokal im Heimnetz, ohne Cloud und ohne laufende Kosten. Melder und Alarm-App bleiben die eigentliche Alarmierung – Heimalarm ist eine Komfortfunktion.

<p align="center">
  <img src="docs/screenshots/pc-uebersicht.png" width="68%" alt="Übersicht am PC">
  <img src="docs/screenshots/handy-uebersicht.png" width="22%" alt="Übersicht am Handy">
</p>

## So funktioniert es

Heimalarm läuft auf zwei Arten – du wählst in der App unter *Einstellungen → Betrieb*.

### Welcher Aufbau passt?

| Du hast … | Dann |
|---|---|
| nur Handy und PC, Alarm kommt über SYBOS, aPager oder Divera | **Ohne Zentrale** – nichts weiter nötig |
| ein Gerät, das immer läuft (z. B. **UGREEN-NAS**, Synology, Raspberry Pi, Heimserver) | **Mit Zentrale** – dazu der Melder in der Ladeschale |
| einen Melder in der Ladeschale | **Mit Zentrale** + **ESP32** am Relaiskontakt (ca. 10 €) |

Die **Zentrale** ist kein bestimmtes Gerät, sondern ein kleines Docker-Projekt (`zentrale/`). Es läuft überall, wo Docker läuft – ein Raspberry Pi ist **nicht** nötig. Anleitung für die UGREEN-NAS: [docs/Einrichtung-NAS-Alarmschalter.md](docs/Einrichtung-NAS-Alarmschalter.md).

**Mit Zentrale (NAS oder Raspberry Pi)** – alles läuft auch, wenn PC und Handy aus sind.

<p align="center"><img src="docs/ablauf.svg" width="100%" alt="Mit Zentrale: Melder und Alarm-Apps melden an die Zentrale (NAS oder Raspberry Pi), der PC, Handy, Licht und Sprachassistenten auslöst"></p>

**Ohne Zentrale** – Handy und PC arbeiten direkt zusammen. Ideal, wenn du nur auf SYBOS, aPager oder Divera wartest.

<p align="center"><img src="docs/ohne-pi.svg" width="100%" alt="Ohne Zentrale: Das Handy liest die Alarm-App mit, meldet an den PC und schaltet Licht und Alexa. Darunter die Grenzen ohne Zentrale"></p>

| | Mit Zentrale | Ohne Zentrale |
|---|---|---|
| PC herunterfahren | ✅ | ✅ Handy meldet an den PC, Divera fragt der PC selbst ab |
| Melder in der Ladeschale (ESP32) | ✅ | – |
| WLAN-Lampen & Steckdosen | ✅ | ✅ Handy schaltet direkt |
| Zigbee-Lampen | ✅ | nur über eine Hue Bridge |
| Alexa | ✅ Matter (lokal) oder Voice Monkey | ✅ Voice Monkey |
| Google Home | ✅ Matter (lokal) | – |
| Routinen | ✅ laufen auf der Zentrale | ✅ laufen auf dem Handy |
| Läuft, wenn Handy aus oder unterwegs | ✅ | – |

## Funktionen

| | |
|---|---|
| **Alarmquellen** | Melder (ESP32), SYBOS, aPager PRO, Divera 24/7 – auch mehrere gleichzeitig. Doppelte Meldungen werden zu einem Einsatz. |
| **„Fährst du?“ am PC** | Vollbild mit Countdown und Ton. Danach Ruhezustand, Sperren, Herunterfahren oder nichts. Ausnahmen (z. B. bei laufendem OBS), Ruhezeiten, Medien stoppen. |
| **Rückmeldung** | „Ich fahre / nicht“ geht an Divera (Rückmeldung und Status) und aPager (Zu-/Absage). |
| **Divera-Status** | Eigenen Status in der Übersicht mit einem Tipp setzen, optional automatisch zurücksetzen. |
| **Licht & Geräte** | WLAN-Geräte (Shelly, Hue, WLED, Tasmota) direkt im Heimnetz, mit Zentrale auch Zigbee – ohne Hersteller-Cloud. |
| **Ohne Zentrale** | Handy und PC koppeln sich mit einem Code im WLAN. Das Handy meldet Alarme an den PC und führt die Routinen aus. |
| **Routinen** | Wenn Alarm, Uhrzeit oder Gerät → Licht, Gruppen, Verzögerung, „Wieder da“. Bedingungen wie Nacht, dunkel, Wochentag, Stichwort. Pro Person. |
| **Alexa & Google Home** | Alarm startet Routinen (Ansage, Licht). Lokal über Matter (mit Zentrale) oder Alexa über Voice Monkey (auch ohne). |
| **Mehrere Personen** | Jede Person mit eigener Kennung, eigenen Routinen und eigenem Melder. |
| **Übersicht** | Zeigt nur, was eingerichtet ist: Quellen, Zentrale, Melder, Geräte, letzte Einsätze. |
| **Test & Diagnose** | Testalarm, Kontakt simulieren, Komplettprobe, Verbindungstest, wöchentlicher Selbsttest. |
| **Sicher & privat** | Alles im Heimnetz. App-PIN, Admin-PIN, API-Schlüssel bleiben auf dem Gerät. |
| **Bedienung** | Dunkel (Standard) und hell, PC und Handy gleich, Einstellungen gleichen sich ab. |

## Kompatible Geräte

| Gerät | Ohne Zentrale | Mit Zentrale | Hinweis |
|---|---|---|---|
| **Shelly** (Schalter, Stecker, Dimmer) | ✅ | ✅ | direkt im WLAN, Gen1 bis Gen3 |
| **Philips Hue** | ✅ | ✅ | über die Hue Bridge; Knopf drücken zum Koppeln |
| **IKEA** (Tradfri, Dirigera-Lampen) | ✅ über Hue Bridge | ✅ | mit Zentrale direkt per Zigbee-Stick |
| **WLED** (LED-Streifen) | ✅ | ✅ | |
| **Tasmota** | ✅ | ✅ | umgeflashte Stecker und Lampen |
| **Tuya / Smart Life** | über Alexa-Routine | ✅ Zigbee-Geräte | WLAN-Geräte nur über die Tuya-Cloud – per Voice Monkey eine Alexa-Routine starten, die sie schaltet |
| **Zigbee allgemein** | – | ✅ | tausende Geräte, siehe [Zigbee2MQTT](https://www.zigbee2mqtt.io/supported-devices/) |
| **Amazon Echo** | ✅ Voice Monkey | ✅ Matter oder Voice Monkey | Echo mit Matter für den lokalen Weg |
| **Google Nest / Home** | – | ✅ Matter | Nest Hub, Nest Lautsprecher oder Google TV |

**Voice Monkey** ([voicemonkey.io](https://voicemonkey.io)) startet Alexa-Routinen per Internet. In Voice Monkey einen „Routine Trigger“ anlegen, in der Alexa-App eine Routine damit starten (z. B. Ansage „Einsatz!“, Licht an) und in Heimalarm den API-Token eintragen. In Routinen als Aktion „+ Alexa“.

## Installation & Einrichtung

**Was du brauchst:** Heimalarm auf PC (Windows) und/oder Handy (Android). Optional eine Zentrale (NAS, Raspberry Pi oder anderer Rechner mit Docker) und einen ESP32 für den Melder.

Die App führt dich selbst durch: Die **Übersicht** zeigt eine Checkliste und das Schaubild deines Aufbaus, bis alles grün ist.

**1 · App installieren**
Installer (`.exe`) bzw. APK aus den [Releases](../../releases) laden und installieren.

**2 · Betrieb wählen**
*Einstellungen → Betrieb:* „Mit Zentrale“ oder „Ohne Zentrale“. Ohne Zentrale am PC Adresse und Code ablesen und am Handy unter „PC hinzufügen“ eintragen. Windows fragt einmal nach der Firewall – „Private Netzwerke“ erlauben.

**Mehrere PCs und Laptops:** Mit Zentrale auf jedem Gerät Heimalarm installieren, mit der Zentrale verbinden und **dieselbe Kennung** eintragen – alle zeigen bei Alarm „Fährst du?“, egal ob der Melder oder SYBOS/aPager/Divera am Handy auslöst. Ohne Zentrale jeden PC am Handy unter „PC hinzufügen“ eintragen. Für einen gemeinsamen PC mehrerer Personen: *Einstellungen → PC bei Alarm → „Abfrage auch bei Alarm von“*.

**3 · Alarmquellen wählen**
In der App unter *Einstellungen → Alarmquellen* einschalten, was du nutzt:
- **SYBOS / aPager / Divera:** Am Handy „Benachrichtigungen mitlesen“ erlauben. Für Divera bzw. aPager optional den persönlichen API-Schlüssel eintragen – dann klappt auch die Rückmeldung.
- **Melder:** braucht Zentrale und ESP32 (Schritt 5 und 6).

**4 · Licht & Alexa**
Unter *Geräte → WLAN-Geräte* Lampen und Steckdosen hinzufügen, unter *Einstellungen → Alexa & Google* den Voice-Monkey-Token eintragen. Dann unter *Routinen* „Vorlage“ antippen.

**5 · Zentrale (optional)** – NAS oder Raspberry Pi mit Docker

Auf einer NAS mit Docker-Oberfläche (z. B. UGREEN, Synology) den Ordner `zentrale` hochladen und als Projekt starten – Schritt für Schritt in [docs/Einrichtung-NAS-Alarmschalter.md](docs/Einrichtung-NAS-Alarmschalter.md). Mit Kommandozeile:
```bash
cd zentrale
docker compose up -d                                     # Grundausstattung
docker compose --profile zigbee up -d                    # mit Zigbee-USB-Stick
docker compose --profile zigbee --profile matter up -d   # dazu Licht für Alexa / Google
```
Dann der Zentrale im Router eine feste IP geben und sie in der App unter *Einstellungen → Verbindung* eintragen (Port `9001`).

**6 · ESP32 (optional)**
1. `esp32/secrets.example.yaml` nach `secrets.yaml` kopieren, WLAN-Daten und als `mqtt_host` die IP der Zentrale eintragen. In der YAML-Datei die `kennung` setzen – dieselbe wie in der App.
2. Kontakt der Ladeschale messen (keine Spannung, bei Alarm Durchgang), dann einen Pol an `GPIO27`, den anderen an `GND`.
3. `esp32/alarm-ich.yaml` über [web.esphome.io](https://web.esphome.io) flashen. Für ein **ESP32-S3**-Board stattdessen `esp32/alarm-ich-s3.yaml` (Pol A an `GPIO4`), für einen **Wemos D1 mini (ESP8266)** `esp32/alarm-ich-d1mini.yaml` (Pol A an `D5`).

**Ohne ESP32: Funk-Alarmschalter (Tuya) als Übergang**
Ein vorhandener Tuya-Alarmschalter (z. B. von Funkhandel) lässt sich über die **Tuya-Brücke** der Zentrale einbinden (Profil `tuya`, Anmeldung per QR-Code mit Smart Life). Läuft über die Tuya-Cloud, daher einige Sekunden langsamer als der ESP32.

**7 · Testen**
*Einstellungen → Test & Diagnose → Testalarm.* Es passiert nichts Echtes, du siehst nur die Abfrage.

**Updates**
Heimalarm sucht beim Start auf GitHub nach einer neuen Version (*Einstellungen → Updates*, abschaltbar). Mit **Installieren** lädt die App die Datei, prüft die Prüfsumme und installiert – am PC still mit Neustart, am Handy über den normalen Android-Installationsdialog (beim ersten Mal „Apps aus dieser Quelle zulassen“). Einstellungen bleiben erhalten. Funktioniert, sobald das Repository öffentlich ist.

Ausführlich mit Bildern: [Konzept (PDF)](docs/Konzept.pdf)

---

<sub>Ergänzt die Alarmierung, ersetzt sie nicht. Melder und Alarm-App bleiben maßgeblich.</sub>
