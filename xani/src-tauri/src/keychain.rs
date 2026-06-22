use keyring::Entry;

/// OS keychain access for the Anthropic API key.
///
/// The key lives in the platform keychain (macOS Keychain / Windows Credential
/// Manager / Linux Secret Service), never in a file or the renderer. The Rust
/// side reads it at startup and hands it to the Node sidecar via env; the
/// renderer can store/check it (but never read it back) via the commands below.
const SERVICE: &str = "xani";
const ACCOUNT: &str = "anthropic_api_key";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

pub fn read_api_key() -> Option<String> {
    entry().ok().and_then(|e| e.get_password().ok())
}

#[tauri::command]
pub fn set_api_key(key: String) -> Result<(), String> {
    entry()?.set_password(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn has_api_key() -> bool {
    read_api_key().map(|k| !k.is_empty()).unwrap_or(false)
}
