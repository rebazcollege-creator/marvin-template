import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickAwaiting, DEFAULT_WAITING_OPTS, type ThreadMeta } from './waiting.ts';

const NOW = Date.UTC(2026, 6, 20, 12, 0, 0); // 2026-07-20
const daysAgo = (d: number) => NOW - d * 86_400_000;

function thread(id: string, msgs: { mine: boolean; d: number; to?: string; subject?: string; snippet?: string }[]): ThreadMeta {
  return {
    account: 'leadstories',
    threadId: id,
    messages: msgs.map((m) => ({ fromMe: m.mine, internalDate: daysAgo(m.d), to: m.to, subject: m.subject, snippet: m.snippet })),
  };
}

test('a sent message quiet for 5 days is waiting', () => {
  const r = pickAwaiting([thread('t1', [{ mine: true, d: 5, to: 'jil@x.com', subject: 'Shoot date?', snippet: 'When works?' }])], NOW);
  assert.equal(r.length, 1);
  assert.equal(r[0].to, 'jil@x.com');
  assert.equal(r[0].subject, 'Shoot date?');
  assert.equal(r[0].quietDays, 5);
});

test('a reply after my message clears it (they had the last word)', () => {
  const r = pickAwaiting([thread('t1', [
    { mine: true, d: 6, subject: 'Q' },
    { mine: false, d: 4, subject: 'Q' }, // their reply is newer
  ])], NOW);
  assert.equal(r.length, 0);
});

test('too-soon (under minQuietDays) is not surfaced yet', () => {
  const r = pickAwaiting([thread('t1', [{ mine: true, d: 1, subject: 'ping' }])], NOW);
  assert.equal(r.length, 0);
});

test('too-old (past maxAgeDays) is let go', () => {
  const r = pickAwaiting([thread('t1', [{ mine: true, d: DEFAULT_WAITING_OPTS.maxAgeDays + 3, subject: 'old' }])], NOW);
  assert.equal(r.length, 0);
});

test('boundary days are inclusive', () => {
  const min = pickAwaiting([thread('a', [{ mine: true, d: DEFAULT_WAITING_OPTS.minQuietDays, subject: 'min' }])], NOW);
  const max = pickAwaiting([thread('b', [{ mine: true, d: DEFAULT_WAITING_OPTS.maxAgeDays, subject: 'max' }])], NOW);
  assert.equal(min.length, 1);
  assert.equal(max.length, 1);
});

test('unordered messages are sorted — newest decides', () => {
  // last chronological message is mine (d:3), even though listed first
  const r = pickAwaiting([thread('t1', [
    { mine: true, d: 3, subject: 'S' },
    { mine: false, d: 8, subject: 'S' },
    { mine: true, d: 10, subject: 'S' },
  ])], NOW);
  assert.equal(r.length, 1);
  assert.equal(r[0].quietDays, 3);
});

test('longest-waiting sorts first', () => {
  const r = pickAwaiting([
    thread('short', [{ mine: true, d: 3, subject: 'short' }]),
    thread('long', [{ mine: true, d: 12, subject: 'long' }]),
    thread('mid', [{ mine: true, d: 7, subject: 'mid' }]),
  ], NOW);
  assert.deepEqual(r.map((i) => i.subject), ['long', 'mid', 'short']);
});

test('duplicate threadIds yield one item', () => {
  const t = thread('dup', [{ mine: true, d: 5, subject: 'once' }]);
  const r = pickAwaiting([t, t], NOW);
  assert.equal(r.length, 1);
});

test('empty threads and empty input are handled', () => {
  assert.deepEqual(pickAwaiting([], NOW), []);
  assert.deepEqual(pickAwaiting([{ account: 'x', threadId: 'e', messages: [] }], NOW), []);
});

test('missing subject falls back to (no subject); sentAt is ISO', () => {
  const r = pickAwaiting([thread('t1', [{ mine: true, d: 4 }])], NOW);
  assert.equal(r[0].subject, '(no subject)');
  assert.match(r[0].sentAt, /^2026-07-16T/);
});

test('custom opts widen or narrow the window', () => {
  const t = [thread('t1', [{ mine: true, d: 1, subject: 'fresh' }])];
  assert.equal(pickAwaiting(t, NOW).length, 0); // default min 2
  assert.equal(pickAwaiting(t, NOW, { minQuietDays: 1 }).length, 1); // widened
});
