use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use tokio::process::{Child, Command};
use tokio::time::sleep;

use crate::aria2::Aria2Client;
use crate::models::AppSettings;

pub struct Aria2ProcessManager {
    child: Option<Child>,
    /// True when this app launched the aria2c process (so we stop it on exit).
    spawned_by_app: bool,
}

impl Aria2ProcessManager {
    pub fn idle() -> Self {
        Self {
            child: None,
            spawned_by_app: false,
        }
    }

    /// Connect to an existing aria2 RPC server, or spawn `aria2c` if none is reachable.
    pub async fn ensure_running(settings: &AppSettings, data_dir: &Path) -> Result<Self> {
        let client = Aria2Client::new(
            settings.aria2_rpc_url.clone(),
            settings.aria2_rpc_secret.clone(),
        );

        if client.ping().await.is_ok() {
            eprintln!("aria2: using existing RPC server");
            return Ok(Self::idle());
        }

        let binary = resolve_aria2_binary()?;
        let (listen_host, rpc_port) = parse_rpc_endpoint(&settings.aria2_rpc_url);
        let session_path = data_dir.join("aria2.session");

        std::fs::create_dir_all(&settings.download_dir).ok();
        std::fs::create_dir_all(data_dir).ok();

        let mut cmd = Command::new(&binary);
        cmd.arg("--enable-rpc")
            .arg("--rpc-listen-all=false")
            .arg("--rpc-allow-origin-all")
            .arg(format!("--rpc-listen-port={rpc_port}"))
            .arg(format!("--dir={}", settings.download_dir))
            .arg("--continue=true")
            .arg(format!(
                "--max-concurrent-downloads={}",
                settings.max_concurrent
            ))
            .arg(format!("--split={}", settings.split))
            .arg("--min-split-size=1M")
            .arg(format!(
                "--file-allocation={}",
                crate::aria2::FILE_ALLOCATION_NONE
            ))
            .arg(format!("--save-session={}", session_path.display()))
            .arg("--save-session-interval=30")
            .arg("--auto-save-interval=30")
            .arg("--max-download-result=32");

        if !settings.aria2_rpc_secret.is_empty() {
            cmd.arg(format!("--rpc-secret={}", settings.aria2_rpc_secret));
        }

        if session_path.exists() {
            cmd.arg(format!("--input-file={}", session_path.display()));
        }

        let dl_limit = format_speed_limit(settings.max_download_speed);
        let ul_limit = format_speed_limit(settings.max_upload_speed);
        cmd.arg(format!("--max-download-limit={dl_limit}"))
            .arg(format!("--max-upload-limit={ul_limit}"));

        let _ = listen_host;

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        cmd.stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());

        let child = cmd
            .spawn()
            .with_context(|| format!("failed to start aria2 ({})", binary.display()))?;

        eprintln!(
            "aria2: started {} (RPC port {rpc_port})",
            binary.display()
        );

        wait_for_rpc(&client, &settings.aria2_rpc_url, 20, Duration::from_millis(250))
            .await?;

        Ok(Self {
            child: Some(child),
            spawned_by_app: true,
        })
    }

    pub async fn shutdown(&mut self) {
        if !self.spawned_by_app {
            return;
        }
        if let Some(mut child) = self.child.take() {
            eprintln!("aria2: stopping bundled process");
            child.kill().await.ok();
            let _ = child.wait().await;
        }
        self.spawned_by_app = false;
    }
}

impl Drop for Aria2ProcessManager {
    fn drop(&mut self) {
        if self.spawned_by_app {
            if let Some(mut child) = self.child.take() {
                let _ = child.start_kill();
            }
        }
    }
}

async fn wait_for_rpc(
    client: &Aria2Client,
    rpc_url: &str,
    attempts: u32,
    delay: Duration,
) -> Result<()> {
    for i in 0..attempts {
        if client.ping().await.is_ok() {
            return Ok(());
        }
        sleep(delay).await;
        if i + 1 == attempts {
            break;
        }
    }
    let (_, port) = parse_rpc_endpoint(rpc_url);
    Err(anyhow!(
        "aria2 did not become ready. Check that port {port} is free."
    ))
}

fn format_speed_limit(kb_per_sec: u32) -> String {
    if kb_per_sec == 0 {
        "0".into()
    } else {
        format!("{}K", kb_per_sec)
    }
}

fn parse_rpc_endpoint(rpc_url: &str) -> (String, u16) {
    url::Url::parse(rpc_url)
        .ok()
        .map(|u| {
            let host = u.host_str().unwrap_or("127.0.0.1").to_string();
            let port = u.port().unwrap_or(6800);
            (host, port)
        })
        .unwrap_or(("127.0.0.1".into(), 6800))
}

fn resolve_aria2_binary() -> Result<PathBuf> {
    let names: &[&str] = if cfg!(windows) {
        &["aria2c.exe", "aria2c"]
    } else {
        &["aria2c"]
    };

    for name in names {
        if let Ok(path) = which_binary(name) {
            return Ok(path);
        }
    }

    #[cfg(windows)]
    {
        let program_files = std::env::var_os("ProgramFiles")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(r"C:\Program Files"));
        for sub in ["aria2", "Aria2", "aria2c"] {
            let candidate = program_files.join(sub).join("aria2c.exe");
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }

    Err(anyhow!(
        "aria2c was not found in PATH. Install aria2 and ensure `aria2c` is available."
    ))
}

fn which_binary(name: &str) -> Result<PathBuf> {
    #[cfg(windows)]
    {
        let output = std::process::Command::new("where")
            .arg(name)
            .output()
            .context("run where")?;
        if output.status.success() {
            let line = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_string();
            if !line.is_empty() {
                return Ok(PathBuf::from(line));
            }
        }
    }

    #[cfg(not(windows))]
    {
        let output = std::process::Command::new("which")
            .arg(name)
            .output()
            .context("run which")?;
        if output.status.success() {
            let line = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !line.is_empty() {
                return Ok(PathBuf::from(line));
            }
        }
    }

    // Fallback: rely on PATH resolution at spawn time.
    let status = std::process::Command::new(name)
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status();
    if status.map(|s| s.success()).unwrap_or(false) {
        return Ok(PathBuf::from(name));
    }

    Err(anyhow!("not found"))
}
