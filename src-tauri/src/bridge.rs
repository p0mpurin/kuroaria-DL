//! WebSocket bridge for browser extension integration.

use std::net::SocketAddr;
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::json;
use socket2::{Domain, Socket, Type};
use tokio::net::TcpListener;
use tokio::sync::{watch, Mutex};
use tokio_tungstenite::tungstenite::Message;

use crate::models::AddDownloadRequest;
use crate::state::SharedState;

fn default_bridge_force_start() -> bool {
    true
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum BridgeMessage {
    AddDownload {
        url: String,
        filename: Option<String>,
        #[serde(default)]
        referer: Option<String>,
        #[serde(default)]
        cookies: Option<String>,
        #[serde(default = "default_bridge_force_start")]
        force_start: bool,
    },
    Ping,
}

pub(crate) struct BridgeRuntime {
    port: u16,
    shutdown_tx: watch::Sender<bool>,
    task: tokio::task::JoinHandle<()>,
}

impl BridgeRuntime {
    fn start(state: SharedState, port: u16) -> Self {
        let (shutdown_tx, shutdown_rx) = watch::channel(false);

        let task = tokio::spawn(async move {
            if let Err(e) = run_listener(state, port, shutdown_rx).await {
                eprintln!("bridge server failed (port {port}): {e}");
            }
        });

        Self {
            port,
            shutdown_tx,
            task,
        }
    }

    async fn stop(self) {
        let _ = self.shutdown_tx.send(true);
        let _ = self.task.await;
        // Brief pause so Windows releases the port before a rebind.
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
    }
}

fn bind_listener(addr: SocketAddr) -> anyhow::Result<TcpListener> {
    let socket = Socket::new(Domain::IPV4, Type::STREAM, None)?;
    socket.set_reuse_address(true)?;
    socket.bind(&addr.into())?;
    socket.listen(128)?;
    let std_listener: std::net::TcpListener = socket.into();
    std_listener.set_nonblocking(true)?;
    Ok(TcpListener::from_std(std_listener)?)
}

async fn run_listener(
    state: SharedState,
    port: u16,
    mut shutdown: watch::Receiver<bool>,
) -> anyhow::Result<()> {
    let addr: SocketAddr = format!("127.0.0.1:{port}").parse()?;
    let listener = bind_listener(addr)?;
    eprintln!("bridge: listening on ws://127.0.0.1:{port}/");

    loop {
        tokio::select! {
            changed = shutdown.changed() => {
                changed.ok();
                if *shutdown.borrow() {
                    eprintln!("bridge: stopped");
                    break;
                }
            }
            accept = listener.accept() => {
                let (stream, _) = accept?;
                let state = state.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = handle_client(stream, state).await {
                        eprintln!("bridge client: {e}");
                    }
                });
            }
        }
    }
    Ok(())
}

async fn handle_client(
    stream: tokio::net::TcpStream,
    state: SharedState,
) -> anyhow::Result<()> {
    let ws = tokio_tungstenite::accept_async(stream).await?;
    let (mut write, mut read) = ws.split();

    while let Some(msg) = read.next().await {
        let msg = msg?;
        if !msg.is_text() {
            continue;
        }
        let text = msg.to_text()?;
        let reply = match serde_json::from_str::<BridgeMessage>(text) {
            Ok(BridgeMessage::Ping) => {
                eprintln!("bridge: ping");
                json!({ "type": "pong" }).to_string()
            }
            Ok(BridgeMessage::AddDownload {
                url,
                filename,
                referer,
                cookies,
                force_start,
            }) => {
                if !url.starts_with("http://") && !url.starts_with("https://") {
                    json!({ "type": "error", "message": "invalid url" }).to_string()
                } else {
                    let req = AddDownloadRequest {
                        url,
                        filename,
                        referer,
                        cookies,
                        force_start,
                    };
                    match state.lock().await.add_download(req).await {
                        Ok(item) => {
                            eprintln!("bridge: add_download {}", item.id);
                            json!({ "type": "ack", "download_id": item.id }).to_string()
                        }
                        Err(e) => {
                            let msg = e.to_string();
                            if msg.contains("recently_cancelled") {
                                eprintln!("bridge: ignored recently cancelled URL");
                                json!({ "type": "ack", "download_id": "" }).to_string()
                            } else {
                                json!({ "type": "error", "message": msg }).to_string()
                            }
                        }
                    }
                }
            }
            Err(e) => json!({ "type": "error", "message": e.to_string() }).to_string(),
        };
        write.send(Message::Text(reply.into())).await?;
    }
    Ok(())
}

pub type BridgeHandle = Arc<Mutex<Option<BridgeRuntime>>>;

pub async fn shutdown_bridge(handle: &BridgeHandle) {
    let mut guard = handle.lock().await;
    if let Some(runtime) = guard.take() {
        runtime.stop().await;
    }
}

pub async fn restart_bridge_async(
    handle: &BridgeHandle,
    state: SharedState,
    enabled: bool,
    port: u16,
) {
    let mut guard = handle.lock().await;

    if let Some(runtime) = guard.as_ref() {
        if enabled && runtime.port == port && !runtime.task.is_finished() {
            return;
        }
    }

    if let Some(runtime) = guard.take() {
        runtime.stop().await;
    }

    if enabled {
        *guard = Some(BridgeRuntime::start(state, port));
        eprintln!("bridge: started on port {port}");
    } else {
        eprintln!("bridge: disabled");
    }
}
