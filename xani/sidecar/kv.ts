import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { KV_FILE } from './paths.ts';

/**
 * Sidecar-owned key/value store — the renderer's persistence backend when the app
 * runs in a browser (dev or service mode). This is what gets MARVIN's brain
 * (memories, settings, open loops, chats — every `xani.*` key) OUT of the
 * browser's localStorage, where a single "Clear site data" wiped it.
 *
 * File-backed JSON with debounced atomic writes: plenty at single-user scale, no
 * dependencies, trivially backup-able (the nightly scheduler snapshots this file).
 * Under Tauri the renderer keeps using the Rust SQLite kv instead — same contract.
 */

const MAX_VALUE_BYTES = 1_000_000; // 1MB per key — far above any real xani.* payload
const MAX_KEYS = 5_000;

let store: Record<string, string> | null = null;
let persistTimer: NodeJS.Timeout | null = null;

function load(): Record<string, string> {
  if (store) return store;
  try {
    store = existsSync(KV_FILE) ? (JSON.parse(readFileSync(KV_FILE, 'utf8')) as Record<string, string>) : {};
  } catch {
    store = {}; // a corrupt file must not brick the app; nightly backups hold history
  }
  return store;
}

/** Debounced atomic persist (tmp + rename), owner-only file mode. */
function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const tmp = `${KV_FILE}.tmp`;
      writeFileSync(tmp, JSON.stringify(store ?? {}), { mode: 0o600 });
      renameSync(tmp, KV_FILE);
    } catch (e) {
      console.error('[kv] persist failed:', (e as Error).message);
    }
  }, 400);
}

/** Only renderer namespace keys are accepted — a foreign caller can't plant arbitrary keys. */
export function kvAcceptableKey(key: unknown): key is string {
  return typeof key === 'string' && key.startsWith('xani.') && key.length < 256;
}

export function kvAll(): Record<string, string> {
  return { ...load() };
}

export function kvSet(key: string, value: string): boolean {
  if (!kvAcceptableKey(key) || typeof value !== 'string' || value.length > MAX_VALUE_BYTES) return false;
  const s = load();
  if (!(key in s) && Object.keys(s).length >= MAX_KEYS) return false;
  s[key] = value;
  schedulePersist();
  return true;
}

export function kvRemove(key: string): boolean {
  if (!kvAcceptableKey(key)) return false;
  delete load()[key];
  schedulePersist();
  return true;
}

/** Bulk import (localStorage → sidecar migration). Returns how many keys were accepted. */
export function kvImport(entries: Record<string, unknown>): number {
  let n = 0;
  for (const [k, v] of Object.entries(entries ?? {})) {
    if (typeof v === 'string' && kvSet(k, v)) n++;
  }
  return n;
}

/** Flush any pending debounce now (used by the nightly backup for a consistent snapshot). */
export function kvFlush(): void {
  if (!persistTimer) return;
  clearTimeout(persistTimer);
  persistTimer = null;
  try {
    const tmp = `${KV_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(store ?? {}), { mode: 0o600 });
    renameSync(tmp, KV_FILE);
  } catch (e) {
    console.error('[kv] flush failed:', (e as Error).message);
  }
}
