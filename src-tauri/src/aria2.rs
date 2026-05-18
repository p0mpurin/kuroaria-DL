use anyhow::{anyhow, Context, Result};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Clone)]
pub struct Aria2Client {
    rpc_url: String,
    secret: String,
    client: reqwest::Client,
    id_counter: std::sync::Arc<std::sync::atomic::AtomicU64>,
}

#[derive(Debug, Deserialize)]
pub struct Aria2Status {
    pub gid: String,
    pub status: String,
    #[serde(default)]
    pub totalLength: String,
    #[serde(default)]
    pub completedLength: String,
    #[serde(default)]
    pub downloadSpeed: String,
    #[serde(default)]
    pub dir: String,
    #[serde(default)]
    pub files: Vec<Aria2File>,
    #[serde(default)]
    pub connections: String,
    #[serde(default)]
    pub errorMessage: Option<String>,
    #[serde(default)]
    pub errorCode: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct Aria2File {
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub length: String,
    #[serde(default)]
    pub completedLength: String,
    #[serde(default)]
    pub uris: Vec<Aria2Uri>,
}

#[derive(Debug, Deserialize)]
pub struct Aria2Uri {
    pub uri: String,
}

impl Aria2Client {
    pub fn new(rpc_url: String, secret: String) -> Self {
        Self {
            rpc_url,
            secret,
            client: reqwest::Client::new(),
            id_counter: std::sync::Arc::new(std::sync::atomic::AtomicU64::new(1)),
        }
    }

    fn next_id(&self) -> u64 {
        self.id_counter
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
    }

    async fn call(&self, method: &str, params: Vec<Value>) -> Result<Value> {
        let mut rpc_params: Vec<Value> = Vec::new();
        if !self.secret.is_empty() {
            rpc_params.push(json!(format!("token:{}", self.secret)));
        }
        rpc_params.extend(params);

        let body = json!({
            "jsonrpc": "2.0",
            "id": self.next_id().to_string(),
            "method": method,
            "params": rpc_params,
        });

        let resp = self
            .client
            .post(&self.rpc_url)
            .json(&body)
            .send()
            .await
            .context("aria2 RPC request failed")?;

        let payload: Value = resp.json().await.context("invalid aria2 RPC response")?;
        if let Some(err) = payload.get("error") {
            return Err(anyhow!("aria2 error: {}", err));
        }
        payload
            .get("result")
            .cloned()
            .ok_or_else(|| anyhow!("aria2 response missing result"))
    }

    pub async fn ping(&self) -> Result<()> {
        let _ = self.get_version().await?;
        Ok(())
    }

    pub async fn get_version(&self) -> Result<String> {
        let result = self.call("aria2.getVersion", vec![]).await?;
        Ok(result
            .get("version")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown")
            .to_string())
    }

    pub async fn add_uri(
        &self,
        uris: Vec<String>,
        dir: &str,
        out: Option<&str>,
        split: u32,
        paused: bool,
        referer: Option<&str>,
        cookies: Option<&str>,
        max_download_speed_kbps: u32,
    ) -> Result<String> {
        let url = uris.first().map(String::as_str).unwrap_or("");
        let mut options = build_download_options(
            dir,
            out,
            split,
            url,
            referer,
            cookies,
            max_download_speed_kbps,
        );
        if paused {
            options["pause"] = json!("true");
        }

        let result = self
            .call(
                "aria2.addUri",
                vec![json!(uris), options],
            )
            .await?;
        result
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| anyhow!("addUri did not return gid"))
    }

    pub async fn tell_status(&self, gid: &str) -> Result<Aria2Status> {
        let result = self
            .call("aria2.tellStatus", vec![json!(gid)])
            .await?;
        serde_json::from_value(result).context("parse tellStatus")
    }

    pub async fn tell_active(&self) -> Result<Vec<Aria2Status>> {
        self.tell_list("aria2.tellActive").await
    }

    pub async fn tell_paused(&self, offset: u32, num: u32) -> Result<Vec<Aria2Status>> {
        let result = self
            .call("aria2.tellPaused", vec![json!(offset), json!(num)])
            .await?;
        serde_json::from_value(result).context("parse tellPaused")
    }

    pub async fn tell_waiting(&self, offset: u32, num: u32) -> Result<Vec<Aria2Status>> {
        let result = self
            .call("aria2.tellWaiting", vec![json!(offset), json!(num)])
            .await?;
        serde_json::from_value(result).context("parse tellWaiting")
    }

    pub async fn tell_stopped(&self, offset: u32, num: u32) -> Result<Vec<Aria2Status>> {
        let result = self
            .call("aria2.tellStopped", vec![json!(offset), json!(num)])
            .await?;
        serde_json::from_value(result).context("parse tellStopped")
    }

    async fn tell_list(&self, method: &str) -> Result<Vec<Aria2Status>> {
        let result = self.call(method, vec![]).await?;
        serde_json::from_value(result).context("parse list")
    }

    pub async fn pause(&self, gid: &str) -> Result<()> {
        let _ = self.call("aria2.pause", vec![json!(gid)]).await?;
        Ok(())
    }

    pub async fn unpause(&self, gid: &str) -> Result<()> {
        let _ = self.call("aria2.unpause", vec![json!(gid)]).await?;
        Ok(())
    }

    pub async fn remove(&self, gid: &str) -> Result<()> {
        let _ = self.call("aria2.remove", vec![json!(gid)]).await?;
        Ok(())
    }

    pub async fn force_remove(&self, gid: &str) -> Result<()> {
        let _ = self.call("aria2.forceRemove", vec![json!(gid)]).await?;
        Ok(())
    }

    /// Frees memory held by finished / removed downloads inside aria2.
    pub async fn purge_download_result(&self) -> Result<()> {
        let _ = self.call("aria2.purgeDownloadResult", vec![]).await?;
        Ok(())
    }

    pub async fn remove_download_result(&self, gid: &str) -> Result<()> {
        let _ = self
            .call("aria2.removeDownloadResult", vec![json!(gid)])
            .await?;
        Ok(())
    }

    pub async fn save_session(&self) -> Result<()> {
        let _ = self.call("aria2.saveSession", vec![]).await?;
        Ok(())
    }

    pub async fn change_global_option(&self, options: serde_json::Map<String, Value>) -> Result<()> {
        let _ = self
            .call("aria2.changeGlobalOption", vec![json!(options)])
            .await?;
        Ok(())
    }
}

pub fn parse_u64(s: &str) -> u64 {
    s.parse().unwrap_or(0)
}

/// Avoid aria2 pre-allocating huge files on disk (shows 0 B progress for a long time).
pub const FILE_ALLOCATION_NONE: &str = "none";

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/// Signed / tunnel / CDN links need Referer handling and longer timeouts.
fn is_signed_cdn_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.contains("sig=")
        || lower.contains("token=")
        || lower.contains("dlproxy")
        || lower.contains("tunnel")
        || url.len() > 400
}

pub fn format_speed_limit_kbps(kb_per_sec: u32) -> String {
    if kb_per_sec == 0 {
        "0".into()
    } else {
        format!("{}K", kb_per_sec)
    }
}

fn is_gofile_host(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.contains("gofile.io") || lower.contains("gofile.com")
}

fn referer_for_url(url: &str) -> String {
    url::Url::parse(url)
        .ok()
        .map(|u| {
            let host = u.host_str().unwrap_or("");
            format!("{}://{}/", u.scheme(), host)
        })
        .unwrap_or_else(|| url.to_string())
}

fn resolve_referer(url: &str, signed_cdn: bool, referer: Option<&str>) -> String {
    if let Some(r) = referer.filter(|r| !r.is_empty()) {
        return r.to_string();
    }
    if is_gofile_host(url) {
        return "https://gofile.io/".into();
    }
    if signed_cdn {
        // Signed CDN links often accept the download URL itself as Referer.
        return url.to_string();
    }
    referer_for_url(url)
}

pub fn build_download_options(
    dir: &str,
    out: Option<&str>,
    split: u32,
    url: &str,
    referer: Option<&str>,
    cookies: Option<&str>,
    max_download_speed_kbps: u32,
) -> serde_json::Value {
    let signed_cdn = is_signed_cdn_url(url);
    // Parallel range requests (like the browser). Up to 16 connections per download.
    let effective_split = split.max(1).min(16);
    let max_conn = effective_split;
    let referer_value = resolve_referer(url, signed_cdn, referer);

    let mut headers = vec![
        "Accept: */*".to_string(),
        "Accept-Language: en-US,en;q=0.9".to_string(),
        "Accept-Encoding: identity".to_string(),
    ];
    if let Some(cookie) = cookies.filter(|c| !c.is_empty()) {
        headers.push(format!("Cookie: {cookie}"));
    }

    let mut options = json!({
        "dir": dir,
        "split": effective_split.to_string(),
        "min-split-size": "1M",
        "continue": "true",
        "max-connection-per-server": max_conn.to_string(),
        "file-allocation": FILE_ALLOCATION_NONE,
        "user-agent": USER_AGENT,
        "referer": referer_value,
        "header": headers,
        "max-tries": "10",
        "retry-wait": "5",
        "connect-timeout": "120",
        "max-redirect": "10",
        "allow-overwrite": "true",
        "max-download-limit": format_speed_limit_kbps(max_download_speed_kbps),
    });

    if signed_cdn {
        // aria2 rejects timeout=0 on Windows; use a long per-read timeout for huge CDN files.
        options["timeout"] = json!("600");
    } else {
        options["timeout"] = json!("120");
    }

    if let Some(name) = out.filter(|n| !n.is_empty()) {
        options["out"] = json!(name);
    }

    options
}

/// Prefer per-file byte counts when the top-level fields are empty.
pub fn lengths_from_status(status: &Aria2Status) -> (u64, u64) {
    let mut total = parse_u64(&status.totalLength);
    let mut completed = parse_u64(&status.completedLength);

    if !status.files.is_empty() {
        let files_total: u64 = status.files.iter().map(|f| parse_u64(&f.length)).sum();
        let files_done: u64 = status
            .files
            .iter()
            .map(|f| parse_u64(&f.completedLength))
            .sum();
        if files_total > total {
            total = files_total;
        }
        if files_done > completed {
            completed = files_done;
        }
    }

    (completed, total)
}

/// True when the URL is a gofile folder/page link, not a CDN download link.
pub fn is_gofile_page_or_api_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    if lower.contains("api.gofile.io") {
        return !lower.contains("/download/");
    }
    if lower.contains("gofile.io") || lower.contains("gofile.com") {
        return lower.contains("/d/")
            || lower.contains("/dist/")
            || lower.contains("/contents/")
            || !lower.contains("download");
    }
    false
}

fn sniff_is_html_or_json(path: &std::path::Path) -> bool {
    use std::io::Read;
    let Ok(mut file) = std::fs::File::open(path) else {
        return false;
    };
    let mut buf = [0u8; 512];
    let Ok(n) = file.read(&mut buf) else {
        return false;
    };
    if n == 0 {
        return false;
    }
    let s = &buf[..n];
    s.starts_with(b"<!DOCTYPE")
        || s.starts_with(b"<!doctype")
        || s.starts_with(b"<html")
        || s.starts_with(b"<HTML")
        || s.starts_with(b"{")
        || s.starts_with(b"[")
        || s.windows(6).any(|w| w.eq_ignore_ascii_case(b"<head>"))
}

fn has_suspicious_download_extension(filename: &str) -> bool {
    let lower = filename.to_ascii_lowercase();
    lower.ends_with(".html")
        || lower.ends_with(".htm")
        || lower.ends_with(".json")
        || lower.ends_with(".php")
        || lower.ends_with(".xml")
}

/// Reject "complete" downloads that are really HTML/JSON error pages (common on gofile).
pub fn validate_completed_download(
    url: &str,
    total: u64,
    completed: u64,
    dir: &str,
    filename: &str,
) -> Option<String> {
    let safe = sanitize_filename(filename);
    let path = std::path::Path::new(dir).join(&safe);
    let disk_size = std::fs::metadata(&path).ok().map(|m| m.len()).unwrap_or(0);
    let size = disk_size.max(completed).max(total);

    if size == 0 {
        return Some(
            "Download finished with no data. Check that the URL is a direct file link."
                .into(),
        );
    }

    if path.is_file() && sniff_is_html_or_json(&path) {
        return Some(
            "Downloaded a web or API response instead of the real file. For Gofile: stay logged in at gofile.io, reload the extension (v0.1.5+), enable Auto intercept, click Download once — the extension waits for the real file size, then hands off with your cookies."
                .into(),
        );
    }

    if has_suspicious_download_extension(&safe) {
        return Some(
            "Saved file type looks like a web page, not your download. Use the direct file URL."
                .into(),
        );
    }

    if is_gofile_page_or_api_url(url) && size < 10 * 1024 * 1024 {
        return Some(format!(
            "Gofile download is only {} — likely the page/API response, not your file. Intercept after Firefox shows the full size, or use the direct download link from the download button.",
            format_bytes_human(size)
        ));
    }

    // Hosters that returned a tiny "complete" payload (wrong URL or auth wall).
    let lower = url.to_ascii_lowercase();
    if size < 1024 * 1024
        && (lower.contains("gofile")
            || lower.contains("workupload")
            || lower.contains("mediafire")
            || lower.contains("mega.nz"))
    {
        return Some(
            "Download is far too small for this host — the link may not be a direct file URL."
                .into(),
        );
    }

    None
}

fn format_bytes_human(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{bytes} B")
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    }
}

pub fn filename_from_status(status: &Aria2Status) -> String {
    if let Some(file) = status.files.first() {
        if !file.path.is_empty() {
            return std::path::Path::new(&file.path)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| file.path.clone());
        }
        if let Some(uri) = file.uris.first() {
            return filename_from_url(&uri.uri);
        }
    }
    "download".into()
}

/// Strip paths Firefox may send (e.g. `C:\Users\...\file.zip`) so aria2 only gets a basename.
pub fn sanitize_filename(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return "download".into();
    }

    let base = std::path::Path::new(trimmed)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| trimmed.to_string());

    let cleaned: String = base
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();

    if cleaned.is_empty() || cleaned == "." || cleaned == ".." {
        "download".into()
    } else {
        cleaned
    }
}

pub fn filename_from_url(url: &str) -> String {
    let raw = url::Url::parse(url)
        .ok()
        .map(|u| u.path().to_string())
        .and_then(|path| {
            path.rsplit('/')
                .find(|s| !s.is_empty())
                .map(|s| s.to_string())
        })
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "download".into());
    sanitize_filename(&raw)
}

/// Collect on-disk paths aria2 is using for a job (includes split segment files).
pub fn paths_from_status(status: &Aria2Status) -> Vec<String> {
    let mut paths = Vec::new();
    for file in &status.files {
        if !file.path.is_empty() {
            paths.push(file.path.clone());
        }
    }
    paths
}

/// Remove partial download data, segment files, and `.aria2` control files.
pub fn cleanup_download_artifacts(dir: &str, filename: &str, extra_paths: &[String]) {
    let safe = sanitize_filename(filename);
    if !safe.is_empty() {
        cleanup_download_files_by_basename(dir, &safe);
    }

    for path in extra_paths {
        let p = std::path::Path::new(path);
        if p.is_file() {
            std::fs::remove_file(p).ok();
        }
        if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
            if p.parent().map(|d| d == std::path::Path::new(dir)).unwrap_or(false) {
                cleanup_download_files_by_basename(dir, name);
            }
        }
        std::fs::remove_file(format!("{}.aria2", path)).ok();
    }
}

fn cleanup_download_files_by_basename(dir: &str, safe: &str) {
    let dir_path = std::path::Path::new(dir);
    let main = dir_path.join(safe);
    std::fs::remove_file(&main).ok();
    std::fs::remove_file(dir_path.join(format!("{safe}.aria2"))).ok();

    if let Ok(entries) = std::fs::read_dir(dir_path) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let is_match = name == safe
                || name.starts_with(&format!("{safe}."))
                || (name.starts_with(safe) && name.ends_with(".aria2"));
            if is_match && entry.path().is_file() {
                std::fs::remove_file(entry.path()).ok();
            }
        }
    }
}

/// Delete `.aria2` control files (and tiny orphan stubs) not tied to active downloads.
pub fn cleanup_orphan_aria2_control_files(
    dir: &str,
    keep_basenames: &std::collections::HashSet<String>,
) {
    let dir_path = std::path::Path::new(dir);
    let Ok(entries) = std::fs::read_dir(dir_path) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();

        if name.ends_with(".aria2") {
            let stem = name.trim_end_matches(".aria2");
            if !keep_basenames.contains(stem) {
                std::fs::remove_file(&path).ok();
                let data_file = dir_path.join(stem);
                if data_file.is_file() {
                    if let Ok(meta) = data_file.metadata() {
                        if meta.len() < 5 * 1024 * 1024 {
                            std::fs::remove_file(data_file).ok();
                        }
                    }
                }
            }
            continue;
        }

        // Tiny extensionless stubs from aborted multi-segment jobs.
        if !name.contains('.') && !keep_basenames.contains(&name) {
            if let Ok(meta) = path.metadata() {
                if meta.len() < 5 * 1024 * 1024 {
                    std::fs::remove_file(&path).ok();
                }
            }
        }
    }
}

pub fn describe_aria2_error(code: &str, fallback: &str) -> String {
    let hint = match code {
        "9" => "Not enough disk space for this file.",
        "13" | "18" => {
            "Could not write the file (check folder permissions and that the name is valid)."
        }
        "15" | "16" | "17" => "Could not open or create the output file on disk.",
        "22" | "24" => "The server rejected the request (expired link or bad headers).",
        "5" => "Download too slow for the configured speed limit.",
        _ => fallback,
    };
    if fallback.is_empty() {
        hint.into()
    } else {
        format!("{hint} ({fallback})")
    }
}
