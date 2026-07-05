import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { bumpInboxCache, bumpSlackCache } from './connectors.ts';
import { CREDS_FILE, migrateLegacyFiles } from './paths.ts';

/**
 * Credential store for keys entered in the app's Connections screen.
 *
 * Desktop builds keep secrets in the OS keychain (Rust). Outside Tauri the sidecar
 * persists integration credentials to the per-user data directory (see paths.ts —
 * NOT the repo working directory, which a `git` mishap or `rm -rf` could take out)
 * and applies them to process.env immediately — so connecting in the UI takes
 * effect at once. Legacy .xani-creds.json is migrated automatically on first boot.
 * Only known integration keys are accepted. Never touched by the renderer.
 */

const FILE = CREDS_FILE;

/** Exported so tests can assert parity with the Rust keychain's key list.
 *  Provider/toggle keys (ANTHROPIC/GEMINI/CLI) are model config, not integration
 *  creds, so the parity test exempts them. */
export const ALLOW = new Set([
  'ANTHROPIC_API_KEY',
  'GOOGLE_AI_API_KEY',
  'GEMINI_API_KEY',
  'XANI_USE_CLAUDE_CLI', // "1" to run the AI through the logged-in `claude` CLI (no API key)
  'TRELLO_API_KEY',
  'TRELLO_TOKEN',
  'TRELLO_BOARD_ID',
  'ZAPIER_MCP_SERVER_URL',
  'BUFFER_ACCESS_TOKEN',
  'SLACK_AMARGI_BOT_TOKEN',
  'SLACK_AMARGI_USER_TOKEN',
  'SLACK_LEADSTORIES_BOT_TOKEN',
  'SLACK_LEADSTORIES_USER_TOKEN',
  'GITHUB_TOKEN',
  'BRAVE_SEARCH_API_KEY', // web search for the fact-check studio (free tier)
  'GOOGLE_CALENDAR_CLIENT_ID',
  'GOOGLE_CALENDAR_CLIENT_SECRET',
  'GOOGLE_CALENDAR_REFRESH_TOKEN',
  'GOOGLE_DRIVE_CLIENT_ID',
  'GOOGLE_DRIVE_CLIENT_SECRET',
  'GOOGLE_DRIVE_REFRESH_TOKEN',
  'GMAIL_CLIENT_ID_1',
  'GMAIL_CLIENT_SECRET_1',
  'GMAIL_REFRESH_TOKEN_1',
  'GMAIL_CLIENT_ID_2',
  'GMAIL_CLIENT_SECRET_2',
  'GMAIL_REFRESH_TOKEN_2',
  'GMAIL_CLIENT_ID_3',
  'GMAIL_CLIENT_SECRET_3',
  'GMAIL_REFRESH_TOKEN_3',
  'GMAIL_CLIENT_ID_4',
  'GMAIL_CLIENT_SECRET_4',
  'GMAIL_REFRESH_TOKEN_4',
  'GMAIL_CLIENT_ID_5',
  'GMAIL_CLIENT_SECRET_5',
  'GMAIL_REFRESH_TOKEN_5',
]);

let store: Record<string, string> = {};

export function loadCreds(): void {
  try {
    migrateLegacyFiles(); // one-time copy of .xani-*.json from cwd into the data dir
    if (!existsSync(FILE)) return;
    store = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, string>;
    for (const [k, v] of Object.entries(store)) {
      if (ALLOW.has(k) && v) process.env[k] = String(v);
    }
  } catch {
    /* ignore malformed store */
  }
}

export function setCred(name: string, value: string): boolean {
  if (!ALLOW.has(name)) return false;
  if (!value) return clearCred(name); // empty value == disconnect
  store[name] = value;
  process.env[name] = value;
  persist();
  bumpInboxCache(); // a new credential invalidates any cached inbox
  bumpSlackCache();
  return true;
}

/** Remove a credential entirely (disconnect): drop from the store and process.env. */
export function clearCred(name: string): boolean {
  if (!ALLOW.has(name)) return false;
  delete store[name];
  delete process.env[name];
  persist();
  bumpInboxCache();
  bumpSlackCache();
  return true;
}

function persist(): void {
  try {
    writeFileSync(FILE, JSON.stringify(store, null, 2));
  } catch {
    /* in-memory still applied */
  }
}

/** Which known integration keys currently have a value (env or stored). */
export function credStatus(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const k of ALLOW) out[k] = Boolean(process.env[k]);
  return out;
}
