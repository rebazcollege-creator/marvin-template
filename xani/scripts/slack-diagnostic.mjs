#!/usr/bin/env node
/**
 * Slack capability diagnostic — READ-ONLY. Proves what each connected token can
 * and cannot do, against real Slack responses. No writes, no posting. Prints
 * evidence only, never the tokens themselves.
 *
 * Run from the xani/ directory (after connecting your workspaces in the app):
 *   node scripts/slack-diagnostic.mjs
 *
 * It reads tokens from .xani-creds.json (what the app writes) or from the
 * SLACK_*_BOT_TOKEN / SLACK_*_USER_TOKEN env vars.
 */
import { readFileSync, existsSync } from 'node:fs';

const creds = existsSync('.xani-creds.json') ? JSON.parse(readFileSync('.xani-creds.json', 'utf8')) : {};
const pick = (k) => process.env[k] || creds[k];

const TOKENS = [
  { label: 'The Amargi (bot)', token: pick('SLACK_AMARGI_BOT_TOKEN') },
  { label: 'The Amargi (user)', token: pick('SLACK_AMARGI_USER_TOKEN') },
  { label: 'LeadStories (bot)', token: pick('SLACK_LEADSTORIES_BOT_TOKEN') },
  { label: 'LeadStories (user)', token: pick('SLACK_LEADSTORIES_USER_TOKEN') },
].filter((t) => t.token);

async function call(token, method, params = {}) {
  const url = `https://slack.com/api/${method}?${new URLSearchParams(params)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

if (TOKENS.length === 0) {
  console.log('No Slack tokens found. Connect a workspace in the app first, or set SLACK_*_BOT_TOKEN env vars.');
  process.exit(0);
}

for (const { label, token } of TOKENS) {
  const kind = token.startsWith('xoxb') ? 'BOT (xoxb)' : token.startsWith('xoxp') ? 'USER (xoxp)' : 'unknown';
  console.log(`\n========== ${label} — token type: ${kind} ==========`);

  // 1) Identity + granted scopes (scopes come back in a response header).
  const auth = await call(token, 'auth.test');
  if (!auth.ok) { console.log(`  auth.test FAILED: ${auth.error}`); continue; }
  console.log(`  identity: ${auth.user} (${auth.user_id}) on ${auth.team}`);

  // 2) Channels the token can see / is a member of.
  const ch = await call(token, 'conversations.list', { types: 'public_channel,private_channel', exclude_archived: 'true', limit: '1000' });
  const chans = ch.channels ?? [];
  const member = chans.filter((c) => c.is_member);
  console.log(`  channels visible: ${chans.length} | bot/user is a member of: ${member.length}`);
  if (ch.error) console.log(`  conversations.list error: ${ch.error}`);

  // 3) THE UNREAD QUESTION: does conversations.info return read-state for this token?
  if (member[0]) {
    const info = await call(token, 'conversations.info', { channel: member[0].id });
    const c = info.channel ?? {};
    const has = (k) => (k in c ? `present (=${JSON.stringify(c[k])})` : 'ABSENT');
    console.log(`  conversations.info on #${member[0].name}:`);
    console.log(`     last_read:            ${has('last_read')}`);
    console.log(`     unread_count:         ${has('unread_count')}`);
    console.log(`     unread_count_display: ${has('unread_count_display')}`);
    console.log('     → Slack returns unread_count ONLY for DMs, never for channels — ABSENT here is expected.');
    console.log('       For channels, unread is computed from last_read vs message ts (which is what Xanî now does).');
  }

  // 4) THE DM QUESTION: can this token see your direct messages?
  const ims = await call(token, 'conversations.list', { types: 'im,mpim', limit: '1000' });
  if (ims.ok) console.log(`  DMs/group-DMs visible: ${(ims.channels ?? []).length}  (bot tokens typically see ~0 of YOUR DMs)`);
  else console.log(`  conversations.list(im,mpim) error: ${ims.error}`);

  // 5) THE PAGINATION / RATE-TIER QUESTION: how many messages per request, and is there a cursor?
  if (member[0]) {
    const hist = await call(token, 'conversations.history', { channel: member[0].id, limit: '200' });
    if (hist.ok) {
      const n = (hist.messages ?? []).length;
      const cursor = hist.response_metadata?.next_cursor ? 'yes' : 'no';
      console.log(`  conversations.history limit=200 → returned ${n} messages | next_cursor: ${cursor}`);
      console.log(n <= 15
        ? '     → capped at ~15 ⇒ this app is on the NEW non-Marketplace rate tier (1 req/min). Bulk history will be SLOW.'
        : '     → returned >15 ⇒ this app is on the INTERNAL/exempt tier. Full history pagination is fast.');
    } else {
      console.log(`  conversations.history error: ${hist.error}`);
    }
  }
}
console.log('\nDone. This script made only read calls. Paste the full output back.');
