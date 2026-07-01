'use client';

import { useEffect, useRef, useState } from 'react';
import { streamMarvin, approveMarvin, extractLearnings } from '@/lib/marvin-client';
import { buildMarvinSystemBlocks } from '@/lib/context';
import { getSettings } from '@/lib/settings';
import { ensureStorageReady } from '@/lib/storage';
import { listChats, getChat, saveChat, newChatId, type Chat } from '@/lib/chats';
import {
  ingestMemory,
  proposeAdjustment,
  type AdjustmentTarget,
  type MemoryCategory,
} from '@/lib/memory';
import type { ChatMessage } from '@/lib/marvin-protocol';

/**
 * MARVIN chat — live runtime (token streaming + write confirmation + post-session
 * learning), with persistent history.
 *
 *  - text deltas stream in live.
 *  - propose_memory/propose_adjustment route into the /memory HITL queues.
 *  - approval_request shows an inline Approve/Reject card; the loop resumes on
 *    the user's decision (POST /approve).
 *  - conversations persist (chats.ts) and survive restarts; New chat + recent.
 */

type Note = { id: number; text: string };
type Approval = { id: string; tool: string; reason: string };

const SUGGESTIONS = [
  'What needs me today?',
  'Draft a reply to my latest email',
  'Summarise my unread Slack',
  'Schedule focus time tomorrow morning',
  'Fact-check a claim for me',
];

export function MarvinChat() {
  const [chatId, setChatId] = useState('');
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const noteId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ensureStorageReady().then(() => {
      const recent = listChats();
      setChats(recent);
      if (recent[0]) {
        setChatId(recent[0].id);
        setMessages(recent[0].messages);
      } else {
        setChatId(newChatId());
      }
    });
  }, []);

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener('xani:ask-focus', focus);
    return () => window.removeEventListener('xani:ask-focus', focus);
  }, []);

  const addNote = (text: string) => setNotes((n) => [...n, { id: noteId.current++, text }]);

  const persist = (id: string, msgs: ChatMessage[]) => {
    saveChat(id, msgs);
    setChats(listChats());
  };

  const newChat = () => {
    setChatId(newChatId());
    setMessages([]);
    setNotes([]);
    setApprovals([]);
  };

  const switchChat = (id: string) => {
    const c = getChat(id);
    if (!c) return;
    setChatId(c.id);
    setMessages(c.messages);
    setNotes([]);
    setApprovals([]);
  };

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
    persist(chatId, [...history, { role: 'assistant', content: assistant }]);
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

  const recent = chats.filter((c) => c.id !== chatId).slice(0, 4);

  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <button
          type="button"
          onClick={newChat}
          className="text-xs text-ink-soft underline-offset-2 hover:underline"
        >
          New chat
        </button>
        {recent.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => switchChat(c.id)}
            title={c.title}
            className="max-w-40 truncate text-xs text-ink-soft underline-offset-2 hover:text-terracotta hover:underline"
          >
            {c.title}
          </button>
        ))}
      </div>

      {messages.length > 0 && (
        <div className="mb-3 space-y-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === 'user'
                  ? 'ml-auto max-w-[85%] rounded-xl bg-accent px-4 py-2 text-sm text-on-accent'
                  : 'mr-auto max-w-[85%] whitespace-pre-wrap rounded-xl border border-border bg-surface px-4 py-2 text-sm text-text'
              }
            >
              {m.content || (busy && i === messages.length - 1 ? '…' : '')}
            </div>
          ))}

          {approvals.map((a) => (
            <div key={a.id} className="rounded-xl border border-accent bg-surface p-3 text-sm">
              <p className="text-text">
                MARVIN wants to run <span className="font-medium">{a.tool}</span>. {a.reason}
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => decide(a.id, true)}
                  className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-on-accent hover:bg-accent-dim"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => decide(a.id, false)}
                  className="rounded-lg border border-border px-3 py-1 text-xs text-text-2 hover:text-text"
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
        className="rounded-[22px] border border-border bg-surface px-4 pb-3 pt-4 shadow-[0_10px_34px_-16px_rgba(31,31,29,.18)]"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Ask Xanî"
          placeholder="Ask Xanî to draft, fact-check, schedule — or just talk…"
          disabled={busy}
          className="w-full bg-transparent px-1 pb-3 text-[15px] text-text outline-none placeholder:text-muted disabled:opacity-60"
        />
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled
            title="Attachments — coming soon"
            aria-label="Attach (coming soon)"
            className="grid h-9 w-9 cursor-not-allowed place-items-center rounded-[10px] border border-border text-text-2 opacity-50"
          >
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M10 5v10M5 10h10" /></svg>
          </button>
          <div className="flex-1" />
          <button
            type="button"
            disabled
            title="Voice — coming soon"
            aria-label="Voice (coming soon)"
            className="grid h-[38px] w-[38px] cursor-not-allowed place-items-center rounded-full border border-border text-text-2 opacity-50"
          >
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="7.5" y="2.5" width="5" height="9" rx="2.5" /><path d="M5 9.5a5 5 0 0 0 10 0M10 14.5v3" /></svg>
          </button>
          <button
            type="submit"
            disabled={busy || input.trim().length === 0}
            title="Send"
            aria-label="Send"
            className="grid h-[38px] w-[38px] place-items-center rounded-full bg-accent text-on-accent transition-colors hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? (
              <span className="text-sm">…</span>
            ) : (
              <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 10h11M10 5.5 14.5 10 10 14.5" /></svg>
            )}
          </button>
        </div>
      </form>

      {messages.length === 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setInput(s);
                inputRef.current?.focus();
              }}
              className="rounded-full border border-border bg-surface px-4 py-2 text-[12.5px] font-medium text-text-2 transition-colors hover:bg-hover"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
