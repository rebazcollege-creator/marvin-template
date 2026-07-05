/**
 * Storage adapter.
 *
 * Persistence backends, in order of preference:
 *   1. Tauri (packaged app): Rust-owned SQLite kv via commands (kv_all/kv_set/…).
 *   2. The sidecar's kv store over HTTP (/kv/*): the normal browser path — MARVIN's
 *      brain (memories, settings, loops, chats) lives in a real file the sidecar
 *      owns and backs up nightly, NOT in localStorage where "Clear site data"
 *      silently wiped it.
 *   3. localStorage: last-resort fallback (sidecar down), and kept as a mirror so
 *      first paint is instant and nothing is lost while the sidecar restarts.
 *
 * On first HTTP hydrate, existing localStorage data is migrated up to the sidecar
 * (server values win on conflict — it's authoritative once adopted).
 *
 * To avoid turning every getSettings()/getMemories() call site async, we use a
 * CACHE-HYDRATE model: `ensureStorageReady()` loads all `xani.*` keys into an
 * in-memory cache once at startup; reads are then synchronous against the cache
 * and writes update the cache synchronously while persisting in the background.
 * Components call `ensureStorageReady()` in their mount effect before reading.
 */

import { SIDECAR_URL } from '@/lib/marvin-client';

let cache: Map<string, string> | null = null;
let readyPromise: Promise<void> | null = null;
let httpKv = false; // sidecar kv reachable at hydrate time → it is the write target

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

function localEntries(): [string, string][] {
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

async function backendLoadAll(): Promise<[string, string][]> {
  if (isTauri()) {
    return await tauriInvoke<[string, string][]>('kv_all');
  }
  const local = localEntries();
  try {
    const r = await fetch(`${SIDECAR_URL}/kv/all`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) throw new Error(`kv ${r.status}`);
    const j = (await r.json()) as { kv?: Record<string, string> };
    const server = j.kv ?? {};
    httpKv = true;
    // Merge: local as base, server overlays (authoritative). Anything only-local is
    // pushed up once, so a pre-migration browser profile loses nothing.
    const merged = new Map<string, string>(local);
    for (const [k, v] of Object.entries(server)) merged.set(k, v);
    const onlyLocal = local.filter(([k]) => !(k in server));
    if (onlyLocal.length) {
      void fetch(`${SIDECAR_URL}/kv/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kv: Object.fromEntries(onlyLocal) }),
      }).catch(() => undefined);
    }
    return [...merged.entries()];
  } catch {
    httpKv = false; // sidecar unreachable — run on the localStorage mirror
    return local;
  }
}

async function backendSet(key: string, value: string): Promise<void> {
  if (isTauri()) return tauriInvoke('kv_set', { key, value });
  // Mirror to localStorage always (instant first paint + survives a sidecar restart)…
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* quota — the sidecar copy below is the durable one */
    }
  }
  // …and persist to the sidecar, which is the durable, backed-up copy.
  if (httpKv) {
    const r = await fetch(`${SIDECAR_URL}/kv/set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
    if (!r.ok) throw new Error(`kv/set ${r.status}`);
  }
}

async function backendRemove(key: string): Promise<void> {
  if (isTauri()) return tauriInvoke('kv_remove', { key });
  if (typeof window !== 'undefined') window.localStorage.removeItem(key);
  if (httpKv) {
    await fetch(`${SIDECAR_URL}/kv/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    }).catch(() => undefined);
  }
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
