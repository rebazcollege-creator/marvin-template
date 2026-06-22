/**
 * Storage adapter seam.
 *
 * Phase 1 persists to localStorage so the app works in `next dev` and the Tauri
 * webview with zero backend. The research is unambiguous that localStorage is a
 * stop-gap (5 MB cap, synchronous, no query) — the committed target is SQLite
 * (rusqlite + sqlite-vec) owned by the Rust side, surfaced via Tauri commands.
 *
 * Everything in the app reads/writes JSON through THIS module, so the migration
 * is contained here. Note the migration also flips these calls from sync to
 * async (Tauri IPC is async); callers that are already inside React effects /
 * event handlers absorb that without structural change.
 */

export function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or serialization failure — swallow in Phase 1; SQLite removes this class of error.
  }
}

export function removeKey(key: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(key);
}

/** Stable id generator. Uses the Web Crypto UUID available in the webview. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Defensive fallback (SSR / very old runtime).
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
