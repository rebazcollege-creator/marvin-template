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

/// Integration credentials live in the same keychain, one entry per env-var name.
/// They are injected into the sidecar's environment at spawn (never the renderer).
/// keyring can't enumerate entries, so we read from this known set.
const INTEGRATION_KEYS: &[&str] = &[
    // Model provider config — Settings writes these; missing entries made the
    // desktop Gemini/CLI toggles hang with "Unknown credential key".
    "GOOGLE_AI_API_KEY",
    "GEMINI_API_KEY",
    "XANI_USE_CLAUDE_CLI",
    "TRELLO_API_KEY",
    "TRELLO_TOKEN",
    "TRELLO_BOARD_ID",
    "ZAPIER_MCP_SERVER_URL",
    "BUFFER_ACCESS_TOKEN",
    "SLACK_AMARGI_BOT_TOKEN",
    "SLACK_AMARGI_USER_TOKEN",
    "SLACK_LEADSTORIES_BOT_TOKEN",
    "SLACK_LEADSTORIES_USER_TOKEN",
    "GITHUB_TOKEN",
    "BRAVE_SEARCH_API_KEY",
    "GOOGLE_CALENDAR_CLIENT_ID",
    "GOOGLE_CALENDAR_CLIENT_SECRET",
    "GOOGLE_CALENDAR_REFRESH_TOKEN",
    "GOOGLE_DRIVE_CLIENT_ID",
    "GOOGLE_DRIVE_CLIENT_SECRET",
    "GOOGLE_DRIVE_REFRESH_TOKEN",
    "GMAIL_CLIENT_ID_1",
    "GMAIL_CLIENT_SECRET_1",
    "GMAIL_REFRESH_TOKEN_1",
    "GMAIL_CLIENT_ID_2",
    "GMAIL_CLIENT_SECRET_2",
    "GMAIL_REFRESH_TOKEN_2",
    "GMAIL_CLIENT_ID_3",
    "GMAIL_CLIENT_SECRET_3",
    "GMAIL_REFRESH_TOKEN_3",
    "GMAIL_CLIENT_ID_4",
    "GMAIL_CLIENT_SECRET_4",
    "GMAIL_REFRESH_TOKEN_4",
    "GMAIL_CLIENT_ID_5",
    "GMAIL_CLIENT_SECRET_5",
    "GMAIL_REFRESH_TOKEN_5",
];

fn cred_entry(name: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, name).map_err(|e| e.to_string())
}

/// Store one integration credential (only known env-var names are accepted).
#[tauri::command]
pub fn set_integration_cred(name: String, value: String) -> Result<(), String> {
    if !INTEGRATION_KEYS.contains(&name.as_str()) {
        return Err(format!("Unknown credential key: {name}"));
    }
    cred_entry(&name)?.set_password(&value).map_err(|e| e.to_string())
}

/// Whether a given integration credential is stored.
#[tauri::command]
pub fn has_integration_cred(name: String) -> bool {
    cred_entry(&name)
        .ok()
        .and_then(|e| e.get_password().ok())
        .map(|v| !v.is_empty())
        .unwrap_or(false)
}

/// All stored integration credentials, for env injection at sidecar spawn.
pub fn read_integration_creds() -> Vec<(String, String)> {
    INTEGRATION_KEYS
        .iter()
        .filter_map(|k| {
            cred_entry(k)
                .ok()
                .and_then(|e| e.get_password().ok())
                .filter(|v| !v.is_empty())
                .map(|v| ((*k).to_string(), v))
        })
        .collect()
}
