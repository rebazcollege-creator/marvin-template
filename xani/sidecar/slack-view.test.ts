import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSidebar, defaultConversationId, type SidebarConvo } from '../src/lib/slack-view-core.ts';

const c = (p: Partial<SidebarConvo> & { id: string }): SidebarConvo => ({
  workspace: 'amargi', name: p.id, kind: 'channel', unread: 0, hasUnread: false, ...p,
});

test('unread conversations surface at the top, most-recent first, channels and DMs mixed', () => {
  const s = buildSidebar([
    c({ id: 'general', kind: 'channel', hasUnread: false, lastTs: '100' }),
    c({ id: 'dm-alice', kind: 'dm', hasUnread: true, unread: 2, lastTs: '300' }),
    c({ id: 'breaking', kind: 'channel', hasUnread: true, unread: 5, lastTs: '500' }),
    c({ id: 'dm-bob', kind: 'dm', hasUnread: false, lastTs: '200' }),
  ]);
  assert.deepEqual(s.unread.map((x) => x.id), ['breaking', 'dm-alice']); // recency: 500 then 300
  assert.equal(s.totalUnread, 7);
});

test('read DMs and read channels fall into their own sections, recency-ordered', () => {
  const s = buildSidebar([
    c({ id: 'zeta', kind: 'channel', lastTs: '100' }),
    c({ id: 'alpha', kind: 'channel', lastTs: '400' }),
    c({ id: 'dm-cara', kind: 'dm', lastTs: '250' }),
  ]);
  assert.deepEqual(s.channels.map((x) => x.id), ['alpha', 'zeta']); // recency wins over alphabet
  assert.deepEqual(s.dms.map((x) => x.id), ['dm-cara']);
  assert.equal(s.unread.length, 0);
});

test('an unread item appears ONLY in Unread, never duplicated in its home section', () => {
  const s = buildSidebar([c({ id: 'dm-x', kind: 'dm', hasUnread: true, unread: 1, lastTs: '10' })]);
  assert.deepEqual(s.unread.map((x) => x.id), ['dm-x']);
  assert.equal(s.dms.length, 0);
});

test('default open follows importance: top unread → recent DM → recent channel', () => {
  const withUnread = buildSidebar([
    c({ id: 'chan', kind: 'channel', lastTs: '900' }),
    c({ id: 'urgent', kind: 'channel', hasUnread: true, unread: 1, lastTs: '50' }),
  ]);
  assert.equal(defaultConversationId(withUnread), 'urgent'); // unread beats a newer read channel

  const noUnread = buildSidebar([
    c({ id: 'chan', kind: 'channel', lastTs: '100' }),
    c({ id: 'dm', kind: 'dm', lastTs: '80' }),
  ]);
  assert.equal(defaultConversationId(noUnread), 'dm'); // DM beats channel when nothing is unread

  assert.equal(defaultConversationId(buildSidebar([])), null);
});

test('channels with no timestamp sort last, not first (never opens an ancient channel)', () => {
  const s = buildSidebar([
    c({ id: 'stale', kind: 'channel' }), // no lastTs
    c({ id: 'active', kind: 'channel', lastTs: '500' }),
  ]);
  assert.deepEqual(s.channels.map((x) => x.id), ['active', 'stale']);
  assert.equal(defaultConversationId(s), 'active');
});
