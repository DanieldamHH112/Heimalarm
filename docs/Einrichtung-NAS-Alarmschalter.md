# Einrichtung: UGREEN-NAS + Alarmschalter mit Heimalarm

Für: UGREEN NASync DXP2800 als Zentrale, ESP32-S3 am Kontakt der Ladeschale, Funkhandel-Alarmschalter als zweiter Weg.

```
Ladeschale (TPG2200) ──Y-Verteiler──┬──► Funkhandel-Alarmschalter ──► Tuya-App / Alexa   (zweiter Weg, bleibt wie er ist)
                                    └──► ESP32-S3 ──WLAN──► UGREEN-NAS ──► Heimalarm (PC + Handy), Licht, Alexa
```

## Was du brauchst

- UGREEN DXP2800 (läuft immer) mit Docker
- ESP32-S3 DevKitC-1, 2 Jumper-Kabel, USB-C-Kabel, altes USB-Netzteil
- Y-Verteiler bzw. Adapter passend zum Anschluss der Ladeschale (wie beim Alarmschalter)
- Heimalarm auf PC und Handy

## 1 · Feste IP für die NAS

Im Router (z. B. FRITZ!Box: *Heimnetz → Netzwerk → NAS → „Immer dieselbe IPv4-Adresse“*) der NAS eine feste IP geben, z. B. `192.168.178.20`. Diese IP brauchst du gleich mehrfach.

## 2 · Zentrale auf der NAS starten

1. Repo herunterladen und den Ordner `zentrale/` auf die NAS kopieren, z. B. nach `/volume1/docker/heimalarm`.
2. In UGOS Pro die **Docker-App** öffnen → **Projekt** anlegen → als Ordner `heimalarm` wählen und die vorhandene `docker-compose.yml` verwenden.
3. Starten. Für den Anfang reicht die Grundausstattung (Mosquitto + Heimalarm-Dienst). Zigbee (`--profile zigbee`) und Matter (`--profile matter`) erst später.
4. Prüfen: Im Projekt laufen die Container `mosquitto` und `dienst`.

**Falls etwas klemmt:**
- *Port belegt* (1883, 9001, 8080, 8081, 5541): in `docker-compose.yml` links den Port ändern und die neue Zahl später in App/ESP32 eintragen.
- *Dienst wird nicht gebaut*: melden – dann stellen wir ein fertiges Image bereit.

## 3 · ESP32-S3 vorbereiten

1. Im Ordner `esp32/` die Datei `secrets.example.yaml` nach `secrets.yaml` kopieren und ausfüllen:
   - `wifi_ssid`, `wifi_pw` – dein WLAN (2,4 GHz)
   - `mqtt_host` – **IP der NAS**
   - `ota_pw` – ein eigenes Passwort
2. In `alarm-ich-s3.yaml` ggf. `kennung: ich` ändern (jede Person eine eigene Kennung, z. B. `daniel`).
3. ESP32 per USB an den PC, in Chrome/Edge [web.esphome.io](https://web.esphome.io) öffnen und `alarm-ich-s3.yaml` flashen (alternativ im ESPHome-Dashboard).

## 4 · Mit der Ladeschale verbinden

1. **Erst messen:** Mit dem Multimeter prüfen, ob der Alarmkontakt der Ladeschale potentialfrei ist (bei Alarm geschlossen, keine Spannung drauf). Sonst nicht direkt anschließen – Optokoppler nötig.
2. Am Y-Verteiler: ein Ausgang wie bisher zum **Funkhandel-Alarmschalter**, der andere zum **ESP32**.
3. Kontakt-Pol A → **GPIO4**, Pol B → **GND** (Jumper-Kabel). Kein Widerstand nötig.
4. ESP32 mit USB-Netzteil dauerhaft versorgen.

Der Alarmschalter bleibt dabei unverändert – App und Alexa-Routinen funktionieren weiter.

## 5 · Heimalarm verbinden

Auf **PC und Handy**:

1. *Einstellungen → Betrieb* → **Mit Zentrale**.
2. *Verbindung* → Adresse = **IP der NAS**, Port `9001` → „Speichern & verbinden“.
3. *Alarmquellen* → **Melder (ESP32)** an; nach Wunsch SYBOS, aPager, Divera.
4. *Alarm* → **Meine Kennung** = Kennung aus dem ESP32 (z. B. `ich`).
5. Am Handy: Benachrichtigungen mitlesen erlauben und Akku-Optimierung für Heimalarm ausschalten (*Einstellungen → Android*).

## 6 · Testen

1. *Einstellungen → Alarm → Testalarm* – zeigt nur die Abfrage, es passiert nichts.
2. *Test & Diagnose → Verbindungstest* – Zentrale, Dienst und ESP32 müssen grün sein.
3. *Kontakt simulieren* – wie ein echter Alarm über die NAS an alle Geräte.
4. Echter Test: Melder mit Probealarm in der Ladeschale auslösen → PC fragt „Fährst du?“, Handy meldet, **und** der Funkhandel-Schalter löst wie gewohnt aus.

## Übergang ohne ESP32: Tuya-Brücke

Solange kein ESP32 da ist, liest die NAS den Funkhandel-Alarmschalter über **Smart Life** mit und meldet ihn wie den ESP32 (`ALARM` auf `alarm/ich`).

1. Alarmschalter (NX-4900) in der **Smart-Life-App** koppeln (nicht ELESION).
2. Im NAS-Ordner `heimalarm` eine Datei `.env` anlegen mit dem Inhalt `COMPOSE_PROFILES=tuya` und das Projekt neu starten. Falls die Docker-App die `.env` nicht beachtet: in `docker-compose.yml` beim Dienst `tuya-bruecke` die Zeile `profiles: ["tuya"]` löschen.
3. Im Browser `http://<IP der NAS>:8082` öffnen → **User Code** eingeben (Smart Life: *Ich → Zahnrad → Konto und Sicherheit*) → QR-Code mit Smart Life scannen (*+ → Scannen*) und bestätigen.
4. Die Seite zeigt den überwachten Kontakt. Probealarm auslösen → Heimalarm reagiert wie beim Melder (*Alarmquellen → Melder (ESP32)* muss an sein).

Hinweise: läuft über die Tuya-Cloud, daher einige Sekunden Verzögerung. Der *Verbindungstest* zeigt den ESP32 weiterhin rot – das ist normal. Kommt der ESP32, Profil `tuya` wieder entfernen.

## Später (optional)

- **Licht:** WLAN-Geräte unter *Geräte → WLAN-Geräte* oder Zigbee (USB-Stick bzw. SLZB-06, Profil `zigbee`).
- **Alexa:** Voice-Monkey-Token unter *Einstellungen → Alexa & Google*, in Routinen „+ Alexa“. Lokal über Matter: Profil `matter` – auf der NAS noch ungetestet.
- **Kollege:** zweiter ESP32 mit eigener Kennung, Person unter *Einstellungen → Personen* anlegen.

## Alarmschalter umflashen (in Prüfung)

Statt ESP32 könnte der Funkhandel-Schalter selbst an die NAS melden. Dann entfallen aber Tuya-App und Alexa über den Schalter (kein zweiter Weg mehr).

Bis zur Entscheidung:
- In der App **Automatische Aktualisierung ausschalten**.
- Gerät öffnen, **Platine beidseitig fotografieren** (Aufdruck des WLAN-Moduls lesbar) und zur Prüfung schicken.
- **Nichts flashen oder zurücksetzen.**
