mod db;
mod keychain;

use db::Db;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, RunEvent};

/// Handle to the spawned Node sidecar so we can stop it on app exit.
struct SidecarProcess(Mutex<Option<Child>>);

/// Launch the Node sidecar (the agent runtime) with the API key from the
/// keychain in its environment. The key therefore never touches the renderer or
/// disk in plaintext.
///
/// Dev (`tauri dev`) finds the sidecar next to the project; a packaged build
/// finds it under the app resource dir (it must be added to bundle resources,
/// and Node must be available — compiling the sidecar to a standalone binary is
/// the production hardening step).
fn spawn_sidecar(app: &tauri::App) -> Option<Child> {
    let resource = app.path().resource_dir().ok().map(|d| d.join("sidecar/server.ts"));
    let cwd = std::env::current_dir().ok();
    let candidates = [
        resource,
        cwd.as_ref().map(|d| d.join("../sidecar/server.ts")),
        cwd.as_ref().map(|d| d.join("sidecar/server.ts")),
    ];
    let script = candidates.into_iter().flatten().find(|p| p.exists())?;

    let mut cmd = Command::new("node");
    cmd.arg(&script)
        .env("MARVIN_SIDECAR_PORT", "8787");
    if let Some(key) = keychain::read_api_key() {
        cmd.env("ANTHROPIC_API_KEY", key);
    }
    match cmd.spawn() {
        Ok(child) => Some(child),
        Err(err) => {
            eprintln!("Failed to spawn MARVIN sidecar: {err}");
            None
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            // SQLite (Phase 4 persistence).
            let dir = app.path().app_data_dir().expect("resolve app data dir");
            std::fs::create_dir_all(&dir).ok();
            let conn = rusqlite::Connection::open(dir.join("xani.db")).expect("open xani.db");
            db::init(&conn).expect("init kv table");
            app.manage(Db(Mutex::new(conn)));

            // Agent runtime sidecar.
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
                    if let Some(mut child) = guard.take() {
                        let _ = child.kill();
                    }
                }
            }
        }
    });
}
