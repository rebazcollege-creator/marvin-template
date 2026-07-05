import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideNotifications, pruneFiredKeys, type NotifyInput } from './notify.ts';

const TODAY = '2026-07-06';
function base(p: Partial<NotifyInput> = {}): NotifyInput {
  return { dayOff: false, hour: 9, wakeStart: 6, wakeEnd: 23, emergencies: [], brief: null, ...p };
}
const emg = (id: string, extra = {}) => ({ id, from: 'Jil', channel: '#urgent', text: 'server is down', ...extra });

test('a day off fires nothing (MARVIN initiates nothing)', () => {
  const r = decideNotifications(base({ dayOff: true, emergencies: [emg('1')], brief: { forDate: TODAY, hasContent: true } }), [], TODAY);
  assert.deepEqual(r, []);
});

test('outside waking hours fires nothing', () => {
  assert.deepEqual(decideNotifications(base({ hour: 2, emergencies: [emg('1')] }), [], TODAY), []);
  assert.deepEqual(decideNotifications(base({ hour: 23, emergencies: [emg('1')] }), [], TODAY), []);
});

test('waking-hour boundaries: wakeStart fires, wakeEnd does not', () => {
  assert.equal(decideNotifications(base({ hour: 6, emergencies: [emg('1')] }), [], TODAY).length, 1);
  assert.equal(decideNotifications(base({ hour: 22, emergencies: [emg('1')] }), [], TODAY).length, 1);
  assert.equal(decideNotifications(base({ hour: 23, emergencies: [emg('1')] }), [], TODAY).length, 0);
});

test('an emergency fires high priority with a stable key', () => {
  const r = decideNotifications(base({ emergencies: [emg('m1', { headline: 'DB outage' })] }), [], TODAY);
  assert.equal(r.length, 1);
  assert.equal(r[0].key, 'emergency:m1');
  assert.equal(r[0].priority, 'high');
  assert.match(r[0].title, /Jil/);
  assert.equal(r[0].body, 'DB outage');
});

test('an already-fired emergency does not fire again', () => {
  const r = decideNotifications(base({ emergencies: [emg('m1')] }), ['emergency:m1'], TODAY);
  assert.deepEqual(r, []);
});

test('the brief fires once per day and only with real content', () => {
  assert.equal(decideNotifications(base({ brief: { forDate: TODAY, hasContent: true } }), [], TODAY).length, 1);
  assert.equal(decideNotifications(base({ brief: { forDate: TODAY, hasContent: false } }), [], TODAY).length, 0); // empty brief = nothing to say
  assert.equal(decideNotifications(base({ brief: { forDate: '2026-07-05', hasContent: true } }), [], TODAY).length, 0); // yesterday's
  assert.equal(decideNotifications(base({ brief: { forDate: TODAY, hasContent: true } }), ['brief:2026-07-06'], TODAY).length, 0); // already fired
});

test('emergencies sort before the brief', () => {
  const r = decideNotifications(base({ emergencies: [emg('m1')], brief: { forDate: TODAY, hasContent: true } }), [], TODAY);
  assert.equal(r.length, 2);
  assert.equal(r[0].priority, 'high');
  assert.equal(r[1].key, `brief:${TODAY}`);
});

test('a long emergency body is trimmed to one line', () => {
  const long = 'x'.repeat(500);
  const r = decideNotifications(base({ emergencies: [emg('m1', { text: long, headline: '' })] }), [], TODAY);
  assert.ok(r[0].body.length <= 140);
  assert.match(r[0].body, /…$/);
});

test('accepts a Set or an array as the fired ledger', () => {
  const arr = decideNotifications(base({ emergencies: [emg('m1')] }), ['emergency:m1'], TODAY);
  const set = decideNotifications(base({ emergencies: [emg('m1')] }), new Set(['emergency:m1']), TODAY);
  assert.deepEqual(arr, []);
  assert.deepEqual(set, []);
});

test('pruneFiredKeys drops entries older than the window, keeps recent', () => {
  const now = 1_000_000_000_000;
  const pruned = pruneFiredKeys({ old: now - 5 * 86_400_000, fresh: now - 3600_000, bad: NaN as unknown as number }, now);
  assert.deepEqual(Object.keys(pruned), ['fresh']);
});
