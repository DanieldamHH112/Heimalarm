<p align="center"><img src="docs/logo.svg" width="88" alt="Heimalarm Logo"></p>

<h1 align="center">Heimalarm</h1>
<p align="center">Feuerwehr-Alarm zuhause weitergeben: PC in den Ruhezustand, Licht an.<br>Lokal, kostenlos, ohne Cloud.</p>

---

## So funktioniert es

```
Melder (Ladeschale) ──► ESP32 ──► Zentrale (Mosquitto) ──► Heimalarm (PC / Handy)
                                                         └─► Licht & Geräte (Zigbee, geplant)
```

1. Der **ESP32** erkennt den Relaiskontakt der Ladeschale und meldet `alarm/<kennung>`.
2. Die **Zentrale** im Heimnetz verteilt die Meldung.
3. **Heimalarm** am PC fragt „Fährst du?“. Ohne Gegenrede geht der PC in den Ruhezustand.

## Inhalt

| Ordner | Was |
|---|---|
| `app/` | App für Windows und Android (Tauri 2, HTML/CSS/JS) |
| `esp32/` | ESPHome-Konfiguration für den ESP32 |
| `zentrale/` | Docker-Setup für Mosquitto (Zigbee2MQTT vorbereitet) |
| `docs/` | Konzept (PDF) und Logo |

Details, Regeln und Funktionsliste: **[Context.md](Context.md)**

## Einrichten

**1 · Zentrale** (Raspberry Pi mit Docker)
```bash
cd zentrale && docker compose up -d
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
```

## Release

```bash
git tag v0.1.0 && git push origin v0.1.0
```
Baut Windows-Installer und Android-APK und hängt beide an das Release. Bewusst ohne Tests, damit es schnell geht.

---

<sub>Ergänzt die Alarmierung, ersetzt sie nicht. Der Melder bleibt maßgeblich.</sub>
