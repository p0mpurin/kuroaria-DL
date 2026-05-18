use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DownloadStatus {
    Active,
    Waiting,
    Paused,
    Complete,
    Error,
    Removed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub category: String,
    pub message: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadItem {
    pub id: String,
    pub gid: Option<String>,
    pub url: String,
    pub filename: String,
    pub status: DownloadStatus,
    pub total_length: u64,
    pub completed_length: u64,
    pub download_speed: u64,
    pub progress_percent: f64,
    pub eta_seconds: f64,
    pub dir: String,
    pub connections: u32,
    pub error_message: Option<String>,
    #[serde(default)]
    pub referer: Option<String>,
    /// `Cookie` header value from the browser (needed for gofile CDN links).
    #[serde(default)]
    pub cookies: Option<String>,
    pub retry_count: u32,
    pub logs: Vec<LogEntry>,
    pub added_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub download_dir: String,
    pub max_concurrent: u32,
    pub retry_attempts: u32,
    pub max_download_speed: u32,
    pub max_upload_speed: u32,
    pub auto_start: bool,
    pub aria2_rpc_url: String,
    pub aria2_rpc_secret: String,
    pub split: u32,
    pub bridge_enabled: bool,
    pub bridge_port: u16,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_minimize_to_tray")]
    pub minimize_to_tray: bool,
}

fn default_theme() -> String {
    "dark".into()
}

fn default_minimize_to_tray() -> bool {
    true
}

impl Default for AppSettings {
    fn default() -> Self {
        let download_dir = dirs::download_dir()
            .or_else(dirs::home_dir)
            .map(|p| p.join("KuroAria").to_string_lossy().into_owned())
            .unwrap_or_else(|| ".".into());
        Self {
            download_dir,
            max_concurrent: 3,
            retry_attempts: 3,
            max_download_speed: 0,
            max_upload_speed: 0,
            auto_start: true,
            aria2_rpc_url: "http://127.0.0.1:6800/jsonrpc".into(),
            aria2_rpc_secret: String::new(),
            split: 16,
            bridge_enabled: false,
            bridge_port: 17888,
            theme: default_theme(),
            minimize_to_tray: default_minimize_to_tray(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadsSnapshot {
    pub downloads: Vec<DownloadItem>,
    pub settings: AppSettings,
    pub aria2_connected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddDownloadRequest {
    pub url: String,
    pub filename: Option<String>,
    #[serde(default)]
    pub referer: Option<String>,
    #[serde(default)]
    pub cookies: Option<String>,
    /// Bridge / extension adds should start immediately in aria2.
    #[serde(default)]
    pub force_start: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedState {
    pub downloads: Vec<DownloadItem>,
    pub settings: AppSettings,
    pub selected_id: Option<String>,
}

impl DownloadItem {
    pub fn push_log(&mut self, category: &str, message: impl Into<String>) {
        self.logs.push(LogEntry {
            category: category.into(),
            message: message.into(),
            timestamp: chrono::Utc::now().to_rfc3339(),
        });
        if self.logs.len() > 40 {
            let drain = self.logs.len() - 40;
            self.logs.drain(0..drain);
        }
    }

    pub fn recompute_progress(&mut self) {
        if self.total_length > 0 {
            self.progress_percent =
                (self.completed_length as f64 / self.total_length as f64) * 100.0;
        } else if self.status == DownloadStatus::Complete {
            self.progress_percent = 100.0;
        }
        if self.download_speed > 0 && self.total_length > self.completed_length {
            let remaining = self.total_length - self.completed_length;
            self.eta_seconds = remaining as f64 / self.download_speed as f64;
        } else {
            self.eta_seconds = 0.0;
        }
    }
}
