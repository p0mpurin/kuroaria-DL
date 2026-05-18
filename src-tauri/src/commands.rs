use tauri::State;
use tauri_plugin_opener::OpenerExt;

use crate::models::{
    AddDownloadRequest, AppSettings, DownloadItem, DownloadsSnapshot,
};
use crate::bridge::BridgeHandle;
use crate::runtime::RuntimePrefs;
use crate::state::{self, SharedState};

#[tauri::command]
pub fn get_snapshot(state: State<'_, SharedState>) -> DownloadsSnapshot {
    state.blocking_lock().snapshot()
}

#[tauri::command]
pub async fn add_download(
    state: State<'_, SharedState>,
    req: AddDownloadRequest,
) -> Result<DownloadItem, String> {
    state
        .lock()
        .await
        .add_download(req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pause_download(state: State<'_, SharedState>, id: String) -> Result<(), String> {
    state
        .lock()
        .await
        .pause_download(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resume_download(state: State<'_, SharedState>, id: String) -> Result<(), String> {
    state
        .lock()
        .await
        .resume_download(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_download(state: State<'_, SharedState>, id: String) -> Result<(), String> {
    state
        .lock()
        .await
        .cancel_download(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn retry_download(state: State<'_, SharedState>, id: String) -> Result<(), String> {
    state
        .lock()
        .await
        .retry_download(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_download(state: State<'_, SharedState>, id: String) -> Result<(), String> {
    state
        .lock()
        .await
        .remove_download(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn select_download(
    state: State<'_, SharedState>,
    id: Option<String>,
) -> Result<(), String> {
    state
        .lock()
        .await
        .select_download(id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_selected_id(state: State<'_, SharedState>) -> Option<String> {
    state.blocking_lock().selected_id.clone()
}

#[tauri::command]
pub async fn update_settings(
    state: State<'_, SharedState>,
    bridge: State<'_, BridgeHandle>,
    runtime: State<'_, RuntimePrefs>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    runtime.set_minimize_to_tray(settings.minimize_to_tray);
    let saved = state
        .lock()
        .await
        .update_settings(settings)
        .await
        .map_err(|e| e.to_string())?;
    state::sync_bridge_after_settings(&bridge, &state, &saved).await;
    Ok(saved)
}

#[tauri::command]
pub fn show_main_window(app: tauri::AppHandle) {
    if let Some(window) = tauri::Manager::get_webview_window(&app, "main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[tauri::command]
pub async fn pick_download_dir(state: State<'_, SharedState>) -> Result<Option<String>, String> {
    let current = state.lock().await.settings.download_dir.clone();
    let picked = rfd::AsyncFileDialog::new()
        .set_title("Choose download folder")
        .pick_folder()
        .await;

    Ok(picked.map(|p| {
        let path = p.path().to_string_lossy().into_owned();
        if path.is_empty() { current } else { path }
    }))
}

#[tauri::command]
pub async fn open_download_folder(
    app: tauri::AppHandle,
    state: State<'_, SharedState>,
    id: String,
) -> Result<(), String> {
    let dir = state
        .lock()
        .await
        .downloads
        .iter()
        .find(|d| d.id == id)
        .map(|d| d.dir.clone())
        .ok_or_else(|| "download not found".to_string())?;
    app.opener().open_path(dir, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_aria2_connection(state: State<'_, SharedState>) -> Result<bool, String> {
    let mut guard = state.lock().await;
    guard.refresh_aria2_connection().await;
    Ok(guard.aria2_connected)
}
