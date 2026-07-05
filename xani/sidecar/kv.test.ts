import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the data dir at a throwaway location BEFORE importing the modules that read it.
process.env.XANI_DATA_DIR = mkdtempSync(join(tmpdir(), 'xani-kv-test-'));
const { kvSet, kvImport, kvAll, kvAcceptableKey } = await import('./kv.ts');

test('kvAcceptableKey enforces the xani. namespace and rejects the dirty ledger key', () => {
  assert.equal(kvAcceptableKey('xani.memory.v1'), true);
  assert.equal(kvAcceptableKey('xani-kv-dirty'), false); // the client ledger key (no dot) is never storable
  assert.equal(kvAcceptableKey('evil.key'), false);
  assert.equal(kvAcceptableKey(''), false);
});

test('kvImport returns the EXACT keys accepted, so a rejected key is not falsely cleared', () => {
  // A foreign key and an oversized value must be rejected; the accepted list must list
  // only what was actually stored — the client clears its retry ledger against this.
  const big = 'x'.repeat(9_000_000); // > 8MB cap
  const accepted = kvImport({
    'xani.a': '1',
    'xani.b': '2',
    'evil.c': '3', // wrong namespace → rejected
    'xani.big': big, // oversized → rejected
  });
  assert.deepEqual(new Set(accepted), new Set(['xani.a', 'xani.b']));
  assert.equal('evil.c' in kvAll(), false);
  assert.equal('xani.big' in kvAll(), false);
});

test('kvSet measures UTF-8 bytes, not UTF-16 length (multi-byte languages)', () => {
  // ~3M Arabic chars ≈ 6MB in UTF-8 but only 3M UTF-16 units — must be measured in bytes.
  // Just under the 8MB byte cap in chars but over in bytes:
  const arabic = 'س'.repeat(4_500_000); // 2 bytes/char in UTF-8 = 9MB > cap; 4.5M length < cap
  assert.equal(kvSet('xani.arabic', arabic), false); // rejected by BYTE length, not char length
  assert.equal(kvSet('xani.small', 'س'.repeat(10)), true);
});
