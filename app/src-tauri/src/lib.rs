//! Rust-Kern von Heimalarm: nur das, was die Web-Oberfläche nicht selbst kann.

/// PC-Aktion nach der Abfrage "Fährst du?" (nur Windows).
#[tauri::command]
fn pc_action(action: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const NO_WINDOW: u32 = 0x0800_0000;
        let run = |prog: &str, args: &[&str]| -> Result<(), String> {
            Command::new(prog)
                .args(args)
                .creation_flags(NO_WINDOW)
                .spawn()
                .map(|_| ())
                .map_err(|e| e.to_string())
        };
        match action.as_str() {
            "hibernate" => run("shutdown", &["/h"]),
            // Hinweis: Ist der Ruhezustand aktiv, legt SetSuspendState den PC ebenfalls in den Ruhezustand.
            "sleep" => run("rundll32.exe", &["powrprof.dll,SetSuspendState", "0,1,0"]),
            "lock" => run("rundll32.exe", &["user32.dll,LockWorkStation"]),
            "shutdown" => run("shutdown", &["/s", "/t", "0"]),
            // Sanft herunterfahren; hängt ein Programm, nach 120 s Ruhezustand.
            "mixed" => {
                run("shutdown", &["/s", "/t", "0"])?;
                std::thread::spawn(|| {
                    std::thread::sleep(std::time::Duration::from_secs(120));
                    let _ = Command::new("shutdown").arg("/h").creation_flags(NO_WINDOW).spawn();
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_notification::init());
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        None,
    ));
    builder
        .invoke_handler(tauri::generate_handler![pc_action])
        .run(tauri::generate_context!())
        .expect("Heimalarm konnte nicht starten");
}
