const COMMANDS: &[&str] = &["status", "open_battery_settings", "open_notification_access", "set_service", "registerListener", "remove_listener", "install_apk"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).android_path("android").build();
}
