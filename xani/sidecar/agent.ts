import { TOOLS_BY_NAME, apiTools } from './tools.ts';
import type {
  ChatRequest,
  StreamEvent,
  ProposedMemory,
  ProposedAdjustment,
} from '../src/lib/marvin-protocol.ts';

/**
 * MARVIN's agent turn: the canonical manual tool loop.
 *
 *   create message → if stop_reason==='tool_use', run tools, append results,
 *   repeat → else done.
 *
 * The LLM call is injected (`createMessage`) so the loop is unit-testable
 * without a network/key. The server passes a thin wrapper over the Anthropic
 * SDK's messages.create.
 *
 * Enforcement happens HERE, not in the prompt:
 *   - proposal tools surface to the user (never auto-applied),
 *   - any other write tool blocks on confirmation (none live yet),
 *   - read tools execute and feed results back.
 */

// Minimal structural types for the Anthropic message shape we rely on.
export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}
export interface TextBlock {
  type: 'text';
  text: string;
}
export type ContentBlock = TextBlock | ToolUseBlock | { type: string; [k: string]: unknown };

export interface LLMResponse {
  content: ContentBlock[];
  stop_reason: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

export interface CreateParams {
  model: string;
  max_tokens: number;
  system: { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[];
  tools: ReturnType<typeof apiTools>;
  messages: unknown[];
}

export type CreateMessage = (params: CreateParams) => Promise<LLMResponse>;

const MAX_ITERATIONS = 8; // safety bound on the tool loop

export async function runAgentTurn(
  req: ChatRequest,
  createMessage: CreateMessage,
  emit: (e: StreamEvent) => void,
): Promise<void> {
  // Map cache-flagged system blocks to Anthropic's cache_control breakpoints.
  const system = req.system.map((b) => ({
    type: 'text' as const,
    text: b.text,
    ...(b.cache ? { cache_control: { type: 'ephemeral' as const } } : {}),
  }));

  const messages: unknown[] = req.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let totalIn = 0;
  let totalOut = 0;
  let cacheRead = 0;
  let cacheWrite = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await createMessage({
      model: req.model,
      max_tokens: req.maxTokens ?? 1024,
      system,
      tools: apiTools(),
      messages,
    });

    totalIn += res.usage?.input_tokens ?? 0;
    totalOut += res.usage?.output_tokens ?? 0;
    cacheRead += res.usage?.cache_read_input_tokens ?? 0;
    cacheWrite += res.usage?.cache_creation_input_tokens ?? 0;

    messages.push({ role: 'assistant', content: res.content });

    for (const block of res.content) {
      if (block.type === 'text' && typeof (block as TextBlock).text === 'string') {
        emit({ type: 'text', text: (block as TextBlock).text });
      }
    }

    if (res.stop_reason !== 'tool_use') break;

    const toolResults: {
      type: 'tool_result';
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    }[] = [];

    for (const block of res.content) {
      if (block.type !== 'tool_use') continue;
      const tu = block as ToolUseBlock;
      const tool = TOOLS_BY_NAME[tu.name];

      if (!tool) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: `Unknown tool: ${tu.name}`,
          is_error: true,
        });
        continue;
      }

      // Proposal tools: surface to the user; never auto-apply.
      if (tool.proposal === 'memory') {
        emit({ type: 'proposal', kind: 'memory', data: tu.input as unknown as ProposedMemory });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: 'Recorded as a proposed memory for the user to review on /memory.',
        });
        continue;
      }
      if (tool.proposal === 'adjustment') {
        emit({
          type: 'proposal',
          kind: 'adjustment',
          data: tu.input as unknown as ProposedAdjustment,
        });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: 'Recorded as a proposed self-adjustment for the user to review.',
        });
        continue;
      }

      // Outward write tools: block on confirmation (no live write tools yet).
      if (tool.kind === 'write') {
        emit({
          type: 'approval_request',
          id: tu.id,
          tool: tu.name,
          input: tu.input,
          reason: 'Outward action requires explicit user confirmation.',
        });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: 'Not executed — awaiting user confirmation.',
        });
        continue;
      }

      // Read tools: execute and feed results back.
      try {
        const out = tool.execute ? await tool.execute(tu.input) : '{}';
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
      } catch (err) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: `Tool error: ${(err as Error).message}`,
          is_error: true,
        });
      }
    }

    messages.push({ role: 'user', content: toolResults });
  }

  emit({
    type: 'done',
    usage: { input: totalIn, output: totalOut, cacheRead, cacheWrite },
  });
}
