<p align="center"><img src="docs/logo.svg" width="88" alt="Heimalarm Logo"></p>

<h1 align="center">Heimalarm</h1>
<p align="center">Einsatz-Alarme zuhause weitergeben.</p>

---

## Was ist Heimalarm?

Heimalarm ist für Einsatzkräfte der Feuerwehr gedacht, die zuhause alarmiert werden. Wenn der Melder in der Ladeschale auslöst, reagiert das Zuhause mit:

- **PC:** Ein Vollbild fragt „Fährst du?“. Ohne Gegenrede geht der PC in den Ruhezustand – offene Programme bleiben erhalten.
- **Licht & Geräte:** Routinen schalten z. B. nachts das Flurlicht gedimmt an.
- **Handy:** Benachrichtigung, Übersicht und Steuerung von unterwegs im Heimnetz.

Alles läuft lokal im Heimnetz, ohne Cloud und ohne laufende Kosten. Der Melder bleibt die eigentliche Alarmierung – Heimalarm ist eine Komfortfunktion.

<p align="center">
  <img src="docs/screenshots/pc-uebersicht.png" width="68%" alt="Übersicht am PC">
  <img src="docs/screenshots/handy-uebersicht.png" width="22%" alt="Übersicht am Handy">
</p>

## So funktioniert es

```
Melder (Ladeschale) ──► ESP32 ──► Zentrale (Mosquitto + Dienst) ──► Heimalarm (PC / Handy)
                                         └──► Zigbee2MQTT ──► Licht & Geräte
```

1. Ein **ESP32** liest den Relaiskontakt der Ladeschale und meldet `alarm/<kennung>`.
2. Die **Zentrale** (z. B. Raspberry Pi) verteilt die Meldung und führt Routinen aus.
3. **Heimalarm** am PC fragt „Fährst du?“, am Handy kommt eine Benachrichtigung.

## Inhalt

| Ordner | Was |
|---|---|
| `app/` | App für Windows und Android (Tauri 2, HTML/CSS/JS) |
| `esp32/` | ESPHome-Konfiguration für den ESP32 |
| `zentrale/` | Docker-Setup: Mosquitto, Heimalarm-Dienst, Zigbee2MQTT |
| `docs/` | Konzept (PDF), Logo, Bildschirmfotos |

Details, Regeln und Funktionsliste: **[Context.md](Context.md)**

## Einrichten

**1 · Zentrale** (Raspberry Pi mit Docker)
```bash
cd zentrale
docker compose up -d                     # ohne Zigbee
docker compose --profile zigbee up -d    # mit Zigbee-USB-Stick
```

**2 · ESP32**
1. `esp32/secrets.example.yaml` nach `secrets.yaml` kopieren und ausfüllen.
2. Kontakt der Ladeschale messen, dann Pol A an `GPIO27`, Pol B an `GND`.
3. `esp32/alarm-ich.yaml` über [web.esphome.io](https://web.esphome.io) flashen.

**3 · App**
Installer bzw. APK aus den [Releases](../../releases) laden, unter *Einstellungen → Verbindung* die IP der Zentrale eintragen und *Testalarm* drücken.

## Entwickeln

```bash
cd app
npm install
npm run dev          # Oberfläche im Browser (ohne PC-Funktionen)
npx tauri dev        # als Desktop-Programm
npm run lint         # Oxlint
```

Ohne Hardware testen (in `zentrale/dienst`, nach `npm install`): `npm run devbroker`, dann `MQTT_URL=mqtt://127.0.0.1:1883 npm start` und `node tools/sim.js` – simuliert ESP32 und Zigbee-Geräte.

---

<sub>Ergänzt die Alarmierung, ersetzt sie nicht. Der Melder bleibt maßgeblich.</sub>
