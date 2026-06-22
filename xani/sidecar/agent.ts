import { TOOLS_BY_NAME, toApiTools, type ToolDef } from './tools.ts';
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
 * The LLM call and the approval prompt are injected so the loop is fully
 * unit-testable without a network/key.
 *
 * Enforcement happens HERE, not in the prompt:
 *   - proposal tools surface to the user (never auto-applied),
 *   - any other write tool BLOCKS on user confirmation (requestApproval); on
 *     approve it executes (if it has an executor), on reject it is not run,
 *   - read tools execute and feed results back.
 */

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
  tools: ReturnType<typeof toApiTools>;
  messages: unknown[];
}

/** createMessage streams text via onText as it arrives, and returns the final message. */
export type CreateMessage = (
  params: CreateParams,
  onText: (delta: string) => void,
) => Promise<LLMResponse>;

export interface ApprovalRequest {
  id: string;
  tool: string;
  input: unknown;
}

export interface AgentDeps {
  createMessage: CreateMessage;
  /** Resolve true to approve an outward write, false to reject. */
  requestApproval?: (a: ApprovalRequest) => Promise<boolean>;
  /** Override the tool registry (used by tests). */
  tools?: Record<string, ToolDef>;
}

const MAX_ITERATIONS = 8;

export async function runAgentTurn(
  req: ChatRequest,
  deps: AgentDeps,
  emit: (e: StreamEvent) => void,
): Promise<void> {
  const tools = deps.tools ?? TOOLS_BY_NAME;
  const apiToolList = toApiTools(Object.values(tools));

  const system = req.system.map((b) => ({
    type: 'text' as const,
    text: b.text,
    ...(b.cache ? { cache_control: { type: 'ephemeral' as const } } : {}),
  }));

  const messages: unknown[] = req.messages.map((m) => ({ role: m.role, content: m.content }));

  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await deps.createMessage(
      { model: req.model, max_tokens: req.maxTokens ?? 1024, system, tools: apiToolList, messages },
      (delta) => emit({ type: 'text', text: delta }),
    );

    usage.input += res.usage?.input_tokens ?? 0;
    usage.output += res.usage?.output_tokens ?? 0;
    usage.cacheRead += res.usage?.cache_read_input_tokens ?? 0;
    usage.cacheWrite += res.usage?.cache_creation_input_tokens ?? 0;

    messages.push({ role: 'assistant', content: res.content });

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
      const tool = tools[tu.name];

      if (!tool) {
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: `Unknown tool: ${tu.name}`, is_error: true });
        continue;
      }

      if (tool.proposal === 'memory') {
        emit({ type: 'proposal', kind: 'memory', data: tu.input as unknown as ProposedMemory });
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: 'Recorded as a proposed memory for the user to review on /memory.' });
        continue;
      }
      if (tool.proposal === 'adjustment') {
        emit({ type: 'proposal', kind: 'adjustment', data: tu.input as unknown as ProposedAdjustment });
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: 'Recorded as a proposed self-adjustment for the user to review.' });
        continue;
      }

      // Outward write tool → confirmation gate.
      if (tool.kind === 'write') {
        const approved = deps.requestApproval
          ? await deps.requestApproval({ id: tu.id, tool: tu.name, input: tu.input })
          : (emit({ type: 'approval_request', id: tu.id, tool: tu.name, input: tu.input, reason: 'Outward action requires explicit user confirmation.' }), false);

        if (!approved) {
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: 'Not executed — the user did not approve this action.' });
          continue;
        }
        try {
          const out = tool.execute ? await tool.execute(tu.input) : 'Approved, but no executor is wired for this tool yet.';
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
        } catch (err) {
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: `Tool error: ${(err as Error).message}`, is_error: true });
        }
        continue;
      }

      // Read tool.
      try {
        const out = tool.execute ? await tool.execute(tu.input) : '{}';
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: out });
      } catch (err) {
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: `Tool error: ${(err as Error).message}`, is_error: true });
      }
    }

    messages.push({ role: 'user', content: toolResults });
  }

  emit({ type: 'done', usage });
}
