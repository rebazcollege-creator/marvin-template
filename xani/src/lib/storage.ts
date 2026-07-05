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

/**
 * Dirty ledger — keys changed while the sidecar copy couldn't be updated (sidecar
 * down, or a /kv write failed). Without it, the next hydrate would let the server's
 * STALE value overwrite the newer local one (or resurrect a removed key). Stored
 * under a non-`xani.` key so the ledger itself is never synced or exported.
 */
const DIRTY_KEY = 'xani-kv-dirty';
type DirtyOp = 'set' | 'remove';
function readDirty(): Record<string, DirtyOp> {
  try {
    return JSON.parse(window.localStorage.getItem(DIRTY_KEY) ?? '{}') as Record<string, DirtyOp>;
  } catch {
    return {};
  }
}
function markDirty(key: string, op: DirtyOp): void {
  try {
    const d = readDirty();
    d[key] = op;
    window.localStorage.setItem(DIRTY_KEY, JSON.stringify(d));
  } catch {
    /* ledger is best-effort */
  }
}
function clearDirty(keys: string[]): void {
  try {
    const d = readDirty();
    for (const k of keys) delete d[k];
    window.localStorage.setItem(DIRTY_KEY, JSON.stringify(d));
  } catch {
    /* ledger is best-effort */
  }
}
/**
 * Clear a dirty mark ONLY if the durable localStorage mirror still holds exactly what we
 * synced to the server (for a set) or the key is still absent (for a remove). If a newer
 * write/remove landed after we captured the snapshot, its mark must survive to be replayed
 * — otherwise a concurrent write done right after startup would be silently rolled back.
 */
function clearDirtyIfUnchanged(key: string, expected: string | null): void {
  try {
    if (window.localStorage.getItem(key) === expected) clearDirty([key]);
  } catch {
    /* best effort */
  }
}

/** The sidecar's per-boot kv token, injected into the app's own HTML (same-origin only). */
function kvToken(): string {
  if (typeof document === 'undefined') return '';
  return document.querySelector('meta[name="xani-kv-token"]')?.getAttribute('content') ?? '';
}
function kvHeaders(withJson = false): Record<string, string> {
  const h: Record<string, string> = {};
  const t = kvToken();
  if (t) h['X-Xani-Token'] = t;
  if (withJson) h['Content-Type'] = 'application/json';
  return h;
}

async function backendLoadAll(): Promise<[string, string][]> {
  if (isTauri()) {
    return await tauriInvoke<[string, string][]>('kv_all');
  }
  const local = localEntries();
  try {
    // No token (dev mode: UI served by Next, not the sidecar) → 401 → localStorage fallback.
    const r = await fetch(`${SIDECAR_URL}/kv/all`, { headers: kvHeaders(), signal: AbortSignal.timeout(2000) });
    if (!r.ok) throw new Error(`kv ${r.status}`);
    const j = (await r.json()) as { kv?: Record<string, string> };
    const server = j.kv ?? {};
    httpKv = true;
    const dirty = readDirty();
    // Merge: local as base; server overlays EXCEPT keys we changed while it was
    // unreachable (their local value is newer). Removed-while-down keys stay removed.
    // NOTE: this is last-offline-writer-wins, not newest-wins (no timestamps) — a fine
    // trade-off for a single-user, usually single-window app.
    const merged = new Map<string, string>(local);
    for (const [k, v] of Object.entries(server)) {
      if (!(k in dirty)) merged.set(k, v);
    }
    for (const [k, op] of Object.entries(dirty)) {
      if (op === 'remove') merged.delete(k);
    }
    // Replay upward: only-local keys (first migration) + dirty sets in one bulk import;
    // dirty removes individually. A mark clears only if the server ACCEPTED the key AND
    // the mirror still holds the synced value (clearDirtyIfUnchanged) — so a rejected
    // (oversized) key or a value changed mid-flight keeps its mark and is retried.
    const toPush = new Map<string, string>(local.filter(([k]) => !(k in server)));
    for (const [k, op] of Object.entries(dirty)) {
      if (op === 'set') {
        const v = merged.get(k);
        if (v !== undefined) toPush.set(k, v);
      }
    }
    if (toPush.size) {
      void fetch(`${SIDECAR_URL}/kv/import`, {
        method: 'POST',
        headers: kvHeaders(true),
        body: JSON.stringify({ kv: Object.fromEntries(toPush) }),
      })
        .then(async (res) => {
          if (!res.ok) return;
          const body = (await res.json().catch(() => ({}))) as { accepted?: string[] };
          for (const k of body.accepted ?? []) clearDirtyIfUnchanged(k, toPush.get(k) ?? null);
        })
        .catch(() => undefined);
    }
    for (const [k, op] of Object.entries(dirty)) {
      if (op === 'remove') {
        void fetch(`${SIDECAR_URL}/kv/remove`, {
          method: 'POST',
          headers: kvHeaders(true),
          body: JSON.stringify({ key: k }),
        })
          .then((res) => { if (res.ok) clearDirtyIfUnchanged(k, null); })
          .catch(() => undefined);
      }
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
  // …and persist to the sidecar, which is the durable, backed-up copy. A failed or
  // impossible server write marks the key dirty so the next hydrate replays it
  // instead of letting the server's stale value win.
  if (!httpKv) {
    markDirty(key, 'set');
    return;
  }
  try {
    const r = await fetch(`${SIDECAR_URL}/kv/set`, {
      method: 'POST',
      headers: kvHeaders(true),
      body: JSON.stringify({ key, value }),
    });
    if (!r.ok) throw new Error(`kv/set ${r.status}`);
    clearDirtyIfUnchanged(key, value);
  } catch (e) {
    markDirty(key, 'set');
    throw e; // writeJson surfaces this as a storage error — the value is safe locally
  }
}

async function backendRemove(key: string): Promise<void> {
  if (isTauri()) return tauriInvoke('kv_remove', { key });
  if (typeof window !== 'undefined') window.localStorage.removeItem(key);
  if (!httpKv) {
    markDirty(key, 'remove');
    return;
  }
  try {
    const r = await fetch(`${SIDECAR_URL}/kv/remove`, {
      method: 'POST',
      headers: kvHeaders(true),
      body: JSON.stringify({ key }),
    });
    if (!r.ok) throw new Error(`kv/remove ${r.status}`);
    clearDirtyIfUnchanged(key, null);
  } catch {
    markDirty(key, 'remove'); // replayed on next hydrate; key stays gone locally
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
 *
 * Validation happens BEFORE any write (a corrupt file restores nothing), and a
 * failed server persist marks the key dirty rather than aborting mid-restore —
 * previously one failed write left the store half-restored with no recovery.
 */
export async function importAll(data: Record<string, string>): Promise<number> {
  await ensureStorageReady();
  const entries = Object.entries(data).filter(([key, value]) => key.startsWith('xani.') && typeof value === 'string');
  for (const [, value] of entries) JSON.parse(value); // all-or-nothing validation, before any write
  let n = 0;
  for (const [key, value] of entries) {
    if (cache) cache.set(key, value);
    try {
      await backendSet(key, value);
    } catch {
      /* value is in cache + local mirror and marked dirty — replayed on next hydrate */
    }
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
