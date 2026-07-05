import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDeadline, deadlineRule } from './deadline.ts';

test('normalizeDeadline accepts a plain ISO date', () => {
  assert.equal(normalizeDeadline('2026-07-10'), '2026-07-10');
});

test('normalizeDeadline strips a time/timezone suffix', () => {
  assert.equal(normalizeDeadline('2026-07-10T17:00:00+02:00'), '2026-07-10');
  assert.equal(normalizeDeadline('2026-12-01 09:00'), '2026-12-01');
});

test('normalizeDeadline rejects non-dates and prose', () => {
  for (const bad of ['ASAP', 'soon', 'Friday', 'next week', '', 'null']) {
    assert.equal(normalizeDeadline(bad), undefined, `expected ${bad} → undefined`);
  }
});

test('normalizeDeadline rejects non-strings (null / number / object)', () => {
  assert.equal(normalizeDeadline(null), undefined);
  assert.equal(normalizeDeadline(undefined), undefined);
  assert.equal(normalizeDeadline(20260710), undefined);
  assert.equal(normalizeDeadline({}), undefined);
});

test('normalizeDeadline rejects a hallucinated / out-of-range year', () => {
  assert.equal(normalizeDeadline('0026-07-10'), undefined);
  assert.equal(normalizeDeadline('9999-07-10'), undefined);
  assert.equal(normalizeDeadline('2101-01-01'), undefined);
});

test('normalizeDeadline rejects out-of-range month and day', () => {
  assert.equal(normalizeDeadline('2026-13-01'), undefined);
  assert.equal(normalizeDeadline('2026-00-10'), undefined);
  assert.equal(normalizeDeadline('2026-07-32'), undefined);
  assert.equal(normalizeDeadline('2026-07-00'), undefined);
});

test('normalizeDeadline rejects an impossible calendar day', () => {
  assert.equal(normalizeDeadline('2026-02-31'), undefined); // Feb has no 31st
  assert.equal(normalizeDeadline('2026-04-31'), undefined); // April has 30 days
  assert.equal(normalizeDeadline('2027-02-29'), undefined); // 2027 is not a leap year
});

test('normalizeDeadline accepts a valid leap day', () => {
  assert.equal(normalizeDeadline('2028-02-29'), '2028-02-29'); // 2028 is a leap year
});

test('deadlineRule embeds today so the model can resolve relative dates', () => {
  const rule = deadlineRule('2026-07-05');
  assert.match(rule, /Today is 2026-07-05/);
  assert.match(rule, /deadline/i);
  assert.match(rule, /YYYY-MM-DD/);
});
