import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runAgentTurn,
  type CreateMessage,
  type LLMResponse,
  type TextBlock,
} from './agent.ts';
import type { ToolDef } from './tools.ts';
import type { ChatRequest, StreamEvent } from '../src/lib/marvin-protocol.ts';

const baseReq: ChatRequest = {
  model: 'claude-haiku-4-5',
  system: [{ type: 'text', text: 'You are MARVIN.', cache: true }],
  messages: [{ role: 'user', content: 'hello' }],
};

/** A CreateMessage that returns scripted responses and streams their text. */
function scripted(responses: LLMResponse[]): CreateMessage {
  let i = 0;
  return async (_params, onText) => {
    const r = responses[Math.min(i++, responses.length - 1)]!;
    for (const b of r.content) if (b.type === 'text') onText((b as TextBlock).text);
    return r;
  };
}

const writeTool = (onRun: () => void): ToolDef => ({
  name: 'send_email',
  description: 'Send an email.',
  input_schema: { type: 'object', properties: {} },
  kind: 'write',
  execute: async () => {
    onRun();
    return 'sent';
  },
});

test('plain answer: streams text then done', async () => {
  const events: StreamEvent[] = [];
  await runAgentTurn(
    baseReq,
    { createMessage: scripted([{ content: [{ type: 'text', text: 'Hi Rebaz.' }], stop_reason: 'end_turn' }]) },
    (e) => events.push(e),
  );
  assert.deepEqual(events.map((e) => e.type), ['text', 'done']);
});

test('propose_memory surfaces a proposal and the loop completes', async () => {
  const events: StreamEvent[] = [];
  await runAgentTurn(
    baseReq,
    {
      createMessage: scripted([
        { content: [{ type: 'tool_use', id: 't1', name: 'propose_memory', input: { category: 'preference', content: 'UK English.' } }], stop_reason: 'tool_use' },
        { content: [{ type: 'text', text: 'Noted.' }], stop_reason: 'end_turn' },
      ]),
    },
    (e) => events.push(e),
  );
  const proposal = events.find((e) => e.type === 'proposal');
  assert.equal(proposal?.type === 'proposal' && proposal.kind, 'memory');
  assert.equal(events.at(-1)?.type, 'done');
});

test('read tool executes and feeds a result back', async () => {
  let secondCall: unknown[] | null = null;
  let first = true;
  const create: CreateMessage = async (params) => {
    if (first) {
      first = false;
      return { content: [{ type: 'tool_use', id: 'r1', name: 'get_trello_cards', input: {} }], stop_reason: 'tool_use' };
    }
    secondCall = params.messages;
    return { content: [{ type: 'text', text: 'No cards.' }], stop_reason: 'end_turn' };
  };
  await runAgentTurn(baseReq, { createMessage: create }, () => {});
  assert.match(JSON.stringify(secondCall), /tool_result/);
  assert.match(JSON.stringify(secondCall), /not connected/i);
});

test('write tool executes only after approval', async () => {
  let ran = false;
  const events: StreamEvent[] = [];
  await runAgentTurn(
    baseReq,
    {
      createMessage: scripted([
        { content: [{ type: 'tool_use', id: 'w1', name: 'send_email', input: {} }], stop_reason: 'tool_use' },
        { content: [{ type: 'text', text: 'Sent.' }], stop_reason: 'end_turn' },
      ]),
      requestApproval: async () => true,
      tools: { send_email: writeTool(() => { ran = true; }) },
    },
    (e) => events.push(e),
  );
  assert.equal(ran, true, 'approved write tool should execute');
  assert.equal(events.at(-1)?.type, 'done');
});

test('write tool is NOT executed when rejected', async () => {
  let ran = false;
  await runAgentTurn(
    baseReq,
    {
      createMessage: scripted([
        { content: [{ type: 'tool_use', id: 'w1', name: 'send_email', input: {} }], stop_reason: 'tool_use' },
        { content: [{ type: 'text', text: 'Held.' }], stop_reason: 'end_turn' },
      ]),
      requestApproval: async () => false,
      tools: { send_email: writeTool(() => { ran = true; }) },
    },
    () => {},
  );
  assert.equal(ran, false, 'rejected write tool must not execute');
});
