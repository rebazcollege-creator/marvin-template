import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeHealth, healthHeadline, type ProbeResult } from './diagnostics.ts';

const probe = (p: Partial<ProbeResult>): ProbeResult => ({ id: 'x', name: 'X', credPresent: false, connected: false, ...p });

test('a connected integration reads as live', () => {
  const [r] = summarizeHealth([probe({ id: 'gmail', name: 'Gmail', credPresent: true, connected: true })]);
  assert.equal(r.status, 'live');
  assert.equal(r.hint, undefined);
});

test('no credentials reads as needs_setup, not an error', () => {
  const [r] = summarizeHealth([probe({ id: 'slack', name: 'Slack', credPresent: false, connected: false })]);
  assert.equal(r.status, 'needs_setup');
  assert.match(r.hint!, /Connections page/);
});

test('an expired token is called out as a reconnect, in plain language', () => {
  const [r] = summarizeHealth([probe({ id: 'gmail', name: 'Gmail', credPresent: true, connected: false, error: 'auth 400: invalid_grant' })]);
  assert.equal(r.status, 'error');
  assert.match(r.detail, /expired|revoked/i);
  assert.match(r.hint!, /[Rr]econnect/);
});

test('a network/timeout error is distinguished from an auth failure', () => {
  const [r] = summarizeHealth([probe({ id: 'trello', name: 'Trello', credPresent: true, connected: false, error: 'The operation timed out' })]);
  assert.match(r.detail, /reach the service|network|timeout/i);
});

test('rate limiting reassures rather than alarms', () => {
  const [r] = summarizeHealth([probe({ id: 'buffer', name: 'Buffer', credPresent: true, connected: false, error: 'Gmail API 429' })]);
  assert.match(r.detail, /rate-limiting/i);
  assert.match(r.hint!, /nothing is broken/i);
});

test('an unknown error falls back to a safe generic hint', () => {
  const [r] = summarizeHealth([probe({ id: 'gh', name: 'GitHub', credPresent: true, connected: false, error: 'something weird happened' })]);
  assert.equal(r.status, 'error');
  assert.match(r.hint!, /[Rr]econnect/);
});

test('report is sorted worst-first: errors, then needs_setup, then live', () => {
  const rows = summarizeHealth([
    probe({ id: 'a', name: 'Alive', credPresent: true, connected: true }),
    probe({ id: 'b', name: 'Broken', credPresent: true, connected: false, error: '401' }),
    probe({ id: 'c', name: 'Cold', credPresent: false, connected: false }),
  ]);
  assert.deepEqual(rows.map((r) => r.status), ['error', 'needs_setup', 'live']);
});

test('healthHeadline rolls the counts up', () => {
  const rows = summarizeHealth([
    probe({ id: 'a', name: 'A', credPresent: true, connected: true }),
    probe({ id: 'b', name: 'B', credPresent: true, connected: true }),
    probe({ id: 'c', name: 'C', credPresent: true, connected: false, error: '401' }),
    probe({ id: 'd', name: 'D', credPresent: false, connected: false }),
  ]);
  assert.equal(healthHeadline(rows), '2 live · 1 needs you · 1 not set up');
});

test('healthHeadline handles the empty / nothing-connected case', () => {
  assert.equal(healthHeadline([]), 'Nothing connected yet');
});
