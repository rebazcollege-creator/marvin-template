mod db;

use db::Db;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app
                .path()
                .app_data_dir()
                .expect("resolve app data dir");
            std::fs::create_dir_all(&dir).ok();
            let conn = rusqlite::Connection::open(dir.join("xani.db"))
                .expect("open xani.db");
            db::init(&conn).expect("init kv table");
            app.manage(Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::kv_all,
            db::kv_get,
            db::kv_set,
            db::kv_remove
        ])
        .run(tauri::generate_context!())
        .expect("error while running Xanî");
}
