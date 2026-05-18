use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

pub fn sync_launch_at_login(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let autolaunch = app.autolaunch();
    let is_enabled = autolaunch.is_enabled().map_err(|e| e.to_string())?;
    if enabled && !is_enabled {
        autolaunch.enable().map_err(|e| e.to_string())?;
    } else if !enabled && is_enabled {
        autolaunch.disable().map_err(|e| e.to_string())?;
    }
    Ok(())
}
