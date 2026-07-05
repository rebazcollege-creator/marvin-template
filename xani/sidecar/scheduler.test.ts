import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Isolate the data dir before importing (paths.ts makes dirs at import; the backup job reads it).
process.env.XANI_DATA_DIR = mkdtempSync(join(tmpdir(), 'xani-sched-'));
const { startScheduler, runNightlyBackup } = await import('./scheduler.ts');
const { kvSet } = await import('./kv.ts');

test('startScheduler runs extra jobs on the immediate boot tick', () => {
  let ran = 0;
  // The boot tick fires jobs synchronously (sync job runs inside the immediate tick()).
  startScheduler([() => { ran++; }]);
  assert.equal(ran, 1);
});

test('runNightlyBackup writes a snapshot after 03:00 and skips before', () => {
  kvSet('xani.probe', '1'); // non-empty store — empty snapshots are skipped by the retention guard
  // A fixed date far from "today" so the boot tick above (which used the real date)
  // can't have already written this file.
  const wrote = runNightlyBackup(new Date('2020-01-15T04:00:00'));
  assert.equal(wrote, true);
  // Same day again → already exists → no duplicate.
  assert.equal(runNightlyBackup(new Date('2020-01-15T05:00:00')), false);
  // Before 03:00 → skipped.
  assert.equal(runNightlyBackup(new Date('2020-01-16T01:00:00')), false);
});
