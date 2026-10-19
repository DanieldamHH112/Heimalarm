# Einrichtung mit NAS als Zentrale

Am Beispiel einer **UGREEN NASync DXP2800** (UGOS Pro). Andere NAS mit Docker-Oberfläche (z. B. Synology Container Manager) funktionieren genauso – nur die Menüs heißen anders.

```
Ladeschale (TPG2200) ──► Melder-Anschluss ──WLAN──► NAS (Zentrale) ──► Heimalarm auf allen PCs + Handy, Licht, Alexa
                          ESP32  oder
                          Funk-Alarmschalter (Tuya) über die Tuya-Brücke
```

**Welcher Melder-Anschluss?**

| | ESP32 (empfohlen) | Funk-Alarmschalter (Tuya, z. B. Funkhandel) |
|---|---|---|
| Kosten | ca. 10 € + Kabel | schon vorhanden |
| Tempo | unter 1 Sekunde | 2–4 Sekunden (Sensor wacht erst auf) |
| Läuft über | nur Heimnetz | Tuya-Cloud (Smart Life) |
| Strom | USB-Netzteil | Batterie |

Beides kann auch gleichzeitig laufen – der zweite Weg ist dann Reserve.

---

## 1 · Feste IP für die NAS

FRITZ!Box: *Heimnetz → Netzwerk → Netzwerkverbindungen* → bei der NAS auf den **Stift** → Reiter **Heimnetz** → unter der IPv4-Adresse **„Diesem Netzwerkgerät immer die gleiche IPv4-Adresse zuweisen“** → **Übernehmen**.
Die IP (z. B. `192.168.178.43`) notieren – sie wird gleich mehrfach gebraucht.

## 2 · Dateien auf die NAS

1. Am PC: GitHub → **Code → Download ZIP**, entpacken.
2. NAS: App **Docker** installieren (App Center).
3. App **Dateien** → **Freigegebener Ordner → docker** → neuen Ordner **`heimalarm`** anlegen.
4. Den **Inhalt** des Ordners `zentrale` hineinladen: `docker-compose.yml`, `.env.example` und die Ordner `dienst`, `mosquitto`, `tuya-bruecke`.
5. `.env.example` mit dem **Editor** (Windows: Rechtsklick → *Öffnen mit → Editor*) öffnen, bei `MQTT_PASSWORD=` ein langes eigenes Passwort eintragen und als **`.env`** speichern. **Pflicht** – ohne Passwort startet die Zentrale nicht.
   - **Achtung Windows:** Beim Speichern *Dateityp → Alle Dateien* wählen, sonst entsteht `.env.txt` und die Zentrale findet die Datei nicht. Im Explorer *Ansicht → Dateinamenerweiterungen* einschalten, um das zu prüfen.
   - Dieses Passwort brauchst du an **drei Stellen**: in der App (*Einstellungen → Betrieb & Verbindung*, Benutzer `heimalarm`), im ESP32 (`mqtt_pw` in `secrets.yaml`) und für die Tuya-Weboberfläche (Port 8082).

## 3 · Tuya-Brücke ein- oder ausschalten

- **Mit Funk-Alarmschalter:** `docker-compose.yml` mit **TextEdit** öffnen und beim Abschnitt `tuya-bruecke:` die Zeile `profiles: ["tuya"]` **löschen**, speichern.
- **Nur ESP32:** Datei unverändert lassen – die Brücke startet dann nicht.

## 4 · Projekt starten

1. **Docker → Projekt → Erstellen**.
2. Name `heimalarm`, Speicherpfad **docker/heimalarm** – die vorhandene `docker-compose.yml` wird erkannt.
3. Haken **„Nach der Erstellung sofort ausführen“** → **Bereitstellen**. Der erste Start dauert 3–5 Minuten.
4. Unter **Container** laufen jetzt `mosquitto`, `dienst` und (falls eingeschaltet) `tuya-bruecke`.

**Später Dateien geändert?** *Projekt → heimalarm → Compose-Konfiguration → Neu bereitstellen*. Baut Docker dabei nichts neu (leeres Protokoll), unter **Container** den betroffenen Container und danach unter **Image** sein Image löschen, dann erneut bereitstellen.

**Weitere Profile:** `zigbee` (Zigbee-Stick), `matter` (Licht für Alexa/Google) und `esphome` (ESPHome-Oberfläche auf Port 6052, um den ESP32 im Browser zu bauen statt über web.esphome.io) sind aus, bis du sie einschaltest.

**Port belegt?** In `docker-compose.yml` links vom Doppelpunkt eine andere Zahl eintragen (1883, 9001, 8082) und diese dann in App bzw. ESP32 verwenden.

## 5a · Melder: ESP32

**Einkauf:** ESP32-S3 DevKitC-1 N16R8 mit **verlöteten** Stiftleisten, USB-C-**Daten**kabel, Jumper-Kabel (Buchse–Buchse), altes USB-Netzteil.

1. `esp32/secrets.example.yaml` → `secrets.yaml` kopieren und ausfüllen: WLAN (2,4 GHz), `mqtt_host` = **IP der NAS**, eigenes `ota_pw`. `mqtt_user` bleibt `heimalarm`, bei `mqtt_pw` **dasselbe Passwort wie `MQTT_PASSWORD` in `.env`** eintragen – sonst verbindet sich der ESP32 nie.
2. In `alarm-ich-s3.yaml` die `kennung` setzen, z. B. `daniel` – nur Kleinbuchstaben, Ziffern und `-`, keine Leerzeichen oder Umlaute. Dieselbe kommt später in jede App (siehe Kasten „Kennung“ unten).
3. ESP32 per USB an den PC (Buchse **COM**), in Chrome/Edge [web.esphome.io](https://web.esphome.io) öffnen und flashen.
4. **Ladeschale:** Hinten sitzen zwei Kontaktstifte. Erst mit dem Multimeter prüfen: keine Spannung, bei Probealarm Durchgang. Dann je ein Jumper-Kabel von einem Stift an **GPIO4**, vom anderen an **GND** (Reihenfolge egal).
5. ESP32 dauerhaft ans USB-Netzteil.

## 5b · Melder: Funk-Alarmschalter über die Tuya-Brücke

1. Schalter in der App **Smart Life** koppeln (nicht in ELESION o. Ä. – nur Smart Life/Tuya Smart funktionieren). In der App **automatische Aktualisierung aus**.
2. Im Browser `http://<IP der NAS>:8082` öffnen.
3. **User Code** eintragen (Smart Life: *Ich → Zahnrad → Konto und Sicherheit*), QR-Code mit Smart Life scannen (*+ → Scannen*), bestätigen.
4. Die Seite zeigt den überwachten Kontakt. Probealarm → unter „Letzte Meldungen“ erscheint `doorcontact_state: false` und „Letzter Alarm“.

Die Brücke meldet sich wie ein Melder mit der Kennung aus `docker-compose.yml` (`KENNUNG: ich`) – dort auf deine Kennung ändern und neu bereitstellen.

## 6 · Heimalarm auf jedem PC und Handy

Auf **jedem** Gerät, das reagieren soll – beliebig viele PCs und Laptops:

1. *Einstellungen → Betrieb & Verbindung* → **Mit Zentrale**.
2. Darunter Adresse = **IP der NAS**, Port `9001`, Benutzer `heimalarm`, Passwort = **`MQTT_PASSWORD` aus `.env`** → **Speichern & verbinden**.
3. *Alarm & Quellen* → **Melder** an. Am Handy nach Wunsch SYBOS, aPager, Divera dazu.
4. *Alarm* → **Meine Kennung** = Kennung des Melders (z. B. `daniel`).
5. Nur Handy: *Einstellungen → Android* → Benachrichtigungen mitlesen erlauben, Akku-Optimierung aus.

Damit gilt:
- **Melder löst aus** → alle PCs mit dieser Kennung zeigen „Fährst du?“.
- **SYBOS/aPager/Divera am Handy** → das Handy meldet an die Zentrale → ebenfalls alle PCs.
- Ein **gemeinsamer PC**, der bei mehreren Personen ausgehen soll: *Einstellungen → Dieser PC → „Abfrage auch bei Alarm von“* weitere Kennungen eintragen.

Start in der App zeigt den Aufbau als Schaubild und hakt erledigte Schritte ab. Oben steht „Aktiv“ mit grüner Pille „Verbunden“, sobald alles läuft.

> **Kennung – was ist das?** Ein kurzer Name für eine Person, z. B. `daniel`. Nur Kleinbuchstaben, Ziffern und `-`, keine Leerzeichen oder Umlaute. Jede Person bekommt eine **eigene** Kennung – lässt du überall den Standard `ich` stehen, lösen sich mehrere Personen gegenseitig aus.
>
> Dieselbe Kennung muss an **allen** diesen Stellen stehen:
>
> | Wo | Feld |
> |---|---|
> | App auf jedem eigenen PC und Handy | *Alarm & Quellen → Alarm → Meine Kennung* |
> | ESP32 | `kennung:` oben in der YAML-Datei |
> | Funk-Alarmschalter | `KENNUNG:` bei `tuya-bruecke` in `docker-compose.yml` |
> | Weitere Personen | *Einstellungen → Personen* |

## 7 · Testen

1. *Test & Diagnose → Testalarm* – nur die Abfrage, nichts passiert.
2. *Test & Diagnose → Verbindungstest* – Zentrale und Zentrale-Programm grün. Der Melder erscheint als „Melder (ESP32)“ oder „Melder (Funkschalter)“, je nachdem, was eingerichtet ist.
3. *Melder-Alarm nachspielen* – wie ein echter Melder-Alarm, geht an alle Geräte. Licht und PC-Aktion bleiben aus (läuft als Test).
4. Echter Probealarm in der Ladeschale → alle PCs fragen „Fährst du?“, das Handy meldet.

## Später (optional)

- **Licht:** *Geräte → WLAN-Geräte* oder Zigbee (USB-Stick bzw. SLZB-06, Profil `zigbee`).
- **Alexa:** Voice-Monkey-Token unter *Einstellungen → Alexa, Google & HA*, in Routinen „+ Alexa“. Lokal über Matter: Profil `matter` – auf der NAS noch ungetestet.
- **Kollege:** eigener Melder mit eigener Kennung, Person unter *Einstellungen → Personen* anlegen.
