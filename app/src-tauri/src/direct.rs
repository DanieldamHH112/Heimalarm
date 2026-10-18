//! Direktverbindung ohne Zentrale: Der PC nimmt Alarme vom Handy im Heimnetz an.
//! Minimaler HTTP-Empfänger (nur Heimnetz): GET /ping, POST /alarm, POST /config (Einstellungen vom Handy) mit Kopfzeile X-Heimalarm-Key.
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

static KEY: OnceLock<Mutex<String>> = OnceLock::new();
static STARTED: OnceLock<u16> = OnceLock::new();

fn key() -> String {
    KEY.get_or_init(|| Mutex::new(String::new())).lock().map(|k| k.clone()).unwrap_or_default()
}

/// IP-Adresse dieses Geräts im Heimnetz (ohne dass etwas gesendet wird).
pub fn local_ip() -> String {
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| s.connect("192.168.0.1:9").map(|_| s))
        .and_then(|s| s.local_addr())
        .map(|a| a.ip().to_string())
        .unwrap_or_default()
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
    let mut reader = BufReader::new(stream.try_clone().expect("stream"));
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
            len = v.trim().parse().unwrap_or(0).min(16_384);
        } else if lower.starts_with("x-heimalarm-key:") {
            got_key = h[16..].trim().to_string();
        }
    }
    let mut body = vec![0u8; len];
    let _ = reader.read_exact(&mut body);
    let expected = key();
    if expected.is_empty() || got_key != expected {
        return reply(&mut stream, "403 Forbidden", r#"{"ok":false,"error":"Code falsch"}"#);
    }
    match (method, path) {
        ("GET", "/ping") => reply(&mut stream, "200 OK", r#"{"ok":true,"app":"heimalarm"}"#),
        ("POST", "/alarm") => {
            let _ = app.emit("direct-alarm", String::from_utf8_lossy(&body).to_string());
            reply(&mut stream, "200 OK", r#"{"ok":true}"#);
        }
        ("POST", "/config") => {
            let _ = app.emit("direct-config", String::from_utf8_lossy(&body).to_string());
            reply(&mut stream, "200 OK", r#"{"ok":true}"#);
        }
        _ => reply(&mut stream, "404 Not Found", r#"{"ok":false}"#),
    }
}

/// Empfänger starten (einmalig) bzw. Code ändern. Liefert die eigene IP.
#[tauri::command]
pub fn direct_server(app: AppHandle, port: u16, code: String) -> Result<String, String> {
    *KEY.get_or_init(|| Mutex::new(String::new())).lock().map_err(|e| e.to_string())? = code;
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
