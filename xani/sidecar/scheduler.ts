import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { BACKUPS_DIR, KV_FILE, CREDS_FILE } from './paths.ts';
import { kvFlush } from './kv.ts';

/**
 * The sidecar's heartbeat — Xanî's first background scheduler.
 *
 * Until Phase 0 the app had NO scheduled work anywhere: nothing ran unless a window
 * was open and visible. This module is deliberately tiny (one interval, one job) but
 * it is the seed the proactive layer grows from (morning brief, watchers, follow-ups
 * all land here in Phase 2).
 *
 * Job #1 — nightly backup: after 03:00 local, once per day, snapshot the kv store
 * (MARVIN's whole brain) and the credential store into backups/, keep the last 14.
 * Owner-only file mode; a dead laptop stops costing every memory and every login.
 */

const TICK_MS = 15 * 60 * 1000; // wakes 4×/hour; each job decides if it's due
const KEEP_BACKUPS = 14;

function todayStamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Write backups/backup-YYYY-MM-DD.json if it doesn't exist yet. Returns true if written. */
export function runNightlyBackup(now: Date = new Date()): boolean {
  if (now.getHours() < 3) return false; // let the day settle; catches up on any later tick
  const file = join(BACKUPS_DIR, `backup-${todayStamp(now)}.json`);
  if (existsSync(file)) return false;
  try {
    kvFlush(); // consistent on-disk kv before snapshotting
    const read = (p: string): Record<string, unknown> => {
      try {
        return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>) : {};
      } catch {
        return {};
      }
    };
    const kv = read(KV_FILE);
    const creds = read(CREDS_FILE);
    // Never let an empty snapshot (kv.json corrupt/deleted, or a never-opened fresh
    // machine) rotate away good history: if there's genuinely nothing to save AND we
    // already hold at least one backup, skip. A first-ever empty run still writes one.
    const existing = readdirSync(BACKUPS_DIR).filter((f) => f.startsWith('backup-') && f.endsWith('.json'));
    if (Object.keys(kv).length === 0 && Object.keys(creds).length === 0 && existing.length > 0) {
      return false;
    }
    writeFileSync(file, JSON.stringify({ at: now.toISOString(), kv, creds }), { mode: 0o600 });
    // Retention: keep the newest KEEP_BACKUPS files.
    const all = readdirSync(BACKUPS_DIR).filter((f) => f.startsWith('backup-') && f.endsWith('.json')).sort();
    for (const old of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) {
      try { unlinkSync(join(BACKUPS_DIR, old)); } catch { /* keep going */ }
    }
    console.log(`[scheduler] nightly backup written: ${file}`);
    return true;
  } catch (e) {
    console.error('[scheduler] backup failed:', (e as Error).message);
    return false;
  }
}

let started = false;

/** Start the heartbeat. Idempotent; also runs jobs once at boot so a laptop that was
 *  asleep at 03:00 still gets its backup the moment the service comes up. */
export function startScheduler(): void {
  if (started) return;
  started = true;
  const tick = () => {
    try { runNightlyBackup(); } catch { /* a job must never kill the heartbeat */ }
  };
  tick();
  const t = setInterval(tick, TICK_MS);
  t.unref?.(); // never hold the process open just for the scheduler
}
