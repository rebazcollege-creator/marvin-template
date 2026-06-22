'use client';

import { useRef, useState } from 'react';
import { streamMarvin, approveMarvin, extractLearnings } from '@/lib/marvin-client';
import { buildMarvinSystemBlocks } from '@/lib/context';
import { getSettings } from '@/lib/settings';
import { ensureStorageReady } from '@/lib/storage';
import {
  ingestMemory,
  proposeAdjustment,
  type AdjustmentTarget,
  type MemoryCategory,
} from '@/lib/memory';
import type { ChatMessage } from '@/lib/marvin-protocol';

/**
 * MARVIN chat — wired to the live sidecar runtime (token streaming + write
 * confirmation + post-session learning).
 *
 *  - text deltas stream in live.
 *  - propose_memory/propose_adjustment route into the /memory HITL queues.
 *  - approval_request shows an inline Approve/Reject card; the loop resumes on
 *    the user's decision (POST /approve).
 *  - "Save learnings" runs a background extraction pass over the chat.
 */

type Note = { id: number; text: string };
type Approval = { id: string; tool: string; reason: string };

export function MarvinChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const noteId = useRef(0);

  const addNote = (text: string) => setNotes((n) => [...n, { id: noteId.current++, text }]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    await ensureStorageReady();

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
          setApprovals((a) => [...a, { id: e.id, tool: e.tool, reason: e.reason }]);
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

  const decide = (id: string, approved: boolean) => {
    void approveMarvin(id, approved);
    setApprovals((a) => a.filter((x) => x.id !== id));
  };

  const saveLearnings = async () => {
    if (messages.length === 0) return;
    await ensureStorageReady();
    const model = getSettings().models.routine;
    const proposals = await extractLearnings(messages, model);
    proposals.forEach((p) =>
      ingestMemory({
        category: p.category as MemoryCategory,
        content: p.content,
        source: 'inferred',
        importance: p.importance,
      }),
    );
    addNote(
      proposals.length
        ? `Saved ${proposals.length} learning(s) — review on /memory.`
        : 'No new durable learnings found in this chat.',
    );
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

          {approvals.map((a) => (
            <div key={a.id} className="rounded-xl border border-amber bg-paper-card p-3 text-sm">
              <p className="text-ink">
                MARVIN wants to run <span className="font-medium">{a.tool}</span>. {a.reason}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => decide(a.id, true)}
                  className="rounded-lg bg-terracotta px-3 py-1 text-xs font-medium text-paper hover:bg-terracotta-dim"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => decide(a.id, false)}
                  className="rounded-lg border border-line px-3 py-1 text-xs text-ink-soft hover:text-ink"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}

          {notes.map((n) => (
            <p key={n.id} className="text-xs text-ink-soft">
              {n.text}
            </p>
          ))}

          {!busy && (
            <button
              type="button"
              onClick={() => void saveLearnings()}
              className="text-xs text-ink-soft underline-offset-2 hover:underline"
            >
              Save learnings from this chat
            </button>
          )}
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
