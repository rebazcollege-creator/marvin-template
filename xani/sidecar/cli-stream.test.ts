import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretCliLine, CliStreamAccumulator } from './cli-stream.ts';

// Fixtures are real event shapes captured from `claude --output-format stream-json
// --include-partial-messages` (claude-code 2.1.x).
const textDelta = (t: string) =>
  JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } } });
const thinkingDelta = (t: string) =>
  JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: t } } });
const messageStart = JSON.stringify({ type: 'stream_event', event: { type: 'message_start', message: { usage: { input_tokens: 10 } } } });
const resultOk = (t: string) =>
  JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: t, usage: { output_tokens: 42 } });
const resultErr = JSON.stringify({ type: 'result', subtype: 'error', is_error: true, result: 'Please run /login' });

test('interpretCliLine extracts a text delta and ignores thinking', () => {
  assert.deepEqual(interpretCliLine(textDelta('hello')), { kind: 'text', text: 'hello' });
  assert.equal(interpretCliLine(thinkingDelta('scratchpad')), null); // never surface the model's thinking
  assert.equal(interpretCliLine(messageStart), null);
});

test('interpretCliLine tolerates blank and malformed lines', () => {
  assert.equal(interpretCliLine(''), null);
  assert.equal(interpretCliLine('   '), null);
  assert.equal(interpretCliLine('{"type":"stream_event", "event": {broken'), null);
});

test('accumulator streams text deltas in order and yields the full text', () => {
  const seen: string[] = [];
  const acc = new CliStreamAccumulator((t) => seen.push(t));
  acc.push(messageStart + '\n');
  acc.push(thinkingDelta('...') + '\n');
  acc.push(textDelta('alpha ') + '\n' + textDelta('beta ') + '\n');
  acc.push(textDelta('gamma') + '\n');
  acc.push(resultOk('alpha beta gamma') + '\n');
  acc.end();
  assert.deepEqual(seen, ['alpha ', 'beta ', 'gamma']); // thinking not streamed
  assert.equal(acc.finalText(), 'alpha beta gamma');
  assert.equal(acc.errored, null);
  assert.equal(acc.usage?.output_tokens, 42);
});

test('accumulator reassembles a line split across chunk boundaries', () => {
  const seen: string[] = [];
  const acc = new CliStreamAccumulator((t) => seen.push(t));
  const line = textDelta('spanned');
  acc.push(line.slice(0, 20)); // first half of the JSON, no newline yet
  acc.push(line.slice(20) + '\n'); // rest + newline
  acc.end();
  assert.deepEqual(seen, ['spanned']);
});

test('accumulator falls back to the result string when no deltas arrived', () => {
  // Simulates an older CLI / partial-messages off: only a terminal result line.
  const acc = new CliStreamAccumulator();
  acc.push(resultOk('final only') + '\n');
  acc.end();
  assert.equal(acc.finalText(), 'final only');
});

test('accumulator surfaces a model error (e.g. not logged in)', () => {
  const acc = new CliStreamAccumulator();
  acc.push(resultErr + '\n');
  acc.end();
  assert.equal(acc.errored, 'Please run /login');
});

test('accumulator prefers streamed text over the result echo (no doubling)', () => {
  const acc = new CliStreamAccumulator();
  acc.push(textDelta('streamed answer') + '\n');
  acc.push(resultOk('streamed answer') + '\n'); // result repeats the same text
  acc.end();
  assert.equal(acc.finalText(), 'streamed answer'); // not 'streamed answerstreamed answer'
});
