//! Direktverbindung ohne Zentrale: Der PC nimmt Alarme und Einstellungen vom Handy im Heimnetz an.
//! Minimaler HTTP-Empfänger (nur Heimnetz), Kopfzeile X-Heimalarm-Key:
//!   Kopplungscode (am PC angezeigt): GET /ping, POST /pair  → liefert einen eigenen Code für dieses Handy
//!   Eigener Code des Handys:          GET /ping, POST /alarm, GET /config, POST /config
//!   aPager-Webhook (Schlüssel im Pfad): GET|POST /apager/<schlüssel>?keyword=&unit=[&event=]
//! Ein Handy entkoppeln = seinen Code aus der Liste nehmen (direct_server erneut aufrufen).
use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

#[derive(Default)]
struct Keys {
    pairing: String,
    phones: Vec<String>,
    name: String,
    config: String,
    hook: String,
}

static KEYS: OnceLock<Mutex<Keys>> = OnceLock::new();
static STARTED: OnceLock<u16> = OnceLock::new();

fn keys() -> &'static Mutex<Keys> {
    KEYS.get_or_init(|| Mutex::new(Keys::default()))
}

/// IP-Adresse dieses Geräts im Heimnetz (ohne dass etwas gesendet wird).
pub fn local_ip() -> String {
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| s.connect("192.168.0.1:9").map(|_| s))
        .and_then(|s| s.local_addr())
        .map(|a| a.ip().to_string())
        .unwrap_or_default()
}

/// Zufälliger 8-stelliger Code (ohne zusätzliche Abhängigkeit).
fn new_code() -> String {
    let mut h = RandomState::new().build_hasher();
    h.write_u128(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
    format!("{:08}", h.finish() % 100_000_000)
}

fn esc(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn reply(stream: &mut TcpStream, code: &str, body: &str) {
    let _ = write!(
        stream,
        "HTTP/1.1 {code}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
}

fn handle(app: &AppHandle, mut stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));
    let mut reader = BufReader::new(match stream.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    });
    let mut line = String::new();
    if reader.read_line(&mut line).is_err() {
        return;
    }
    let mut parts = line.split_whitespace();
    let (method, path) = (parts.next().unwrap_or(""), parts.next().unwrap_or(""));
    let (mut len, mut got_key) = (0usize, String::new());
    loop {
        let mut h = String::new();
        if reader.read_line(&mut h).is_err() || h.trim().is_empty() {
            break;
        }
        let lower = h.to_ascii_lowercase();
        if let Some(v) = lower.strip_prefix("content-length:") {
            len = v.trim().parse().unwrap_or(0).min(8_388_608);
        } else if lower.starts_with("x-heimalarm-key:") {
            got_key = h[16..].trim().to_string();
        }
    }
    let mut body = vec![0u8; len];
    let _ = reader.read_exact(&mut body);
    let body = String::from_utf8_lossy(&body).to_string();

    // aPager-PRO-Webhook direkt an diesen PC: /apager/<schlüssel>?keyword=..&unit=..[&event=recall|clear]
    // (aPager auf dem Handy ruft die Adresse selbst auf – geht ohne Zentrale, solange das Handy im WLAN ist)
    if let Some(rest) = path.strip_prefix("/apager/") {
        let (key, query) = rest.split_once('?').unwrap_or((rest, ""));
        let hook = keys().lock().map(|k| k.hook.clone()).unwrap_or_default();
        if hook.is_empty() || key != hook {
            return reply(&mut stream, "403 Forbidden", r#"{"ok":false,"error":"Schlüssel falsch"}"#);
        }
        let _ = app.emit("direct-webhook", format!("{query}\n{body}"));
        return reply(&mut stream, "200 OK", r#"{"ok":true}"#);
    }

    let (pairing, phone, name, config) = {
        let k = match keys().lock() {
            Ok(k) => k,
            Err(_) => return,
        };
        let pairing = !got_key.is_empty() && got_key == k.pairing;
        let phone = !got_key.is_empty() && k.phones.iter().any(|c| c == &got_key);
        (pairing, phone, k.name.clone(), k.config.clone())
    };
    if !pairing && !phone {
        return reply(&mut stream, "403 Forbidden", r#"{"ok":false,"error":"Code falsch"}"#);
    }
    if phone {
        let _ = app.emit("direct-seen", got_key.clone());
    }
    match (method, path) {
        ("GET", "/ping") => reply(
            &mut stream,
            "200 OK",
            &format!(r#"{{"ok":true,"app":"heimalarm","name":"{}","paired":{}}}"#, esc(&name), phone),
        ),
        ("POST", "/pair") => {
            let code = new_code();
            if let Ok(mut k) = keys().lock() {
                k.phones.push(code.clone());
            }
            let _ = app.emit("direct-pair", format!(r#"{{"code":"{code}","info":{}}}"#, if body.trim().starts_with('{') { body.trim() } else { "{}" }));
            reply(&mut stream, "200 OK", &format!(r#"{{"ok":true,"code":"{code}","name":"{}"}}"#, esc(&name)));
        }
        ("POST", "/alarm") if phone => {
            let _ = app.emit("direct-alarm", body);
            reply(&mut stream, "200 OK", r#"{"ok":true}"#);
        }
        ("GET", "/config") if phone => reply(&mut stream, "200 OK", if config.is_empty() { "{}" } else { &config }),
        ("POST", "/config") if phone => {
            let _ = app.emit("direct-config", body);
            reply(&mut stream, "200 OK", r#"{"ok":true}"#);
        }
        (_, "/alarm" | "/config") => reply(&mut stream, "403 Forbidden", r#"{"ok":false,"error":"Nicht gekoppelt"}"#),
        _ => reply(&mut stream, "404 Not Found", r#"{"ok":false}"#),
    }
}

/// Empfänger starten (einmalig) bzw. Codes und Namen ändern. Liefert die eigene IP.
/// `code` = Kopplungscode, `phones` = eigene Codes der gekoppelten Handys.
#[tauri::command]
pub fn direct_server(app: AppHandle, port: u16, code: String, phones: Option<Vec<String>>, name: Option<String>, hook: Option<String>) -> Result<String, String> {
    {
        let mut k = keys().lock().map_err(|e| e.to_string())?;
        k.hook = hook.unwrap_or_default();
        k.pairing = code;
        k.phones = phones.unwrap_or_default();
        k.name = name.unwrap_or_default();
    }
    if STARTED.get().is_none() {
        let listener = TcpListener::bind(("0.0.0.0", port)).map_err(|e| format!("Port {port} belegt: {e}"))?;
        let _ = STARTED.set(port);
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let app = app.clone();
                std::thread::spawn(move || handle(&app, stream));
            }
        });
    }
    Ok(local_ip())
}

/// Aktuellen Stand der Einstellungen hinterlegen, den Handys mit GET /config abholen.
#[tauri::command]
pub fn direct_set_config(json: String) -> Result<(), String> {
    keys().lock().map_err(|e| e.to_string())?.config = json;
    Ok(())
}
