/**
 * Parser for the Claude Code CLI's `--output-format stream-json` event stream.
 *
 * The CLI emits one JSON object per line (JSONL). With --include-partial-messages
 * the assistant's text arrives incrementally as content_block_delta/text_delta
 * events — this is what lets Xanî stream MARVIN's answer token-by-token on the
 * user's logged-in subscription (no API key), instead of the old cold-spawn
 * `--output-format json` that returned one blob after 5–20s of blank screen.
 *
 * This module is PURE (no process/IO) so the event handling is unit-tested against
 * captured fixtures. Event shapes verified against claude-code 2.1.x:
 *   {type:'stream_event', event:{type:'content_block_delta',
 *     delta:{type:'text_delta', text:'…'}}}                      → streamed text
 *   {type:'stream_event', event:{type:'message_start',
 *     message:{usage:{…}}}}                                       → usage
 *   {type:'assistant', message:{content:[{type:'text',text}]}}    → full msg (fallback)
 *   {type:'result', subtype:'success', result:'…', is_error, usage} → final
 * Thinking deltas (delta.type==='thinking_delta') are intentionally ignored — the
 * user sees the answer, not the model's scratchpad.
 */

export interface CliUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export type CliSignal =
  | { kind: 'text'; text: string } // a text delta to stream to the UI
  | { kind: 'assistant'; text: string } // a complete assistant message (non-partial fallback)
  | { kind: 'result'; text: string; isError: boolean; usage?: CliUsage } // terminal event
  | null; // anything else (thinking, hooks, system, tool events) — ignored here

function textFromContent(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((b) => {
      const blk = b as { type?: string; text?: string };
      return blk?.type === 'text' ? blk.text ?? '' : '';
    })
    .join('');
}

function usageOf(u: unknown): CliUsage | undefined {
  if (!u || typeof u !== 'object') return undefined;
  const x = u as CliUsage;
  return {
    input_tokens: x.input_tokens,
    output_tokens: x.output_tokens,
    cache_read_input_tokens: x.cache_read_input_tokens,
    cache_creation_input_tokens: x.cache_creation_input_tokens,
  };
}

/** Interpret one already-parsed CLI event object into a normalized signal (or null). */
export function interpretCliEvent(j: unknown): CliSignal {
  if (!j || typeof j !== 'object') return null;
  const ev = j as { type?: string; event?: unknown; message?: unknown; result?: unknown; is_error?: boolean; subtype?: string; usage?: unknown };

  if (ev.type === 'stream_event') {
    const inner = ev.event as { type?: string; delta?: { type?: string; text?: string } } | undefined;
    if (inner?.type === 'content_block_delta' && inner.delta?.type === 'text_delta') {
      return { kind: 'text', text: inner.delta.text ?? '' };
    }
    return null; // message_start / thinking / content_block_start / stop — not surfaced
  }

  if (ev.type === 'assistant') {
    const msg = ev.message as { content?: unknown } | undefined;
    return { kind: 'assistant', text: textFromContent(msg?.content) };
  }

  if (ev.type === 'result') {
    const text = typeof ev.result === 'string' ? ev.result : '';
    return { kind: 'result', text, isError: Boolean(ev.is_error) || ev.subtype === 'error', usage: usageOf(ev.usage) };
  }

  return null;
}

/** Parse one raw JSONL line into a signal. Malformed/partial lines yield null. */
export function interpretCliLine(line: string): CliSignal {
  const s = line.trim();
  if (!s) return null;
  let j: unknown;
  try {
    j = JSON.parse(s);
  } catch {
    return null; // a line split mid-object across chunks — the buffer keeps the remainder
  }
  return interpretCliEvent(j);
}

/**
 * Accumulator that turns the raw stdout stream into (a) streamed text via onText
 * and (b) the final full text + usage. Handles chunk boundaries that split a line.
 */
export class CliStreamAccumulator {
  private buf = '';
  private streamed = ''; // concatenated text_delta output
  private assistantText = ''; // last complete assistant message (fallback)
  private resultText = ''; // terminal result string (fallback)
  private error: string | null = null;
  private readonly onText?: (t: string) => void;
  usage: CliUsage | undefined;

  // Explicit field assignment — Node's type-strip runner rejects TS parameter properties.
  constructor(onText?: (t: string) => void) {
    this.onText = onText;
  }

  /** Feed a raw stdout chunk. Emits onText for each streamed text delta. */
  push(chunk: string): void {
    this.buf += chunk;
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      this.consume(line);
    }
  }

  /** Flush any trailing partial line at stream end. */
  end(): void {
    if (this.buf.trim()) this.consume(this.buf);
    this.buf = '';
  }

  private consume(line: string): void {
    const sig = interpretCliLine(line);
    if (!sig) return;
    if (sig.kind === 'text') {
      this.streamed += sig.text;
      if (sig.text) this.onText?.(sig.text);
    } else if (sig.kind === 'assistant') {
      this.assistantText = sig.text;
    } else if (sig.kind === 'result') {
      this.resultText = sig.text;
      if (sig.usage) this.usage = sig.usage;
      if (sig.isError) this.error = sig.text || 'the model reported an error';
    }
  }

  get errored(): string | null {
    return this.error;
  }

  /** Best available final text: streamed deltas → complete assistant msg → result string. */
  finalText(): string {
    return (this.streamed || this.assistantText || this.resultText).trim();
  }
}
