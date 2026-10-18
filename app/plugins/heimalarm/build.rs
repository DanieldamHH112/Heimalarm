const COMMANDS: &[&str] = &["status", "open_battery_settings", "open_notification_access", "set_service", "registerListener", "remove_listener", "install_apk", "configure", "pending_notifications", "show_alarm", "stop_alarm", "play_sound", "stop_sound", "pick_sound", "list_sounds", "delete_sound", "alarm_volume", "set_alarm_volume", "open_full_screen_settings"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).android_path("android").build();
}
