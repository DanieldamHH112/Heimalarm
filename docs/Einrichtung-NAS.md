# Einrichtung mit NAS als Zentrale

Am Beispiel einer **UGREEN NASync DXP2800** (UGOS Pro). Andere NAS mit Docker-Oberfläche (z. B. Synology Container Manager) funktionieren genauso – nur die Menüs heißen anders.

```
Ladeschale (TPG2200) ──► ESP32 ──WLAN──► NAS (Zentrale) ──► Heimalarm auf allen PCs + Handy, Licht, Alexa
```

---

## 1 · Feste IP für die NAS

Im **WLAN-Router** (Weboberfläche oder App) die NAS in der Geräteliste suchen und ihr eine **feste IP-Adresse** geben – je nach Router heißt das „immer die gleiche IP“, „IP reservieren“ oder „DHCP-Reservierung“. Sonst kann sich die Adresse ändern, und ESP32 und App finden die Zentrale nicht mehr.
Die IP (z. B. `192.168.178.43`) notieren – sie wird gleich mehrfach gebraucht.

## 2 · Dateien auf die NAS

1. Am PC: GitHub → **Code → Download ZIP**, entpacken.
2. NAS: App **Docker** installieren (App Center).
3. App **Dateien** → **Freigegebener Ordner → docker** → neuen Ordner **`heimalarm`** anlegen.
4. Den **Inhalt** des Ordners `zentrale` hineinladen: `docker-compose.yml`, `.env.example` und die Ordner `dienst`, `mosquitto`.
   - **Nur eine Compose-Datei:** Liegen `docker-compose.yml` **und** `docker-compose.yaml` im Ordner, nimmt Docker nur eine. Die überzählige löschen.
5. `.env.example` mit dem **Editor** (Windows: Rechtsklick → *Öffnen mit → Editor*) öffnen, bei `MQTT_PASSWORD=` ein langes eigenes Passwort eintragen und als **`.env`** speichern. **Pflicht** – ohne Passwort startet die Zentrale nicht.
   - **Achtung Windows:** Beim Speichern *Dateityp → Alle Dateien* wählen, sonst entsteht `.env.txt` und die Zentrale findet die Datei nicht. Im Explorer *Ansicht → Dateinamenerweiterungen* einschalten, um das zu prüfen.
   - Dieses Passwort brauchst du an **zwei Stellen**: in der App (*Einstellungen → Betrieb & Verbindung*, Benutzer `heimalarm`) und im ESP32 (`mqtt_pw` in `secrets.yaml`).
   - `.env` beginnt mit einem Punkt und ist darum **versteckt**. Im Dateimanager „versteckte Dateien anzeigen“ einschalten, um sie zu sehen.

## 3 · Projekt starten

1. **Docker → Projekt → Erstellen**.
2. Name `heimalarm`, Speicherpfad **docker/heimalarm** – die vorhandene `docker-compose.yml` wird erkannt.
3. Haken **„Nach der Erstellung sofort ausführen“** → **Bereitstellen**. Der erste Start dauert 3–5 Minuten.
4. Unter **Container** laufen jetzt `mosquitto` und `dienst`.

**Später Dateien geändert?** *Projekt → heimalarm → Compose-Konfiguration → Neu bereitstellen*. Baut Docker dabei nichts neu (leeres Protokoll), unter **Container** den betroffenen Container und danach unter **Image** sein Image löschen, dann erneut bereitstellen.

**Weitere Profile:** `zigbee` (Zigbee-Stick), `matter` (Licht für Alexa/Google) und `esphome` (ESPHome-Oberfläche auf Port 6052, um den ESP32 im Browser zu bauen statt über web.esphome.io) sind aus, bis du sie einschaltest.

**Port belegt?** In `docker-compose.yml` links vom Doppelpunkt eine andere Zahl eintragen (1883, 9001) und diese dann in App bzw. ESP32 verwenden.

## 4 · Melder: ESP32

**Einkauf:** ESP32-S3 DevKitC-1 N16R8 mit **verlöteten** Stiftleisten, USB-C-**Daten**kabel, Jumper-Kabel (Buchse–Buchse), 2-adriges Kabel (z. B. Klingeldraht), 2 WAGO-Klemmen 221, altes USB-Netzteil.

1. `esp32/secrets.example.yaml` → `secrets.yaml` kopieren und ausfüllen: WLAN (2,4 GHz), `mqtt_host` = **IP der NAS**, eigenes `ota_pw` (**unbedingt ändern**). `mqtt_user` bleibt `heimalarm`, bei `mqtt_pw` **dasselbe Passwort wie `MQTT_PASSWORD` in `.env`** – sonst verbindet sich der ESP32 nie.
2. In `alarm-ich-s3.yaml` die `kennung` setzen, z. B. `daniel` – nur Kleinbuchstaben, Ziffern und `-`. Dieselbe kommt später in jede App (siehe Kasten „Kennung“ unten).
3. Flashen am Windows-PC (Schritt 4B der [ESP32-Anleitung](anleitungen/Heimalarm-Einrichtung-ESP32.pdf)): `winget install Python.Python.3.12`, neues Fenster, `pip install esphome`, im Ordner `esp32` dann `esphome run alarm-ich-s3.yaml` und den `COM`-Anschluss wählen. Buchse **COM/UART** am Board.
4. **Ladeschale:** Sie hat eine kleine **Steckklemme** (runde Löcher für die Drähte, eckige Schlitze zum Lösen). Erst mit dem Multimeter prüfen: keine Spannung, bei Probealarm Durchgang. Dann das 2-adrige Kabel einstecken und am anderen Ende per WAGO-Klemme mit zwei Jumper-Kabeln verbinden – **keine Litze direkt in die Jumper-Buchse stecken**. Ein Jumper an **4** (GPIO4), der andere an **GND**. Pin 4 liegt direkt neben **RST** – genau zählen.
5. ESP32 dauerhaft ans USB-Netzteil.
6. *Test & Diagnose → Kontakt-Test* starten und die Kabelenden verbinden: Die Anzeige muss auf „geschlossen“ springen. Löst der Alarm erst beim Öffnen aus: *Einstellungen → ESP32 → „Alarm, wenn der Kontakt“ → öffnet*.

## 5 · Heimalarm auf jedem PC und Handy

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
> | Weitere Personen | *Einstellungen → Personen* |

## 6 · Testen

1. *Test & Diagnose → Testalarm* – nur die Abfrage, nichts passiert.
2. *Test & Diagnose → Verbindungstest* – Zentrale und Zentrale-Programm grün. Der Melder erscheint als „Melder (ESP32)“.
3. *Kontakt-Test* – zeigt live offen/geschlossen, ohne Alarm.
4. *Melder-Alarm nachspielen* – wie ein echter Melder-Alarm, geht an alle Geräte. Licht und PC-Aktion bleiben aus (läuft als Test).
5. Echter Probealarm in der Ladeschale → alle PCs fragen „Fährst du?“, das Handy meldet.

## Später (optional)

- **Licht:** *Geräte → WLAN-Geräte* oder Zigbee (USB-Stick bzw. SLZB-06, Profil `zigbee`).
- **Alexa:** Voice-Monkey-Token unter *Einstellungen → Alexa, Google & HA*, in Routinen „+ Alexa“. Lokal über Matter: Profil `matter` – auf der NAS noch ungetestet.
- **Kollege:** eigener Melder mit eigener Kennung, Person unter *Einstellungen → Personen* anlegen.
