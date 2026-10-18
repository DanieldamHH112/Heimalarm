//! Rust-Kern von Heimalarm: nur das, was die Web-Oberfläche nicht selbst kann.

#[cfg(target_os = "windows")]
mod win {
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Output};
    const NO_WINDOW: u32 = 0x0800_0000;

    pub fn spawn(prog: &str, args: &[&str]) -> Result<(), String> {
        Command::new(prog).args(args).creation_flags(NO_WINDOW).spawn().map(|_| ()).map_err(|e| e.to_string())
    }
    pub fn output(prog: &str, args: &[&str]) -> Result<Output, String> {
        Command::new(prog).args(args).creation_flags(NO_WINDOW).output().map_err(|e| e.to_string())
    }
}

/// D1 – PC-Aktion nach der Abfrage "Fährst du?".
#[tauri::command]
fn pc_action(action: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use win::spawn;
        match action.as_str() {
            "hibernate" => spawn("shutdown", &["/h"]),
            // Ist der Ruhezustand aktiv, legt SetSuspendState den PC ebenfalls in den Ruhezustand.
            "sleep" => spawn("rundll32.exe", &["powrprof.dll,SetSuspendState", "0,1,0"]),
            "lock" => spawn("rundll32.exe", &["user32.dll,LockWorkStation"]),
            "shutdown" => spawn("shutdown", &["/s", "/t", "0"]),
            // Sanft herunterfahren; hängt ein Programm, nach 120 s Ruhezustand.
            "mixed" => {
                spawn("shutdown", &["/s", "/t", "0"])?;
                std::thread::spawn(|| {
                    std::thread::sleep(std::time::Duration::from_secs(120));
                    let _ = spawn("shutdown", &["/h"]);
                });
                Ok(())
            }
            "none" => Ok(()),
            other => Err(format!("Unbekannte Aktion: {other}")),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = action;
        Err("Nur unter Windows verfügbar".into())
    }
}

/// D7 – Welche der angegebenen Programme (z. B. "obs64.exe") laufen gerade?
#[tauri::command]
fn running_processes(names: Vec<String>) -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        let out = win::output("tasklist", &["/fo", "csv", "/nh"])?;
        let list = String::from_utf8_lossy(&out.stdout).to_lowercase();
        Ok(names.into_iter().filter(|n| list.contains(&format!("\"{}\"", n.to_lowercase()))).collect())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = names;
        Ok(vec![])
    }
}

/// D8 – Medienwiedergabe stoppen (Medientaste "Stopp").
#[tauri::command]
fn stop_media() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{keybd_event, KEYEVENTF_KEYUP, VK_MEDIA_STOP};
        unsafe {
            keybd_event(VK_MEDIA_STOP as u8, 0, 0, 0);
            keybd_event(VK_MEDIA_STOP as u8, 0, KEYEVENTF_KEYUP, 0);
        }
    }
    Ok(())
}

/// D10 – Ist der Ruhezustand aktiviert? (Registry, sprachunabhängig)
#[tauri::command]
fn hibernate_enabled() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let out = win::output("reg", &["query", r"HKLM\SYSTEM\CurrentControlSet\Control\Power", "/v", "HibernateEnabled"])?;
        Ok(String::from_utf8_lossy(&out.stdout).contains("0x1"))
    }
    #[cfg(not(target_os = "windows"))]
    Ok(false)
}

/// D10 – Ruhezustand einschalten (Windows fragt nach Admin-Rechten).
#[tauri::command]
fn enable_hibernate() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        win::spawn("powershell", &["-NoProfile", "-Command", "Start-Process powercfg -ArgumentList '/h on' -Verb RunAs"])
    }
    #[cfg(not(target_os = "windows"))]
    Err("Nur unter Windows verfügbar".into())
}

/// D11 – MAC-Adresse des aktiven Netzwerkadapters.
#[tauri::command]
fn mac_address() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let out = win::output("getmac", &["/fo", "csv", "/nh"])?;
        let text = String::from_utf8_lossy(&out.stdout);
        text.lines()
            .filter(|l| !l.contains("N/A") && !l.to_lowercase().contains("disconnected") && !l.contains("getrennt"))
            .find_map(|l| l.split(',').next().map(|s| s.trim_matches('"').to_string()))
            .filter(|s| s.len() == 17)
            .ok_or_else(|| "Keine MAC-Adresse gefunden".into())
    }
    #[cfg(not(target_os = "windows"))]
    Err("Nur unter Windows verfügbar".into())
}

/// D11 – Wake-on-LAN-Paket ins Heimnetz senden (Handy und PC).
#[tauri::command]
fn wake_on_lan(mac: String) -> Result<(), String> {
    let hex: String = mac.chars().filter(|c| c.is_ascii_hexdigit()).collect();
    if hex.len() != 12 {
        return Err("MAC-Adresse ungültig".into());
    }
    let bytes: Vec<u8> = (0..6).map(|i| u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).unwrap_or(0)).collect();
    let mut packet = vec![0xffu8; 6];
    for _ in 0..16 {
        packet.extend_from_slice(&bytes);
    }
    let sock = std::net::UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    sock.set_broadcast(true).map_err(|e| e.to_string())?;
    sock.send_to(&packet, "255.255.255.255:9").map_err(|e| e.to_string())?;
    Ok(())
}

mod direct;

/// Startargument des Autostarts: Fenster bleibt verborgen, nur das Symbol im Infobereich erscheint.
#[cfg(desktop)]
const HIDDEN_ARG: &str = "--im-hintergrund";

/// Windows: Symbol im Infobereich (Taskleiste) mit Menü „Öffnen“ / „Beenden“.
#[cfg(desktop)]
fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let open = MenuItem::with_id(app, "open", "Heimalarm öffnen", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Beenden (keine Alarme mehr)", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Heimalarm – empfängt Alarme")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[cfg(desktop)]
fn show_main(app: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(desktop)]
    let builder = tauri::Builder::default()
        // Zweiter Start (z. B. Doppelklick aufs Symbol) holt das laufende Fenster nach vorn.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)));
    #[cfg(not(desktop))]
    let builder = tauri::Builder::default();
    let builder = builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_heimalarm::init());
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![HIDDEN_ARG]),
        ))
        .setup(|app| {
            use tauri::Manager;
            setup_tray(app)?;
            if std::env::args().any(|a| a == HIDDEN_ARG) {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            Ok(())
        })
        // Schließen (X) beendet die App nicht, sie läuft im Infobereich weiter.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        });
    builder
        .invoke_handler(tauri::generate_handler![
            pc_action,
            running_processes,
            stop_media,
            hibernate_enabled,
            enable_hibernate,
            mac_address,
            wake_on_lan,
            direct::direct_server
        ])
        .run(tauri::generate_context!())
        .expect("Heimalarm konnte nicht starten");
}
