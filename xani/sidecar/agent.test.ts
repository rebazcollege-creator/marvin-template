import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAgentTurn, type CreateMessage, type LLMResponse } from './agent.ts';
import type { ChatRequest, StreamEvent } from '../src/lib/marvin-protocol.ts';

const baseReq: ChatRequest = {
  model: 'claude-haiku-4-5',
  system: [{ type: 'text', text: 'You are MARVIN.', cache: true }],
  messages: [{ role: 'user', content: 'hello' }],
};

/** Build a CreateMessage that returns scripted responses, one per call. */
function scripted(responses: LLMResponse[]): CreateMessage {
  let i = 0;
  return async () => responses[Math.min(i++, responses.length - 1)]!;
}

test('plain answer: emits text then done', async () => {
  const events: StreamEvent[] = [];
  await runAgentTurn(
    baseReq,
    scripted([
      { content: [{ type: 'text', text: 'Hi Rebaz.' }], stop_reason: 'end_turn' },
    ]),
    (e) => events.push(e),
  );
  assert.deepEqual(
    events.map((e) => e.type),
    ['text', 'done'],
  );
  const text = events.find((e) => e.type === 'text');
  assert.equal(text?.type === 'text' && text.text, 'Hi Rebaz.');
});

test('propose_memory surfaces a proposal and loop continues to completion', async () => {
  const events: StreamEvent[] = [];
  await runAgentTurn(
    baseReq,
    scripted([
      {
        content: [
          {
            type: 'tool_use',
            id: 't1',
            name: 'propose_memory',
            input: { category: 'preference', content: 'Prefers UK English.' },
          },
        ],
        stop_reason: 'tool_use',
      },
      { content: [{ type: 'text', text: 'Noted.' }], stop_reason: 'end_turn' },
    ]),
    (e) => events.push(e),
  );
  const proposal = events.find((e) => e.type === 'proposal');
  assert.ok(proposal, 'a proposal event should be emitted');
  assert.equal(proposal?.type === 'proposal' && proposal.kind, 'memory');
  assert.equal(events.at(-1)?.type, 'done');
});

test('read tool executes and feeds a result back', async () => {
  let secondCallMessages: unknown[] | null = null;
  const create: CreateMessage = async (params) => {
    if (secondCallMessages === null) {
      secondCallMessages = params.messages; // first call
      return {
        content: [{ type: 'tool_use', id: 'r1', name: 'get_trello_cards', input: {} }],
        stop_reason: 'tool_use',
      };
    }
    secondCallMessages = params.messages; // second call sees the tool_result
    return { content: [{ type: 'text', text: 'No cards.' }], stop_reason: 'end_turn' };
  };

  const events: StreamEvent[] = [];
  await runAgentTurn(baseReq, create, (e) => events.push(e));

  const serialized = JSON.stringify(secondCallMessages);
  assert.match(serialized, /tool_result/);
  assert.match(serialized, /not connected/i);
  assert.equal(events.at(-1)?.type, 'done');
});

test('outward write tool is gated, not executed', async () => {
  // A hypothetical future write tool the model tries to call directly.
  const events: StreamEvent[] = [];
  await runAgentTurn(
    baseReq,
    scripted([
      {
        content: [{ type: 'tool_use', id: 'w1', name: 'send_email', input: { to: 'x' } }],
        stop_reason: 'tool_use',
      },
      { content: [{ type: 'text', text: 'Held for confirmation.' }], stop_reason: 'end_turn' },
    ]),
    (e) => events.push(e),
  );
  // Unknown-but-not-registered tools are reported as errors back to the model;
  // registered write tools would emit approval_request. Either way: never executed.
  assert.ok(events.every((e) => e.type !== 'proposal'));
  assert.equal(events.at(-1)?.type, 'done');
});
