'use client';

import { useRef, useState } from 'react';
import { streamMarvin } from '@/lib/marvin-client';
import { buildMarvinSystemBlocks } from '@/lib/context';
import { getSettings } from '@/lib/settings';
import {
  ingestMemory,
  proposeAdjustment,
  type AdjustmentTarget,
  type MemoryCategory,
} from '@/lib/memory';
import type { ChatMessage } from '@/lib/marvin-protocol';

/**
 * MARVIN chat — wired to the live sidecar runtime.
 *
 * The renderer composes the cache-friendly system blocks (base prompt + locked
 * rules + memories) and streams a turn from the sidecar. MARVIN's structured
 * proposals are routed straight into the human-in-the-loop queues:
 *  - propose_memory     → /memory "Proposed memories" (write-gate)
 *  - propose_adjustment → /memory "MARVIN wants to adjust itself"
 */

type Note = { id: number; text: string };

export function MarvinChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const noteId = useRef(0);

  const addNote = (text: string) =>
    setNotes((n) => [...n, { id: noteId.current++, text }]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setBusy(true);

    const model = getSettings().models.routine;
    const system = buildMarvinSystemBlocks(text);

    let assistant = '';
    const setAssistant = (t: string) =>
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: t };
        return next;
      });

    await streamMarvin({ model, system, messages: history }, (e) => {
      switch (e.type) {
        case 'text':
          assistant += e.text;
          setAssistant(assistant);
          break;
        case 'proposal':
          if (e.kind === 'memory') {
            ingestMemory({
              category: e.data.category as MemoryCategory,
              content: e.data.content,
              source: 'inferred',
              importance: e.data.importance,
            });
            addNote('MARVIN proposed a memory — review it on /memory.');
          } else {
            proposeAdjustment({
              target: e.data.target as AdjustmentTarget,
              rationale: e.data.rationale,
              proposed: e.data.proposed,
            });
            addNote('MARVIN proposed a self-adjustment — review it on /memory.');
          }
          break;
        case 'approval_request':
          addNote(`MARVIN wants to run "${e.tool}" — that needs your confirmation.`);
          break;
        case 'error':
          assistant += (assistant ? '\n\n' : '') + `⚠ ${e.message}`;
          setAssistant(assistant);
          break;
        case 'done':
          break;
      }
    });

    setBusy(false);
  };

  return (
    <div>
      {messages.length > 0 && (
        <div className="mb-3 space-y-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === 'user'
                  ? 'ml-auto max-w-[85%] rounded-xl bg-terracotta px-4 py-2 text-sm text-paper'
                  : 'mr-auto max-w-[85%] whitespace-pre-wrap rounded-xl border border-line bg-paper-card px-4 py-2 text-sm text-ink'
              }
            >
              {m.content || (busy && i === messages.length - 1 ? '…' : '')}
            </div>
          ))}
          {notes.map((n) => (
            <p key={n.id} className="text-xs text-ink-soft">
              {n.text}
            </p>
          ))}
        </div>
      )}

      <form
        className="flex items-center gap-3 rounded-xl border border-line bg-paper-card p-3 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Ask MARVIN"
          placeholder="Ask MARVIN…"
          disabled={busy}
          className="flex-1 bg-transparent px-2 text-sm text-ink outline-none placeholder:text-ink-soft disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || input.trim().length === 0}
          className="rounded-lg bg-terracotta px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-terracotta-dim disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
