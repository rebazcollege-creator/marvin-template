import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeHeader, encodeSubject, extractEmailAddress, replySubject, sanitizeRecipients } from './mail.ts';
import { originAllowed } from './security.ts';

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
