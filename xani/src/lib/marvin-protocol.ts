/**
 * Wire protocol shared by the renderer client and the Node sidecar.
 *
 * Types only — no logic, no imports — so the sidecar (plain Node) and the
 * renderer (Next) can both depend on it without dragging window-bound code
 * across the boundary.
 */

/** A cache-friendly system prompt segment (see context.ts builder). */
export interface SystemBlock {
  type: 'text';
  text: string;
  /** When true, the sidecar sets a prompt-cache breakpoint on this block. */
  cache: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** What the renderer POSTs to the sidecar's /chat endpoint. */
export interface ChatRequest {
  model: string;
  system: SystemBlock[];
  messages: ChatMessage[];
  maxTokens?: number;
}

/** A memory MARVIN proposes during a turn (lands in the /memory write-gate). */
export interface ProposedMemory {
  category: string;
  content: string;
  importance?: number;
}

/** A self-adjustment MARVIN proposes during a turn. */
export interface ProposedAdjustment {
  target: string;
  rationale: string;
  proposed: string;
}

/** Server-sent events streamed back over /chat. */
export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'proposal'; kind: 'memory'; data: ProposedMemory }
  | { type: 'proposal'; kind: 'adjustment'; data: ProposedAdjustment }
  | { type: 'approval_request'; id: string; tool: string; input: unknown; reason: string }
  | { type: 'error'; message: string }
  | {
      type: 'done';
      usage?: {
        input: number;
        output: number;
        cacheRead?: number;
        cacheWrite?: number;
      };
    };
