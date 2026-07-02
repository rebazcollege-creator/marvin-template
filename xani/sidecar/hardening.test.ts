import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeHeader, encodeSubject, extractEmailAddress, replySubject, sanitizeRecipients } from './mail.ts';
import { originAllowed } from './security.ts';
import { evaluateAction } from './guard.ts';

test('sanitizeHeader strips CR/LF so a header value cannot inject another header', () => {
  assert.equal(sanitizeHeader('victim@example.com\r\nBcc: attacker@evil.com'), 'victim@example.com Bcc: attacker@evil.com');
  assert.equal(sanitizeHeader('plain@example.com'), 'plain@example.com');
  assert.equal(sanitizeHeader('  spaced  '), 'spaced');
  // Bare newline / tab variants are all collapsed.
  assert.ok(!sanitizeHeader('a\nb\r\nc\td').includes('\n'));
});

test('encodeSubject leaves ASCII alone and RFC 2047-encodes non-ASCII', () => {
  assert.equal(encodeSubject('Meeting at 3pm'), 'Meeting at 3pm');
  // Kurdish/Arabic/German subjects become a valid encoded-word, not mojibake.
  const enc = encodeSubject('Spür — سڵاو');
  assert.match(enc, /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
  assert.equal(Buffer.from(enc.slice('=?UTF-8?B?'.length, -2), 'base64').toString('utf8'), 'Spür — سڵاو');
});

test('encodeSubject also neutralises CR/LF before encoding', () => {
  assert.ok(!encodeSubject('Hi\r\nBcc: x@y.com').includes('\n'));
});

test('extractEmailAddress pulls the bare address from "Name <addr>" or a plain address', () => {
  assert.equal(extractEmailAddress('Rebaz Majeed <rebaz@leadstories.com>'), 'rebaz@leadstories.com');
  assert.equal(extractEmailAddress('someone@example.com'), 'someone@example.com');
  assert.equal(extractEmailAddress('"Doe, John" <john.doe@corp.co>'), 'john.doe@corp.co');
  assert.equal(extractEmailAddress('no address here'), '');
  // A CR/LF injection attempt yields at most one clean address, never a second header.
  assert.ok(!extractEmailAddress('a@b.com\r\nBcc: evil@x.com').includes('\n'));
});

test('sanitizeRecipients preserves multiple recipients and drops garbage', () => {
  assert.equal(sanitizeRecipients('a@b.com, Jane <jane@x.co>'), 'a@b.com, jane@x.co');
  assert.equal(sanitizeRecipients('solo@x.com'), 'solo@x.com');
  assert.equal(sanitizeRecipients('nonsense, also nonsense'), '');
  assert.ok(!sanitizeRecipients('a@b.com\r\nBcc: evil@x.com').includes('\n'));
});

test('replySubject adds Re: once and never doubles it', () => {
  assert.equal(replySubject('Invoice #42'), 'Re: Invoice #42');
  assert.equal(replySubject('Re: Invoice #42'), 'Re: Invoice #42');
  assert.equal(replySubject('RE: hello'), 'RE: hello');
});

test('originAllowed: app origins pass, unknown web origins are rejected', () => {
  assert.equal(originAllowed('http://localhost:3000'), true);
  assert.equal(originAllowed('tauri://localhost'), true);
  assert.equal(originAllowed('https://evil.example.com'), false);
  assert.equal(originAllowed('http://localhost:5173'), false);
});

test('originAllowed: a missing Origin is allowed (non-browser / same-origin)', () => {
  assert.equal(originAllowed(undefined), true);
  assert.equal(originAllowed(''), true);
  assert.equal(originAllowed(null), true);
});

test('keychain.rs INTEGRATION_KEYS matches the dev cred store ALLOW list', () => {
  // The packaged app injects creds from the Rust keychain; dev uses creds.ts. If
  // the lists drift, an integration silently vanishes in exactly the build that
  // matters (this happened: three Slack tokens were missing from keychain.rs).
  // Both files are parsed as text so the test has no import chain / side effects.
  const here = dirname(fileURLToPath(import.meta.url));
  const quotedKeys = (text: string, declMarker: string, openMarker: string) => {
    // Slice from the array literal's opening bracket (after the declaration) to its
    // close — the Rust type `&[&str]` contains a `]` that would end the slice early.
    const decl = text.indexOf(declMarker);
    const open = text.indexOf(openMarker, decl) + openMarker.length;
    const block = text.slice(open, text.indexOf(']', open));
    return new Set([...block.matchAll(/["']([A-Z][A-Z0-9_]+)["']/g)].map((m) => m[1]));
  };
  const rustKeys = quotedKeys(readFileSync(join(here, '../src-tauri/src/keychain.rs'), 'utf8'), 'INTEGRATION_KEYS', '= &[');
  const allowKeys = quotedKeys(readFileSync(join(here, 'creds.ts'), 'utf8'), 'ALLOW = new Set', 'Set([');
  // Model provider/toggle keys are config, not integration creds (the API key has its
  // own keychain entry; the CLI toggle isn't a secret) — exempt them from parity.
  const PROVIDER_KEYS = new Set(['ANTHROPIC_API_KEY', 'GOOGLE_AI_API_KEY', 'GEMINI_API_KEY', 'XANI_USE_CLAUDE_CLI']);
  const integrationAllow = [...allowKeys].filter((k) => !PROVIDER_KEYS.has(k));
  assert.ok(integrationAllow.length >= 20, 'sanity: parsed the ALLOW list');
  const missingInRust = integrationAllow.filter((k) => !rustKeys.has(k));
  const missingInAllow = [...rustKeys].filter((k) => !allowKeys.has(k));
  assert.deepEqual(missingInRust, [], `keys in creds.ts ALLOW but not keychain.rs: ${missingInRust.join(', ')}`);
  assert.deepEqual(missingInAllow, [], `keys in keychain.rs but not creds.ts ALLOW: ${missingInAllow.join(', ')}`);
});

test('guard rejects unknown action kinds and allows well-formed known ones', () => {
  assert.equal(evaluateAction({ kind: 'nope' } as never, 'user_approved').allowed, false);
  assert.equal(evaluateAction({ kind: 'slack', channel: 'C1', text: 'hi' }, 'user_approved').allowed, true);
  assert.equal(evaluateAction({ kind: 'email', to: 'a@b.com', subject: 'x', body: 'y' }, 'user_approved').allowed, true);
});

test('guard: day-off blocks assistant-initiated work but never a user-approved send', () => {
  const day = new Date('2026-07-05T10:00:00'); // a fixed local date
  const prev = process.env.XANI_DAYS_OFF;
  process.env.XANI_DAYS_OFF = String(day.getDay()); // mark that weekday as off
  const email = { kind: 'email', to: 'a@b.com', subject: 'x', body: 'y' } as const;
  assert.equal(evaluateAction(email, 'agent_proposed', day).allowed, false); // initiated → blocked
  assert.equal(evaluateAction(email, 'user_approved', day).allowed, true); // approved → allowed
  if (prev === undefined) delete process.env.XANI_DAYS_OFF;
  else process.env.XANI_DAYS_OFF = prev;
});

test('guard: with days-off disabled (default), initiated actions are allowed', () => {
  const prev = process.env.XANI_DAYS_OFF;
  delete process.env.XANI_DAYS_OFF;
  assert.equal(evaluateAction({ kind: 'slack', channel: 'C1', text: 'hi' }, 'agent_proposed').allowed, true);
  if (prev !== undefined) process.env.XANI_DAYS_OFF = prev;
});
