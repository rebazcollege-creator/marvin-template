import { readJson, writeJson } from '@/lib/storage';

/**
 * Momentum (ADHD design report §4, P1.1) — the dopamine ledger. ADHD motivation is
 * interest/reward-driven, so we make small, REAL wins visible and celebrate them, and
 * we keep a streak that SURVIVES an off day (a single miss never resets you to zero —
 * shame-free by design). Local store, same adapter as loops/approvals.
 */

export type WinKind = 'loop' | 'focus' | 'reply' | 'triage';

export interface Win {
  id: string;
  label: string;
  kind: WinKind;
  at: string; // ISO
}

const KEY = 'xani.momentum.v1';
const CAP = 500;

function all(): Win[] {
  return readJson<Win[]>(KEY, []);
}

/** Log a real win. Fire-and-forget from completeLoop / focus completion / sent reply. */
export function recordWin(label: string, kind: WinKind = 'loop'): void {
  const w: Win = { id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`, label: label.slice(0, 120), kind, at: new Date().toISOString() };
  const next = [w, ...all()].slice(0, CAP);
  writeJson(KEY, next);
  try { window.dispatchEvent(new CustomEvent('xani:momentum-changed')); } catch { /* SSR */ }
}

/** Local YYYY-MM-DD for an instant, in the user's timezone. */
function dateKey(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Wins recorded today (local). */
export function todayWins(tz = 'Europe/Berlin', now: Date = new Date()): Win[] {
  const today = dateKey(now, tz);
  return all().filter((w) => dateKey(new Date(w.at), tz) === today);
}

/** The days of the last `n` (most recent last), each flagged if it had a win. */
export function recentDays(tz = 'Europe/Berlin', now: Date = new Date(), n = 7): { key: string; label: string; win: boolean }[] {
  const winDays = new Set(all().map((w) => dateKey(new Date(w.at), tz)));
  const out: { key: string; label: string; win: boolean }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    const key = dateKey(d, tz);
    const label = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'narrow' }).format(d);
    out.push({ key, label, win: winDays.has(key) });
  }
  return out;
}

/**
 * Streak of active days, ending today — but forgiving: ONE missed day is bridged, not
 * fatal. Today counts if it has a win; an empty today doesn't break a run yet.
 */
export function streakDays(tz = 'Europe/Berlin', now: Date = new Date()): number {
  const winDays = new Set(all().map((w) => dateKey(new Date(w.at), tz)));
  let streak = 0;
  let gaps = 0;
  for (let i = 0; i < 400; i++) {
    const key = dateKey(new Date(now.getTime() - i * 86_400_000), tz);
    if (winDays.has(key)) {
      streak += 1;
      gaps = 0;
    } else if (i === 0) {
      // today not done yet — don't punish, keep looking back
      continue;
    } else {
      gaps += 1;
      if (gaps >= 2) break; // two blank days in a row ends the run
    }
  }
  return streak;
}
