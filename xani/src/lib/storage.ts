/**
 * Storage adapter — Phase 4.
 *
 * Persistence now lives in SQLite owned by the Rust side (rusqlite, kv table)
 * and is reached via Tauri commands (kv_all/kv_get/kv_set/kv_remove). When NOT
 * running under Tauri (plain `next dev` in a browser) it falls back to
 * localStorage so development needs no backend.
 *
 * To avoid turning every getSettings()/getMemories() call site async, we use a
 * CACHE-HYDRATE model: `ensureStorageReady()` loads all `xani.*` keys into an
 * in-memory cache once at startup; reads are then synchronous against the cache
 * and writes update the cache synchronously while persisting in the background.
 * Components call `ensureStorageReady()` in their mount effect before reading.
 */

let cache: Map<string, string> | null = null;
let readyPromise: Promise<void> | null = null;

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

async function backendLoadAll(): Promise<[string, string][]> {
  if (isTauri()) {
    return await tauriInvoke<[string, string][]>('kv_all');
  }
  const out: [string, string][] = [];
  if (typeof window !== 'undefined') {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('xani.')) {
        const v = window.localStorage.getItem(k);
        if (v !== null) out.push([k, v]);
      }
    }
  }
  return out;
}

async function backendSet(key: string, value: string): Promise<void> {
  if (isTauri()) return tauriInvoke('kv_set', { key, value });
  if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
}

async function backendRemove(key: string): Promise<void> {
  if (isTauri()) return tauriInvoke('kv_remove', { key });
  if (typeof window !== 'undefined') window.localStorage.removeItem(key);
}

/** Hydrate the in-memory cache from the backend. Idempotent. */
export function ensureStorageReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = backendLoadAll()
      .then((entries) => {
        cache = new Map(entries);
      })
      .catch(() => {
        cache = new Map();
      });
  }
  return readyPromise;
}

export function readJson<T>(key: string, fallback: T): T {
  // Before hydration in a plain browser, read localStorage directly so first
  // paint isn't empty; under Tauri, callers await ensureStorageReady() first.
  if (!cache) {
    if (typeof window !== 'undefined' && !isTauri()) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }
  const raw = cache.get(key);
  if (raw === undefined) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson<T>(key: string, value: T): void {
  const raw = JSON.stringify(value);
  if (cache) cache.set(key, raw);
  // A failed persist must not be silent: the in-memory cache still holds the value,
  // but it would vanish on restart — surface it so the UI/user can react.
  backendSet(key, raw).catch((e) => {
    console.error(`[storage] failed to persist ${key}:`, e);
    try {
      window.dispatchEvent(new CustomEvent('xani:storage-error', { detail: { key } }));
    } catch {
      /* no window */
    }
  });
}

export function removeKey(key: string): void {
  if (cache) cache.delete(key);
  void backendRemove(key);
}

/**
 * Snapshot of everything Xanî knows (settings, memories, loops, approvals, voice,
 * chats — every `xani.*` key) for a user-held backup file. Reads from the live
 * backend, not just the cache, so it captures the persisted truth.
 */
export async function exportAll(): Promise<Record<string, string>> {
  await ensureStorageReady();
  const entries = await backendLoadAll();
  return Object.fromEntries(entries.filter(([k]) => k.startsWith('xani.')));
}

/**
 * Restore a backup produced by exportAll(). Only `xani.*` keys are accepted (a
 * foreign/corrupt file can't plant arbitrary keys). Existing keys are overwritten;
 * returns the number of keys restored.
 */
export async function importAll(data: Record<string, string>): Promise<number> {
  await ensureStorageReady();
  let n = 0;
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith('xani.') || typeof value !== 'string') continue;
    JSON.parse(value); // must be valid JSON — throws (and aborts) on a corrupt entry
    if (cache) cache.set(key, value);
    await backendSet(key, value);
    n++;
  }
  return n;
}

/** Stable id generator (Web Crypto in the webview). */
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
