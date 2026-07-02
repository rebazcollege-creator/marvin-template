/**
 * Learning metrics — pure logic (no storage, no imports) so it is unit-testable
 * from the sidecar test runner. See learning-metrics.ts for the storage wrapper
 * and the design rationale (wrong-call RATE + decision count, not a raw counter).
 */

export interface WeekStats {
  /** Track-it + Not-for-me decisions Rebaz made on surfaced items. */
  decisions: number;
  /** "Not for me" — Xanî surfaced something that didn't need him. */
  corrections: number;
}

export type Ledger = Record<string, WeekStats>;

export const KEEP_WEEKS = 52;
/** Below this many decisions a weekly rate is noise, not signal. */
export const MIN_DECISIONS = 5;

/** Monday of the week containing `d`, as YYYY-MM-DD (local time). */
export function weekKey(d: Date): string {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (local.getDay() + 6) % 7; // Mon=0 … Sun=6
  local.setDate(local.getDate() - dow);
  const mm = String(local.getMonth() + 1).padStart(2, '0');
  const dd = String(local.getDate()).padStart(2, '0');
  return `${local.getFullYear()}-${mm}-${dd}`;
}

/** Keep only the most recent `keep` weekly buckets. */
export function trimLedger(ledger: Ledger, keep: number = KEEP_WEEKS): Ledger {
  const keys = Object.keys(ledger).sort(); // YYYY-MM-DD sorts chronologically
  if (keys.length <= keep) return ledger;
  return Object.fromEntries(keys.slice(-keep).map((k) => [k, ledger[k]!]));
}

/** Wrong-call rate for a week, or null when there's too little data to mean anything. */
export function wrongCallRate(w: WeekStats | undefined): number | null {
  if (!w || w.decisions < MIN_DECISIONS) return null;
  return w.corrections / w.decisions;
}

/** Apply one decision to a ledger (immutably), bucketed into `at`'s week. */
export function applyOutcome(ledger: Ledger, outcome: 'confirmed' | 'corrected', at: Date): Ledger {
  const k = weekKey(at);
  const w = ledger[k] ?? { decisions: 0, corrections: 0 };
  const next: WeekStats = {
    decisions: w.decisions + 1,
    corrections: w.corrections + (outcome === 'corrected' ? 1 : 0),
  };
  return trimLedger({ ...ledger, [k]: next });
}

export interface LearningTrend {
  thisWeek: WeekStats;
  lastWeek: WeekStats;
  rateThisWeek: number | null;
  rateLastWeek: number | null;
  /** true = wrong-call rate fell (sharper), false = rose, null = not enough data. */
  improving: boolean | null;
}

export function computeTrend(ledger: Ledger, now: Date): LearningTrend {
  const empty: WeekStats = { decisions: 0, corrections: 0 };
  const thisWeek = ledger[weekKey(now)] ?? empty;
  const lastWeek = ledger[weekKey(new Date(now.getTime() - 7 * 86_400_000))] ?? empty;
  const rateThisWeek = wrongCallRate(thisWeek);
  const rateLastWeek = wrongCallRate(lastWeek);
  const improving =
    rateThisWeek !== null && rateLastWeek !== null ? rateThisWeek < rateLastWeek : null;
  return { thisWeek, lastWeek, rateThisWeek, rateLastWeek, improving };
}
