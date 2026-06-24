'use client';

import { useState } from 'react';
import { fetchInbox, PATHS } from '@/lib/marvin-data';
import { useLiveData } from '@/lib/use-live-data';
import type { InboxData } from '@/lib/marvin-protocol';
import { Modal } from '@/components/ui/Modal';
import { ComposeModal } from '@/components/inbox/ComposeModal';

type Msg = InboxData['messages'][number];

// Account → accent color (left border + chip dot), matching the handoff palette.
const ACCOUNT_COLORS: Record<string, string> = {
  personal: '#C0613A',
  moonshot: '#6E8B6A',
  leadstories: '#7A6E9C',
  zoho: '#D89A4E',
  amargi: '#4F76B8',
};
const colorFor = (a: string) => ACCOUNT_COLORS[a] ?? '#97948C';

function parseFrom(from: string): { name: string; email: string; initial: string } {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const email = (m?.[2] ?? from).trim();
  const name = (m?.[1] ?? '').trim() || email;
  return { name, email, initial: (name || email || '?').charAt(0).toUpperCase() };
}

function fmtTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function InboxPage() {
  const { data, state } = useLiveData<InboxData>(PATHS.inbox, fetchInbox);
  const [open, setOpen] = useState<Msg | null>(null);
  const [compose, setCompose] = useState<{ mode: 'new' | 'reply'; to?: string; subject?: string; account?: string } | null>(null);
  const [queued, setQueued] = useState(false);

  const messages = data?.messages ?? [];
  const accounts = Array.from(new Set(messages.map((m) => m.account)));
  const unread = messages.filter((m) => m.unread).length;

  const statusDot = state === 'offline' ? '#D89A4E' : state === 'loaded' && data?.connected ? '#6E8B6A' : 'var(--muted)';
  const statusText =
    state === 'loading'
      ? 'Loading…'
      : state === 'offline'
        ? 'Runtime offline'
        : data?.connected
          ? `${accounts.length} account${accounts.length === 1 ? '' : 's'} · ${unread} unread`
          : 'Not connected';

  return (
    <div className="mx-auto max-w-[860px] px-[30px] py-7">
      <div className="mb-[22px] flex items-baseline gap-3">
        <h1 className="flex-1 text-[26px] font-semibold text-text">Inbox</h1>
        <span className="flex items-center gap-[7px] text-[12.5px] text-text-2">
          <span className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: statusDot }} />
          {statusText}
        </span>
        {data?.connected && (
          <button type="button" onClick={() => setCompose({ mode: 'new' })} className="rounded-[10px] bg-accent px-3.5 py-2 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">
            Compose
          </button>
        )}
      </div>

      {state === 'offline' && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5" style={{ borderLeft: '3px solid #D89A4E' }}>
          <span className="h-2 w-2 flex-none rounded-full" style={{ background: '#D89A4E' }} />
          <div className="flex-1">
            <div className="text-[13.5px] font-semibold text-text">The runtime is offline</div>
            <div className="mt-0.5 text-[12.5px] text-text-2">Live mail is paused. Start it with npm run dev:all.</div>
          </div>
        </div>
      )}

      {state === 'loading' && (
        <div className="flex flex-col gap-[9px]">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="xsk h-14" />)}</div>
      )}

      {state === 'loaded' && data && !data.connected && (
        <div className="rounded-[14px] border border-dashed border-border px-5 py-[46px] text-center text-[13.5px] text-muted">
          No accounts connected. <a href="/connections" className="font-semibold text-text-2 hover:text-text">Connect Gmail</a>
        </div>
      )}

      {state === 'loaded' && data?.connected && messages.length === 0 && (
        <div className="rounded-[14px] border border-dashed border-border px-5 py-[46px] text-center text-[13.5px] text-muted">
          {data.error ?? 'No mail right now.'}
        </div>
      )}

      {state === 'loaded' && data?.connected && messages.length > 0 && (
        <>
          {accounts.length > 0 && (
            <div className="mb-[18px] flex flex-wrap gap-[7px]">
              {accounts.map((a) => (
                <span key={a} className="flex items-center gap-[7px] rounded-full border border-border bg-surface px-3 py-[5px] text-[12px] capitalize text-text-2">
                  <span className="h-[7px] w-[7px] rounded-full" style={{ background: colorFor(a) }} />
                  {a}
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2">
            {messages.map((m) => {
              const f = parseFrom(m.from);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setOpen(m)}
                  className="rounded-[11px] border border-border bg-surface px-4 py-3 text-left transition hover:bg-hover"
                  style={{ borderLeft: `3px solid ${colorFor(m.account)}` }}
                >
                  <div className="flex items-center gap-2">
                    <span className={`flex-1 truncate text-[13.5px] ${m.unread ? 'font-bold text-text' : 'font-semibold text-text-2'}`}>{f.name}</span>
                    {m.unread && <span className="h-1.5 w-1.5 flex-none rounded-full bg-accent" />}
                    <span className="flex-none text-[12px] text-muted">{fmtTime(m.receivedAt)}</span>
                  </div>
                  <div className="mt-[3px] truncate text-[13px] text-text">
                    <span className={m.unread ? 'font-semibold' : 'font-medium'}>{m.subject || '(no subject)'}</span>
                    <span className="text-text-2"> — {m.snippet}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {open && (() => {
        const f = parseFrom(open.from);
        return (
          <Modal open onClose={() => setOpen(null)} title={open.subject || '(no subject)'} subtitle={<span className="capitalize">{open.account}</span>} width="max-w-2xl">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full text-base font-semibold text-on-accent" style={{ background: colorFor(open.account) }}>{f.initial}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-text"><span className="font-semibold">{f.name}</span> <span className="text-[12px] text-muted">&lt;{f.email}&gt;</span></div>
                <div className="text-[12px] text-muted">to me · {open.receivedAt ? new Date(open.receivedAt).toLocaleString('en-GB') : ''}</div>
              </div>
            </div>
            <div className="whitespace-pre-line text-[14px] leading-relaxed text-text">{open.snippet}…</div>
            <a href={`https://mail.google.com/mail/u/0/#inbox/${open.id}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[12.5px] font-medium text-accent hover:underline">Open the full email in Gmail →</a>
            <div className="mt-5 flex gap-2.5">
              <button type="button" onClick={() => setCompose({ mode: 'reply', to: f.email, subject: open.subject?.startsWith('Re:') ? open.subject : `Re: ${open.subject ?? ''}`, account: open.account })} className="rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent-dim">Reply</button>
              <button type="button" onClick={() => setOpen(null)} className="rounded-[10px] border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-text-2 hover:bg-hover">Close</button>
            </div>
          </Modal>
        );
      })()}

      {compose && (
        <ComposeModal open mode={compose.mode} initialTo={compose.to} initialSubject={compose.subject} account={compose.account} onClose={() => setCompose(null)} onQueued={() => { setQueued(true); window.setTimeout(() => setQueued(false), 3500); }} />
      )}

      {queued && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 rounded-[11px] border border-border bg-surface px-4 py-2.5 text-[12.5px] text-text-2 shadow-lg">
          Draft sent to Approvals.
        </div>
      )}
    </div>
  );
}
