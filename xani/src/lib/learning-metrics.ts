import { readJson, writeJson } from '@/lib/storage';
import { applyOutcome, computeTrend, type Ledger, type LearningTrend } from '@/lib/learning-metrics-core';

/**
 * Learning metrics — the honest "is Xanî getting smarter?" number
 * (docs/self-development.md §5: corrections should go down every week).
 *
 * A raw corrections count is confounded: it also falls when Rebaz simply stops
 * using the app. So we count DECISIONS on surfaced items — "Track it" (Xanî was
 * right) and "Not for me" (Xanî was wrong; a correction) — and report the
 * wrong-call RATE per week, with the decision count alongside as the engagement
 * guardrail. The rate falling while decisions stay healthy = genuinely sharper.
 *
 * Storage is week-bucketed counters (not raw events), capped to a year, so the
 * ledger can never grow unboundedly. Pure logic lives in learning-metrics-core.ts.
 */

export { MIN_DECISIONS, type LearningTrend, type WeekStats } from '@/lib/learning-metrics-core';

const KEY = 'xani.learning.v1';

/** Record one triage decision (Track it → confirmed, Not for me → corrected). */
export function recordTriageOutcome(outcome: 'confirmed' | 'corrected', at: Date = new Date()): void {
  const ledger = readJson<Ledger>(KEY, {});
  writeJson(KEY, applyOutcome(ledger, outcome, at));
}

/** This week vs last week, for the Memory page card. */
export function learningTrend(now: Date = new Date()): LearningTrend {
  return computeTrend(readJson<Ledger>(KEY, {}), now);
}
