mod aria2;

mod aria2_process;

mod bridge;

mod commands;

mod models;

mod persistence;

mod runtime;

mod state;



use std::sync::Arc;

use std::time::Duration;



use runtime::RuntimePrefs;

use tauri::{

    menu::{Menu, MenuItem},

    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},

    Manager, RunEvent, WindowEvent,

};

use tokio::sync::Mutex;



use aria2_process::Aria2ProcessManager;

use bridge::BridgeHandle;

use persistence::Store;

use crate::models::DownloadStatus;

use state::AppState;



pub type Aria2ManagerHandle = Arc<Mutex<Aria2ProcessManager>>;



fn show_main_window(app: &tauri::AppHandle) {

    if let Some(window) = tauri::Manager::get_webview_window(app, "main") {

        let _ = window.show();

        let _ = window.unminimize();

        let _ = window.set_focus();

    }

}



#[cfg_attr(mobile, tauri::mobile_entry_point)]

pub fn run() {

    let store = Store::new().expect("failed to initialize persistence");

    let data_dir = store.data_dir().to_path_buf();

    let shared: state::SharedState = Arc::new(Mutex::new(

        AppState::new(store).expect("failed to initialize app state"),

    ));

    let aria2_manager: Aria2ManagerHandle = Arc::new(Mutex::new(Aria2ProcessManager::idle()));

    let bridge_handle: BridgeHandle = Arc::new(Mutex::new(None));



    let poll_state = shared.clone();

    tauri::async_runtime::spawn(async move {

        loop {

            let interval = {

                let guard = poll_state.lock().await;

                let has_active = guard.downloads.iter().any(|d| {

                    d.status == DownloadStatus::Active || d.status == DownloadStatus::Waiting

                });

                if has_active {

                    Duration::from_millis(1000)

                } else {

                    Duration::from_millis(2500)

                }

            };

            tokio::time::sleep(interval).await;

            let mut guard = poll_state.lock().await;

            if let Err(e) = guard.sync_from_aria2().await {

                eprintln!("sync error: {e}");

            }

        }

    });



    let setup_aria2 = aria2_manager.clone();

    let setup_state = shared.clone();

    let exit_bridge = bridge_handle.clone();



    tauri::Builder::default()

        .plugin(tauri_plugin_opener::init())

        .manage(shared.clone())

        .manage(aria2_manager.clone())

        .manage(bridge_handle.clone())
        .manage(RuntimePrefs::new(true))
        .on_window_event(|window, event| {

            if let WindowEvent::CloseRequested { api, .. } = event {

                if let Some(prefs) = window.app_handle().try_state::<RuntimePrefs>() {

                    if prefs.should_minimize_to_tray() {

                        let _ = window.hide();

                        api.prevent_close();

                    }

                }

            }

        })

        .setup(move |app| {

            let handle = app.handle().clone();

            let setup_aria2 = setup_aria2.clone();

            let setup_state = setup_state.clone();

            let setup_bridge = bridge_handle.clone();

            let data_dir = data_dir.clone();



            tauri::async_runtime::block_on(async move {

                let settings = {

                    let guard = setup_state.lock().await;

                    guard.settings.clone()

                };



                if let Some(prefs) = app.try_state::<RuntimePrefs>() {
                    prefs.set_minimize_to_tray(settings.minimize_to_tray);
                }



                let show_item =

                    MenuItem::with_id(app, "show", "Show KuroAria DL", true, None::<&str>)

                        .expect("tray menu show");

                let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)

                    .expect("tray menu quit");

                let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])

                    .expect("tray menu");



                if let Some(icon) = app.default_window_icon().cloned() {

                    let app_handle = app.handle().clone();

                    let _tray = TrayIconBuilder::new()

                        .icon(icon)

                        .menu(&tray_menu)

                        .tooltip("KuroAria DL")

                        .show_menu_on_left_click(false)

                        .on_menu_event(move |app, event| match event.id.as_ref() {

                            "show" => show_main_window(app),

                            "quit" => {

                                app.exit(0);

                            }

                            _ => {}

                        })

                        .on_tray_icon_event(move |tray, event| {

                            if let TrayIconEvent::Click {

                                button: MouseButton::Left,

                                button_state: MouseButtonState::Up,

                                ..

                            } = event

                            {

                                show_main_window(tray.app_handle());

                            }

                        })

                        .build(app)

                        .expect("tray icon");

                    let _ = _tray;

                }



                match Aria2ProcessManager::ensure_running(&settings, &data_dir).await {

                    Ok(manager) => {

                        *setup_aria2.lock().await = manager;

                    }

                    Err(e) => {

                        eprintln!("aria2 startup: {e}");

                    }

                }



                let mut guard = setup_state.lock().await;

                guard.set_app(handle);

                if let Err(e) = guard.startup_recovery().await {

                    eprintln!("startup recovery: {e}");

                }



                bridge::restart_bridge_async(

                    &setup_bridge,

                    setup_state.clone(),

                    settings.bridge_enabled,

                    settings.bridge_port,

                )

                .await;

            });

            Ok(())

        })

        .invoke_handler(tauri::generate_handler![

            commands::get_snapshot,

            commands::add_download,

            commands::pause_download,

            commands::resume_download,

            commands::cancel_download,

            commands::retry_download,

            commands::remove_download,

            commands::select_download,

            commands::get_selected_id,

            commands::update_settings,

            commands::pick_download_dir,

            commands::open_download_folder,

            commands::check_aria2_connection,

            commands::show_main_window,

        ])

        .build(tauri::generate_context!())

        .expect("error while building tauri application")

        .run(move |app, event| {

            if let RunEvent::Exit = event {

                let mgr = aria2_manager.clone();

                let bridge = exit_bridge.clone();

                tauri::async_runtime::block_on(async {

                    mgr.lock().await.shutdown().await;

                    bridge::shutdown_bridge(&bridge).await;

                });

            }

            let _ = app;

        });

}

