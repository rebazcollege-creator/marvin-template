mod db;
mod keychain;

use db::Db;
use std::sync::Mutex;
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

/// Handle to the spawned sidecar so we can stop it on app exit.
struct SidecarProcess(Mutex<Option<CommandChild>>);

/// Launch the bundled, self-contained sidecar binary (compiled from sidecar/ by
/// `npm run sidecar:build`, declared as `externalBin` in tauri.conf.json) with
/// the API key from the keychain in its environment. No Node or node_modules
/// required at runtime; the key never reaches the renderer or disk in plaintext.
fn spawn_sidecar(app: &tauri::App) -> Option<CommandChild> {
    let mut cmd = match app.shell().sidecar("xani-sidecar") {
        Ok(c) => c.env("MARVIN_SIDECAR_PORT", "8787"),
        Err(err) => {
            eprintln!("Sidecar binary not found (run `npm run sidecar:build`): {err}");
            return None;
        }
    };
    if let Some(key) = keychain::read_api_key() {
        cmd = cmd.env("ANTHROPIC_API_KEY", key);
    }
    match cmd.spawn() {
        Ok((_rx, child)) => Some(child),
        Err(err) => {
            eprintln!("Failed to spawn MARVIN sidecar: {err}");
            None
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // SQLite (Phase 4 persistence).
            let dir = app.path().app_data_dir().expect("resolve app data dir");
            std::fs::create_dir_all(&dir).ok();
            let conn = rusqlite::Connection::open(dir.join("xani.db")).expect("open xani.db");
            db::init(&conn).expect("init kv table");
            app.manage(Db(Mutex::new(conn)));

            // Agent runtime sidecar (self-contained binary).
            app.manage(SidecarProcess(Mutex::new(spawn_sidecar(app))));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::kv_all,
            db::kv_get,
            db::kv_set,
            db::kv_remove,
            keychain::set_api_key,
            keychain::has_api_key
        ])
        .build(tauri::generate_context!())
        .expect("error while building Xanî");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<SidecarProcess>() {
                if let Ok(mut guard) = state.0.lock() {
                    if let Some(child) = guard.take() {
                        let _ = child.kill();
                    }
                }
            }
        }
    });
}
