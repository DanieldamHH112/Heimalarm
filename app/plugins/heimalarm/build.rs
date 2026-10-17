const COMMANDS: &[&str] = &["status", "open_battery_settings", "open_notification_access", "set_service"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).android_path("android").build();
}
