use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Result};
use chrono::Utc;
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::aria2::{
    cleanup_download_artifacts, cleanup_orphan_aria2_control_files, describe_aria2_error,
    filename_from_status, filename_from_url, is_gofile_page_or_api_url, lengths_from_status,
    parse_u64, paths_from_status, sanitize_filename, validate_completed_download, Aria2Client,
    Aria2Status,
};

const CANCELLED_URL_BLOCK_SECS: u64 = 120;
use crate::models::{
    AddDownloadRequest, AppSettings, DownloadItem, DownloadStatus, DownloadsSnapshot,
    PersistedState,
};
use crate::persistence::Store;

pub struct AppState {
    pub downloads: Vec<DownloadItem>,
    pub settings: AppSettings,
    pub selected_id: Option<String>,
    pub aria2_connected: bool,
    store: Store,
    app: Option<AppHandle>,
    /// Drives periodic aria2.purgeDownloadResult (memory hygiene).
    sync_poll_count: u32,
    /// Prevents the extension from instantly re-adding a URL the user just cancelled.
    recently_cancelled_urls: HashMap<String, Instant>,
}

impl AppState {
    pub fn new(store: Store) -> Result<Self> {
        let mut settings = AppSettings::default();
        let mut downloads = Vec::new();
        let mut selected_id = None;

        if let Some(saved) = store.load()? {
            settings = saved.settings;
            downloads = saved
                .downloads
                .into_iter()
                .filter(|d| d.status != DownloadStatus::Removed)
                .collect();
            selected_id = saved.selected_id.filter(|id| downloads.iter().any(|d| d.id == *id));
        }

        std::fs::create_dir_all(&settings.download_dir).ok();

        Ok(Self {
            downloads,
            settings,
            selected_id,
            aria2_connected: false,
            store,
            app: None,
            sync_poll_count: 0,
            recently_cancelled_urls: HashMap::new(),
        })
    }

    fn prune_cancelled_url_blocks(&mut self) {
        let ttl = Duration::from_secs(CANCELLED_URL_BLOCK_SECS);
        let now = Instant::now();
        self.recently_cancelled_urls
            .retain(|_, t| now.duration_since(*t) < ttl);
    }

    fn block_url(&mut self, url: &str) {
        self.recently_cancelled_urls
            .insert(url.to_string(), Instant::now());
    }

    fn is_url_blocked(&self, url: &str) -> bool {
        let ttl = Duration::from_secs(CANCELLED_URL_BLOCK_SECS);
        self.recently_cancelled_urls
            .get(url)
            .is_some_and(|t| Instant::now().duration_since(*t) < ttl)
    }

    fn active_download_basenames(&self) -> HashSet<String> {
        self.downloads
            .iter()
            .map(|d| sanitize_filename(&d.filename))
            .filter(|n| !n.is_empty())
            .collect()
    }

    fn sweep_orphan_files_in_download_dir(&self) {
        cleanup_orphan_aria2_control_files(
            &self.settings.download_dir,
            &self.active_download_basenames(),
        );
    }

    pub fn set_app(&mut self, app: AppHandle) {
        self.app = Some(app);
    }

    fn client(&self) -> Aria2Client {
        Aria2Client::new(
            self.settings.aria2_rpc_url.clone(),
            self.settings.aria2_rpc_secret.clone(),
        )
    }

    fn persist(&self) -> Result<()> {
        self.store.save(&PersistedState {
            downloads: self
                .downloads
                .iter()
                .filter(|d| d.status != DownloadStatus::Removed)
                .cloned()
                .collect(),
            settings: self.settings.clone(),
            selected_id: self.selected_id.clone(),
        })
    }

    fn emit_snapshot(&self) {
        if let Some(app) = &self.app {
            let _ = app.emit("downloads-updated", self.snapshot());
        }
    }

    fn commit(&mut self) -> Result<()> {
        self.prune_removed_downloads();
        self.persist()?;
        self.emit_snapshot();
        Ok(())
    }

    fn prune_removed_downloads(&mut self) {
        self.downloads
            .retain(|d| d.status != DownloadStatus::Removed);
    }

    pub fn snapshot(&self) -> DownloadsSnapshot {
        DownloadsSnapshot {
            downloads: self
                .downloads
                .iter()
                .filter(|d| d.status != DownloadStatus::Removed)
                .cloned()
                .collect(),
            settings: self.settings.clone(),
            aria2_connected: self.aria2_connected,
        }
    }

    pub async fn refresh_aria2_connection(&mut self) {
        let client = self.client();
        self.aria2_connected = client.ping().await.is_ok();
    }

    pub async fn sync_from_aria2(&mut self) -> Result<()> {
        self.refresh_aria2_connection().await;
        self.sync_poll_count = self.sync_poll_count.wrapping_add(1);

        if !self.aria2_connected {
            let mut changed = false;
            for d in &mut self.downloads {
                if d.status == DownloadStatus::Active {
                    d.status = DownloadStatus::Paused;
                    changed = true;
                }
            }
            if changed {
                self.commit()?;
            }
            return Ok(());
        }

        if self.downloads.is_empty() {
            if self.sync_poll_count.is_multiple_of(40) {
                self.client().purge_download_result().await.ok();
            }
            return Ok(());
        }

        let client = self.client();
        let mut by_gid: HashMap<String, Aria2Status> = HashMap::new();

        for s in client.tell_active().await.unwrap_or_default() {
            by_gid.insert(s.gid.clone(), s);
        }
        for s in client.tell_waiting(0, 32).await.unwrap_or_default() {
            by_gid.insert(s.gid.clone(), s);
        }
        for s in client.tell_paused(0, 32).await.unwrap_or_default() {
            by_gid.insert(s.gid.clone(), s);
        }

        let mut changed = false;
        let mut drop_ids: Vec<String> = Vec::new();

        for item in &mut self.downloads {
            let before = item_snapshot_key(item);
            if let Some(ref gid) = item.gid {
                if let Some(status) = by_gid.get(gid) {
                    apply_aria2_status(item, status);
                    if item.status == DownloadStatus::Removed {
                        drop_ids.push(item.id.clone());
                    }
                } else if item.status == DownloadStatus::Active
                    || item.status == DownloadStatus::Waiting
                    || item.status == DownloadStatus::Paused
                {
                    match client.tell_status(gid).await {
                        Ok(status) => {
                            apply_aria2_status(item, &status);
                            if item.status == DownloadStatus::Removed {
                                drop_ids.push(item.id.clone());
                            } else {
                                note_stall_if_needed(item);
                            }
                        }
                        Err(_) => {
                            drop_ids.push(item.id.clone());
                        }
                    }
                }
            }
            item.recompute_progress();
            if item_snapshot_key(item) != before {
                changed = true;
            }
        }

        if !drop_ids.is_empty() {
            self.downloads.retain(|d| !drop_ids.contains(&d.id));
            if self
                .selected_id
                .as_ref()
                .is_some_and(|id| drop_ids.contains(id))
            {
                self.selected_id = None;
            }
            changed = true;
        }

        let pruned = self.downloads.len();
        self.prune_removed_downloads();
        if self.downloads.len() != pruned {
            changed = true;
        }

        if self.sync_poll_count.is_multiple_of(40) {
            client.purge_download_result().await.ok();
        }

        if changed {
            self.commit()?;
        }
        Ok(())
    }

    pub async fn apply_global_options(&mut self) -> Result<()> {
        if !self.aria2_connected {
            return Ok(());
        }
        let client = self.client();
        let mut opts = serde_json::Map::new();
        opts.insert(
            "max-concurrent-downloads".into(),
            serde_json::json!(self.settings.max_concurrent.to_string()),
        );
        opts.insert(
            "max-download-limit".into(),
            serde_json::json!(crate::aria2::format_speed_limit_kbps(
                self.settings.max_download_speed
            )),
        );
        opts.insert(
            "max-upload-limit".into(),
            serde_json::json!(crate::aria2::format_speed_limit_kbps(
                self.settings.max_upload_speed
            )),
        );
        opts.insert(
            "file-allocation".into(),
            serde_json::json!(crate::aria2::FILE_ALLOCATION_NONE),
        );
        client.change_global_option(opts).await?;
        Ok(())
    }

    pub async fn startup_recovery(&mut self) -> Result<()> {
        self.refresh_aria2_connection().await;
        self.apply_global_options().await.ok();
        self.remove_orphan_aria2_jobs().await.ok();
        self.sweep_orphan_files_in_download_dir();

        if !self.aria2_connected {
            self.emit_snapshot();
            return Ok(());
        }

        let client = self.client();
        for item in self.downloads.clone() {
            if item.status == DownloadStatus::Active
                || item.status == DownloadStatus::Paused
                || item.status == DownloadStatus::Waiting
            {
                if item.gid.is_none() {
                    self.requeue_download(&item.id, false, true).await.ok();
                } else if let Some(ref gid) = item.gid {
                    if item.status == DownloadStatus::Active {
                        client.unpause(gid).await.ok();
                    }
                }
            }
        }

        self.sync_from_aria2().await?;
        Ok(())
    }

    async fn requeue_download(
        &mut self,
        id: &str,
        is_retry: bool,
        force_start: bool,
    ) -> Result<()> {
        let (url, filename, dir, split, auto_start, referer, cookies, max_dl_kbps) = {
            let item = self
                .downloads
                .iter()
                .find(|d| d.id == id)
                .ok_or_else(|| anyhow!("download not found"))?;
            (
                item.url.clone(),
                sanitize_filename(&item.filename),
                self.settings.download_dir.clone(),
                self.settings.split,
                self.settings.auto_start,
                item.referer.clone(),
                item.cookies.clone(),
                self.settings.max_download_speed,
            )
        };

        let client = self.client();
        self.refresh_aria2_connection().await;
        if !self.aria2_connected {
            return Err(anyhow!("aria2 is not connected"));
        }

        let paused = !auto_start && !force_start;
        let gid = client
            .add_uri(
                vec![url.clone()],
                &dir,
                Some(&filename),
                split,
                paused,
                referer.as_deref(),
                cookies.as_deref(),
                max_dl_kbps,
            )
            .await?;

        if let Some(item) = self.downloads.iter_mut().find(|d| d.id == id) {
            item.gid = Some(gid);
            item.filename = filename.clone();
            item.status = if paused {
                DownloadStatus::Waiting
            } else {
                DownloadStatus::Active
            };
            item.error_message = None;
            if is_retry {
                item.retry_count += 1;
            }
            item.push_log(
                "SYSTEM",
                if is_retry {
                    "Download re-queued after failure."
                } else {
                    "Download registered with aria2."
                },
            );
            if url.starts_with("https://") {
                item.push_log("SYSTEM", "Connection secure via HTTPS.");
            }
        }

        self.persist()?;
        self.emit_snapshot();
        Ok(())
    }

    /// Stops aria2 jobs that survived in `aria2.session` but are not in our app list.
    async fn remove_orphan_aria2_jobs(&mut self) -> Result<()> {
        if !self.aria2_connected {
            return Ok(());
        }
        let known_gids: HashSet<String> = self
            .downloads
            .iter()
            .filter_map(|d| d.gid.clone())
            .collect();

        let client = self.client();
        let mut orphans: Vec<Aria2Status> = Vec::new();
        for s in client.tell_active().await.unwrap_or_default() {
            orphans.push(s);
        }
        for s in client.tell_waiting(0, 32).await.unwrap_or_default() {
            orphans.push(s);
        }
        for s in client.tell_paused(0, 32).await.unwrap_or_default() {
            orphans.push(s);
        }
        for s in client.tell_stopped(0, 32).await.unwrap_or_default() {
            orphans.push(s);
        }

        let dir = self.settings.download_dir.clone();
        for status in orphans {
            if known_gids.contains(&status.gid) {
                continue;
            }
            let paths = paths_from_status(&status);
            client.pause(&status.gid).await.ok();
            client.force_remove(&status.gid).await.ok();
            client.remove_download_result(&status.gid).await.ok();
            let name = sanitize_filename(&filename_from_status(&status));
            cleanup_download_artifacts(&dir, &name, &paths);
        }

        client.purge_download_result().await.ok();
        client.save_session().await.ok();
        self.sweep_orphan_files_in_download_dir();
        Ok(())
    }

    pub async fn add_download(&mut self, req: AddDownloadRequest) -> Result<DownloadItem> {
        self.prune_cancelled_url_blocks();
        if self.is_url_blocked(&req.url) {
            return Err(anyhow!("recently_cancelled"));
        }

        if let Some(existing_id) = self.downloads.iter().find(|d| {
            d.url == req.url
                && matches!(
                    d.status,
                    DownloadStatus::Active | DownloadStatus::Waiting | DownloadStatus::Paused
                )
        }).map(|d| d.id.clone()) {
            if req.force_start {
                self.refresh_aria2_connection().await;
                if self.aria2_connected {
                    if let Some(item) = self.downloads.iter_mut().find(|d| d.id == existing_id) {
                        if req.referer.is_some() {
                            item.referer = req.referer.clone();
                        }
                        if req.cookies.is_some() {
                            item.cookies = req.cookies.clone();
                        }
                        if item.gid.is_none() {
                            self.requeue_download(&existing_id, false, true).await.ok();
                        }
                    }
                }
            }
            return Ok(
                self.downloads
                    .iter()
                    .find(|d| d.id == existing_id)
                    .cloned()
                    .unwrap(),
            );
        }

        std::fs::create_dir_all(&self.settings.download_dir).ok();

        let filename = sanitize_filename(
            &req
                .filename
                .filter(|f| !f.is_empty())
                .unwrap_or_else(|| filename_from_url(&req.url)),
        );

        let id = Uuid::new_v4().to_string();
        let mut item = DownloadItem {
            id: id.clone(),
            gid: None,
            url: req.url.clone(),
            filename,
            status: DownloadStatus::Waiting,
            total_length: 0,
            completed_length: 0,
            download_speed: 0,
            progress_percent: 0.0,
            eta_seconds: 0.0,
            dir: self.settings.download_dir.clone(),
            connections: self.settings.split,
            error_message: None,
            referer: req.referer.clone(),
            cookies: req.cookies.clone(),
            retry_count: 0,
            logs: vec![],
            added_at: Utc::now().to_rfc3339(),
        };
        item.push_log("SYSTEM", "Download added to queue.");
        if is_gofile_page_or_api_url(&req.url) {
            item.push_log(
                "WARNING",
                "URL looks like a gofile page/API link, not the CDN file. Use Download on gofile.io with Auto intercept on.",
            );
        } else if req.url.to_ascii_lowercase().contains("gofile") {
            if req.cookies.as_ref().is_some_and(|c| !c.is_empty()) {
                item.push_log("SYSTEM", "Using browser cookies for Gofile.");
            } else {
                item.push_log(
                    "WARNING",
                    "No Gofile cookies from the browser — log in at gofile.io and reload the extension.",
                );
            }
        }
        if let Some(ref referer) = req.referer {
            if !referer.is_empty() {
                item.push_log("SYSTEM", "Using browser page as Referer.");
            }
        }

        self.downloads.insert(0, item.clone());
        self.selected_id = Some(id.clone());
        self.persist()?;
        self.emit_snapshot();

        let should_start = self.settings.auto_start || req.force_start;
        if should_start {
            match self.requeue_download(&id, false, req.force_start).await {
                Ok(()) => {
                    self.sync_from_aria2().await.ok();
                }
                Err(e) => {
                    if let Some(item) = self.downloads.iter_mut().find(|d| d.id == id) {
                        let msg = format!("Could not start in aria2: {e}");
                        item.error_message = Some(msg.clone());
                        item.push_log("ERROR", msg);
                    }
                    self.persist()?;
                    self.emit_snapshot();
                }
            }
        } else if req.force_start {
            if let Some(item) = self.downloads.iter_mut().find(|d| d.id == id) {
                item.push_log(
                    "SYSTEM",
                    "Waiting for manual start (auto-start is off in Settings).",
                );
            }
        }

        Ok(self
            .downloads
            .iter()
            .find(|d| d.id == id)
            .cloned()
            .unwrap())
    }

    pub async fn pause_download(&mut self, id: &str) -> Result<()> {
        let gid = self
            .downloads
            .iter()
            .find(|d| d.id == id)
            .and_then(|d| d.gid.clone());
        if let Some(gid) = gid {
            self.client().pause(&gid).await?;
        }
        if let Some(item) = self.downloads.iter_mut().find(|d| d.id == id) {
            item.status = DownloadStatus::Paused;
            item.push_log("SYSTEM", "Download paused.");
        }
        self.persist()?;
        self.emit_snapshot();
        Ok(())
    }

    pub async fn resume_download(&mut self, id: &str) -> Result<()> {
        if let Some(item) = self.downloads.iter().find(|d| d.id == id) {
            if item.gid.is_none() {
                return self.requeue_download(id, false, true).await;
            }
        }
        let gid = self
            .downloads
            .iter()
            .find(|d| d.id == id)
            .and_then(|d| d.gid.clone());
        if let Some(gid) = gid {
            self.client().unpause(&gid).await?;
        }
        if let Some(item) = self.downloads.iter_mut().find(|d| d.id == id) {
            item.status = DownloadStatus::Active;
            item.push_log("SYSTEM", "Download resumed.");
        }
        self.persist()?;
        self.emit_snapshot();
        Ok(())
    }

    pub async fn cancel_download(&mut self, id: &str) -> Result<()> {
        let (gid, dir, filename, delete_files, url) = self
            .downloads
            .iter()
            .find(|d| d.id == id)
            .map(|d| {
                let delete_files = d.status != DownloadStatus::Complete;
                (
                    d.gid.clone(),
                    d.dir.clone(),
                    d.filename.clone(),
                    delete_files,
                    d.url.clone(),
                )
            })
            .ok_or_else(|| anyhow!("download not found"))?;

        self.block_url(&url);

        let mut paths_to_delete: Vec<String> = Vec::new();
        if self.aria2_connected {
            let client = self.client();
            if let Some(ref gid) = gid {
                if let Ok(status) = client.tell_status(gid).await {
                    paths_to_delete = paths_from_status(&status);
                }
                client.pause(gid).await.ok();
                tokio::time::sleep(Duration::from_millis(150)).await;
                client.force_remove(gid).await.ok();
                client.remove_download_result(gid).await.ok();
                client.purge_download_result().await.ok();
                client.save_session().await.ok();
            }
        }

        if delete_files {
            cleanup_download_artifacts(&dir, &filename, &paths_to_delete);
        }

        self.downloads.retain(|d| d.id != id);
        if self.selected_id.as_deref() == Some(id) {
            self.selected_id = None;
        }

        self.sweep_orphan_files_in_download_dir();
        self.commit()?;
        Ok(())
    }

    pub async fn retry_download(&mut self, id: &str) -> Result<()> {
        let attempts = self.settings.retry_attempts;
        let current = self
            .downloads
            .iter()
            .find(|d| d.id == id)
            .map(|d| d.retry_count)
            .unwrap_or(0);
        if current >= attempts {
            return Err(anyhow!("maximum retry attempts reached"));
        }
        if let Some(item) = self.downloads.iter_mut().find(|d| d.id == id) {
            item.gid = None;
            item.status = DownloadStatus::Waiting;
            item.error_message = None;
        }
        self.requeue_download(id, true, true).await
    }

    pub async fn remove_download(&mut self, id: &str) -> Result<()> {
        self.cancel_download(id).await
    }

    pub fn select_download(&mut self, id: Option<String>) -> Result<()> {
        self.selected_id = id;
        self.persist()?;
        Ok(())
    }

    pub async fn update_settings(&mut self, settings: AppSettings) -> Result<AppSettings> {
        std::fs::create_dir_all(&settings.download_dir).ok();
        self.settings = settings;
        self.refresh_aria2_connection().await;
        self.apply_global_options().await.ok();
        self.persist()?;
        self.emit_snapshot();
        Ok(self.settings.clone())
    }
}

/// Called from commands after settings save to sync bridge server.
pub async fn sync_bridge_after_settings(
    bridge: &crate::bridge::BridgeHandle,
    state: &SharedState,
    settings: &AppSettings,
) {
    crate::bridge::restart_bridge_async(
        bridge,
        state.clone(),
        settings.bridge_enabled,
        settings.bridge_port,
    )
    .await;
}

fn item_snapshot_key(item: &DownloadItem) -> (DownloadStatus, u64, u64, u64, Option<String>) {
    (
        item.status,
        item.completed_length,
        item.total_length,
        item.download_speed,
        item.error_message.clone(),
    )
}

fn note_stall_if_needed(item: &mut DownloadItem) {
    if item.status != DownloadStatus::Active {
        return;
    }
    if item.total_length == 0 {
        return;
    }
    if item.completed_length > 0 || item.download_speed > 0 {
        return;
    }
    let msg = "Waiting for data from server (large files may take a moment to start).";
    if !item.logs.iter().any(|l| l.message.contains("Waiting for data")) {
        item.push_log("NETWORK", msg);
    }
}

fn apply_aria2_status(item: &mut DownloadItem, status: &Aria2Status) {
    item.gid = Some(status.gid.clone());
    let (completed, total) = lengths_from_status(status);
    item.total_length = total;
    item.completed_length = completed;
    item.download_speed = parse_u64(&status.downloadSpeed);
    if !status.dir.is_empty() {
        item.dir = status.dir.clone();
    }
    item.connections = status.connections.parse().unwrap_or(item.connections);
    item.filename = sanitize_filename(&filename_from_status(status));

    if status.status == "error" {
        let code = status.errorCode.as_deref().unwrap_or("?");
        let detail = status
            .errorMessage
            .as_deref()
            .filter(|m| !m.is_empty())
            .unwrap_or("unknown error");
        let friendly = describe_aria2_error(code, detail);
        item.error_message = Some(friendly.clone());
        let msg = format!("aria2 error {code}: {friendly}");
        if !item.logs.iter().any(|l| l.message == msg) {
            item.push_log("ERROR", msg);
        }
    } else if matches!(status.status.as_str(), "active" | "complete" | "waiting") {
        item.error_message = None;
    }

    item.status = match status.status.as_str() {
        "active" => DownloadStatus::Active,
        "waiting" => DownloadStatus::Waiting,
        "paused" => DownloadStatus::Paused,
        "complete" => DownloadStatus::Complete,
        "error" => DownloadStatus::Error,
        "removed" => DownloadStatus::Removed,
        _ => item.status,
    };

    if item.status == DownloadStatus::Complete {
        if item.total_length == 0 && item.completed_length > 0 {
            item.total_length = item.completed_length;
        }

        if let Some(err) = validate_completed_download(
            &item.url,
            item.total_length,
            item.completed_length,
            &item.dir,
            &item.filename,
        ) {
            item.status = DownloadStatus::Error;
            item.error_message = Some(err.clone());
            if !item.logs.iter().any(|l| l.message == err) {
                item.push_log("ERROR", err);
            }
            cleanup_download_artifacts(&item.dir, &item.filename, &[]);
        }
    }
}

pub type SharedState = Arc<Mutex<AppState>>;
