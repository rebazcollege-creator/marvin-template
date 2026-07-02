import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBatchResponse } from './connectors.ts';

// A realistic Gmail batch reply: quoted boundary in the Content-Type, each part
// wrapping an HTTP response whose body is one JSON object.
const BOUNDARY = 'batch_abc-123';
const body =
  `--${BOUNDARY}\r\nContent-Type: application/http\r\n\r\nHTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n` +
  `{"id":"m1","snippet":"hello","labelIds":["INBOX","UNREAD"]}\r\n` +
  `--${BOUNDARY}\r\nContent-Type: application/http\r\n\r\nHTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n` +
  `{"id":"m2","snippet":"world"}\r\n` +
  `--${BOUNDARY}--`;

test('parses every part of a well-formed batch response (quoted boundary)', () => {
  const out = parseBatchResponse(`multipart/mixed; boundary="${BOUNDARY}"`, body);
  assert.equal(out.length, 2);
  assert.equal(out[0]?.id, 'm1');
  assert.equal(out[1]?.id, 'm2');
});

test('parses with an unquoted boundary too', () => {
  const out = parseBatchResponse(`multipart/mixed; boundary=${BOUNDARY}`, body);
  assert.equal(out.length, 2);
});

test('skips a malformed part without losing the good ones', () => {
  const broken =
    `--${BOUNDARY}\r\n\r\n{"id":"ok1"}\r\n` +
    `--${BOUNDARY}\r\n\r\n{not json at all\r\n` +
    `--${BOUNDARY}\r\n\r\n{"id":"ok2"}\r\n--${BOUNDARY}--`;
  const out = parseBatchResponse(`multipart/mixed; boundary=${BOUNDARY}`, broken);
  assert.deepEqual(out.map((o) => o.id), ['ok1', 'ok2']);
});

test('garbage input yields an empty list, never a throw', () => {
  assert.deepEqual(parseBatchResponse('', ''), []);
  assert.deepEqual(parseBatchResponse('text/plain', 'no json here'), []);
});
