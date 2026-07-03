#!/usr/bin/env node
/**
 * Trello capability diagnostic — READ-ONLY. Tells you EXACTLY why Trello is or
 * isn't connecting: which of the three required values is missing, or what the
 * Trello API says about the ones you entered. No writes. Never prints the secrets.
 *
 * Run from the xani/ directory (after connecting Trello in the app):
 *   node scripts/trello-diagnostic.mjs
 *
 * Reads TRELLO_API_KEY / TRELLO_TOKEN / TRELLO_BOARD_ID from .xani-creds.json
 * (what the app writes) or from the matching env vars.
 */
import { readFileSync, existsSync } from 'node:fs';

const creds = existsSync('.xani-creds.json') ? JSON.parse(readFileSync('.xani-creds.json', 'utf8')) : {};
const pick = (k) => process.env[k] || creds[k];

const key = pick('TRELLO_API_KEY');
const token = pick('TRELLO_TOKEN');
const board = pick('TRELLO_BOARD_ID');

const mask = (v) => (v ? `present (…${String(v).slice(-4)})` : 'MISSING');
console.log('Trello credentials found:');
console.log(`  TRELLO_API_KEY:  ${mask(key)}`);
console.log(`  TRELLO_TOKEN:    ${mask(token)}`);
console.log(`  TRELLO_BOARD_ID: ${board ? `present (${board})` : 'MISSING'}`);

const missing = [
  !key && 'TRELLO_API_KEY',
  !token && 'TRELLO_TOKEN',
  !board && 'TRELLO_BOARD_ID',
].filter(Boolean);

if (missing.length) {
  console.log(`\n❌ NOT CONNECTED — missing: ${missing.join(', ')}.`);
  console.log('   Fix: open the app → Connections → Trello → fill in ALL THREE fields.');
  console.log('   • API key + token: https://trello.com/power-ups/admin (create a Power-Up, then "API key", then generate a Token).');
  console.log('   • Board ID: open your board in the browser; it\'s the code in the URL (trello.com/b/<BOARD_ID>/...).');
  process.exit(0);
}

const auth = `key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`;

async function tryApi(label, url) {
  try {
    const r = await fetch(url);
    const body = await r.text();
    return { label, status: r.status, ok: r.ok, body };
  } catch (e) {
    return { label, status: 0, ok: false, body: String(e?.message ?? e) };
  }
}

console.log('\nAll three present — testing against the real Trello API…');

// 1) Are the key + token themselves valid? (tokens/me is the cleanest auth check)
const me = await tryApi('auth (key+token)', `https://api.trello.com/1/members/me?fields=username&${auth}`);
if (!me.ok) {
  console.log(`\n❌ KEY/TOKEN REJECTED — Trello returned ${me.status}.`);
  console.log(`   ${me.body.slice(0, 200)}`);
  if (me.status === 401) console.log('   → 401 means the API key and/or token is wrong or expired. Regenerate the token and re-enter both in Connections.');
  process.exit(0);
}
const who = (() => { try { return JSON.parse(me.body).username; } catch { return '(unknown)'; } })();
console.log(`  ✓ key + token are valid — authenticated as "${who}".`);

// 2) Can this token see the specific board?
const b = await tryApi('board', `https://api.trello.com/1/boards/${encodeURIComponent(board)}?fields=name&${auth}`);
if (!b.ok) {
  console.log(`\n❌ BOARD NOT ACCESSIBLE — Trello returned ${b.status} for board "${board}".`);
  console.log(`   ${b.body.slice(0, 200)}`);
  if (b.status === 401 || b.status === 404) {
    console.log('   → The key+token are valid, but this account can\'t open that board ID.');
    console.log('     Either the Board ID is wrong, or the token\'s account isn\'t a member of that board.');
    console.log('     Fix: double-check the Board ID from the board\'s URL, and make sure you generated the token on the account that owns the board.');
  }
  process.exit(0);
}
const boardName = (() => { try { return JSON.parse(b.body).name; } catch { return '(unknown)'; } })();

// 3) Cards — the actual thing the app fetches.
const cards = await tryApi('cards', `https://api.trello.com/1/boards/${encodeURIComponent(board)}/cards?fields=name&${auth}`);
const cardCount = (() => { try { return JSON.parse(cards.body).length; } catch { return '?'; } })();

console.log(`  ✓ board "${boardName}" is accessible — ${cardCount} card(s) visible.`);
console.log('\n✅ TRELLO IS FULLY CONNECTED. If the app still shows "not connected", make sure the app is');
console.log('   running the latest code (git pull) and restart it so the sidecar re-reads your credentials.');
