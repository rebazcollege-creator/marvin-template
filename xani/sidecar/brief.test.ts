import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBriefInput, pressingCards, BRIEF_ITEM_CAP, type BriefInput } from './brief.ts';
import type { TriagedEmail, TriagedSlack } from '../src/lib/marvin-protocol.ts';

function email(p: Partial<TriagedEmail> = {}): TriagedEmail {
  return { id: 'e1', account: 'work', from: 'Chelsea', subject: 'Hours', snippet: '', receivedAt: '2026-07-05T09:00:00Z', verdict: 'act', reason: '', ...p };
}
function slack(p: Partial<TriagedSlack> = {}): TriagedSlack {
  return { id: 'c:1', workspace: 'w', workspaceName: 'Amargi', channelId: 'C1', channel: 'general', dm: false, from: 'Jil', text: 'Can you review?', ts: '1', emergency: false, verdict: 'act', reason: '', ...p };
}
const empty: BriefInput = { inboxActs: [], slackActs: [], events: [], dueCards: [] };

test('empty world → empty:true and no prompt (caller skips the model)', () => {
  const r = buildBriefInput(empty);
  assert.equal(r.empty, true);
  assert.equal(r.prompt, '');
});

test('a single inbox act-item is enough to brief', () => {
  const r = buildBriefInput({ ...empty, inboxActs: [email({ headline: 'Chelsea wants your reply on hours' })] });
  assert.equal(r.empty, false);
  assert.match(r.prompt, /INBOX \(needs a reply\/decision\)/);
  assert.match(r.prompt, /Chelsea wants your reply on hours/);
});

test('calendar-only or trello-only worlds still brief', () => {
  assert.equal(buildBriefInput({ ...empty, events: [{ title: 'Standup', start: '10:00' }] }).empty, false);
  assert.equal(buildBriefInput({ ...empty, dueCards: [{ name: 'Publish piece', due: '2026-07-05' }] }).empty, false);
});

test('deadlines are inlined so the model can lead with the hardest', () => {
  const r = buildBriefInput({ ...empty, inboxActs: [email({ dueAt: '2026-07-10' })], slackActs: [slack({ dueAt: '2026-07-08' })] });
  assert.match(r.prompt, /\(due 2026-07-10\)/);
  assert.match(r.prompt, /\(due 2026-07-08\)/);
});

test('an act-item without a deadline carries no "(due …)"', () => {
  const r = buildBriefInput({ ...empty, inboxActs: [email()] });
  assert.doesNotMatch(r.prompt, /\(due/);
});

test('headline is preferred over subject/raw text', () => {
  const r = buildBriefInput({ ...empty, inboxActs: [email({ subject: 'RAW SUBJECT', headline: 'the real ask' })] });
  assert.match(r.prompt, /the real ask/);
  assert.doesNotMatch(r.prompt, /RAW SUBJECT/);
});

test('slack DM vs channel is labelled', () => {
  const dm = buildBriefInput({ ...empty, slackActs: [slack({ dm: true })] });
  assert.match(dm.prompt, /\bDM\b/);
  const chan = buildBriefInput({ ...empty, slackActs: [slack({ dm: false, channel: 'video' })] });
  assert.match(chan.prompt, /#video/);
});

test('each source is capped at BRIEF_ITEM_CAP items', () => {
  const many = Array.from({ length: 20 }, (_, i) => email({ id: `e${i}`, headline: `item ${i}` }));
  const r = buildBriefInput({ ...empty, inboxActs: many });
  const shown = (r.prompt.match(/^- /gm) ?? []).length;
  assert.equal(shown, BRIEF_ITEM_CAP);
  assert.match(r.prompt, /item 0/);
  assert.doesNotMatch(r.prompt, /item 8/); // 0..7 shown, 8+ dropped
});

test('pressingCards keeps only urgent or due-dated cards', () => {
  const cards = [
    { name: 'urgent one', urgent: true },
    { name: 'due one', due: '2026-07-05' },
    { name: 'someday', urgent: false, due: null },
  ];
  const kept = pressingCards(cards);
  assert.equal(kept.length, 2);
  assert.deepEqual(kept.map((c) => c.name), ['urgent one', 'due one']);
});

test('all four sources compose into one prompt in a stable order', () => {
  const r = buildBriefInput({
    inboxActs: [email()],
    slackActs: [slack()],
    events: [{ title: 'Standup', start: '10:00' }],
    dueCards: [{ name: 'Publish', due: '2026-07-05', list: 'Website feed' }],
  });
  const iInbox = r.prompt.indexOf('INBOX');
  const iSlack = r.prompt.indexOf('SLACK');
  const iCal = r.prompt.indexOf('CALENDAR');
  const iTrello = r.prompt.indexOf('TRELLO');
  assert.ok(iInbox >= 0 && iSlack > iInbox && iCal > iSlack && iTrello > iCal, 'sources in INBOX→SLACK→CALENDAR→TRELLO order');
  assert.match(r.prompt, /\[Website feed\]/);
});
