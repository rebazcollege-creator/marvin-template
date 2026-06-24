import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Dev-side credential store for keys entered in the app's Connections screen.
 *
 * Desktop builds keep secrets in the OS keychain (Rust). In dev there is no
 * keychain, so the sidecar persists integration credentials to a gitignored file
 * next to the app and applies them to process.env immediately — so connecting in
 * the UI takes effect at once (live reads + actions), no manual .env editing or
 * restart. Only known integration keys are accepted. Never touched by the renderer.
 */

const FILE = join(process.cwd(), '.xani-creds.json');

const ALLOW = new Set([
  'TRELLO_API_KEY',
  'TRELLO_TOKEN',
  'TRELLO_BOARD_ID',
  'ZAPIER_MCP_SERVER_URL',
  'BUFFER_ACCESS_TOKEN',
  'SLACK_AMARGI_BOT_TOKEN',
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
  store[name] = value;
  process.env[name] = value;
  try {
    writeFileSync(FILE, JSON.stringify(store, null, 2));
  } catch {
    /* in-memory still applied */
  }
  return true;
}

/** Which known integration keys currently have a value (env or stored). */
export function credStatus(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const k of ALLOW) out[k] = Boolean(process.env[k]);
  return out;
}
