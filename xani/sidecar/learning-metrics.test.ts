import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  weekKey,
  trimLedger,
  wrongCallRate,
  applyOutcome,
  computeTrend,
  MIN_DECISIONS,
  type Ledger,
} from '../src/lib/learning-metrics-core.ts';

test('weekKey buckets any day of a week to that week’s Monday', () => {
  assert.equal(weekKey(new Date(2026, 6, 1)), '2026-06-29'); // Wed 1 Jul 2026 → Mon 29 Jun
  assert.equal(weekKey(new Date(2026, 5, 29)), '2026-06-29'); // the Monday itself
  assert.equal(weekKey(new Date(2026, 6, 5)), '2026-06-29'); // Sunday still belongs to Monday’s week
  assert.equal(weekKey(new Date(2026, 6, 6)), '2026-07-06'); // next Monday starts a new week
});

test('applyOutcome counts decisions and corrections into the right week', () => {
  const wed = new Date(2026, 6, 1);
  let ledger: Ledger = {};
  ledger = applyOutcome(ledger, 'confirmed', wed);
  ledger = applyOutcome(ledger, 'corrected', wed);
  ledger = applyOutcome(ledger, 'corrected', wed);
  assert.deepEqual(ledger['2026-06-29'], { decisions: 3, corrections: 2 });
});

test('wrongCallRate is null below the minimum sample, a ratio above it', () => {
  assert.equal(wrongCallRate(undefined), null);
  assert.equal(wrongCallRate({ decisions: MIN_DECISIONS - 1, corrections: 1 }), null);
  assert.equal(wrongCallRate({ decisions: 10, corrections: 3 }), 0.3);
});

test('computeTrend: improving only when both weeks have enough data and the rate fell', () => {
  const now = new Date(2026, 6, 1); // week of Mon 29 Jun
  const ledger: Ledger = {
    '2026-06-22': { decisions: 10, corrections: 5 }, // last week: 50% wrong
    '2026-06-29': { decisions: 10, corrections: 2 }, // this week: 20% wrong
  };
  const t = computeTrend(ledger, now);
  assert.equal(t.rateLastWeek, 0.5);
  assert.equal(t.rateThisWeek, 0.2);
  assert.equal(t.improving, true);

  // Disengagement can't fake improvement: too few decisions → no verdict, not "better".
  const quiet = computeTrend({ '2026-06-22': { decisions: 10, corrections: 5 }, '2026-06-29': { decisions: 2, corrections: 0 } }, now);
  assert.equal(quiet.rateThisWeek, null);
  assert.equal(quiet.improving, null);
});

test('trimLedger caps the ledger to the newest weeks', () => {
  const big: Ledger = Object.fromEntries(
    Array.from({ length: 60 }, (_, i) => [`2025-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, { decisions: 1, corrections: 0 }]),
  );
  const trimmed = trimLedger(big, 52);
  assert.ok(Object.keys(trimmed).length <= 52);
  // The newest key always survives.
  const newest = Object.keys(big).sort().at(-1)!;
  assert.ok(newest in trimmed);
});
