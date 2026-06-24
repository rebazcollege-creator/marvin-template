'use client';

import { useState } from 'react';
import { fetchInbox, PATHS } from '@/lib/marvin-data';
import { useLiveData } from '@/lib/use-live-data';
import type { InboxData } from '@/lib/marvin-protocol';
import { Modal } from '@/components/ui/Modal';
import { ComposeModal } from '@/components/inbox/ComposeModal';

type Msg = InboxData['messages'][number];

export default function InboxPage() {
  const { data, state } = useLiveData<InboxData>(PATHS.inbox, fetchInbox);
  const [open, setOpen] = useState<Msg | null>(null);
  const [compose, setCompose] = useState<{ mode: 'new' | 'reply'; to?: string; subject?: string; account?: string } | null>(null);
  const [queued, setQueued] = useState(false);

  const badge = state === 'loading' ? 'Loading…' : state === 'offline' ? 'Sidecar offline' : data?.connected ? 'Connected' : 'Not connected';
  const messages = data?.messages ?? [];

  return (
    <div className="mx-auto max-w-3xl px-8 pb-16 pt-7">
      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">Inbox</h1>
          <p className="mt-1 text-[13px] text-muted">Unified Gmail · all accounts</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11.5px] text-muted">{badge}</span>
          <button type="button" onClick={() => setCompose({ mode: 'new' })} className="rounded-[10px] bg-accent px-3.5 py-2 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">
            Compose
          </button>
        </div>
      </div>

      {queued && (
        <div className="mb-4 flex items-center gap-2 rounded-[11px] border border-border bg-surface px-4 py-2.5 text-[12.5px] text-text-2">
          <span className="h-1.5 w-1.5 rounded-full bg-green" /> Draft sent to Approvals.
          <a href="/approvals" className="ml-auto font-semibold text-accent hover:underline">Review</a>
        </div>
      )}

      {state === 'loading' && <div className="xsk h-24 rounded-2xl" />}

      {state === 'offline' && (
        <Note>
          MARVIN’s runtime isn’t reachable. Start it with <code className="rounded bg-bg px-1">npm run sidecar</code>. You can still compose — drafts wait in Approvals.
        </Note>
      )}

      {state === 'loaded' && data && !data.connected && (
        <Note>
          Gmail isn’t connected. Add your accounts on Connections (or set the GMAIL_* keys) to see unread mail. You can still compose — drafts wait in Approvals.
        </Note>
      )}

      {state === 'loaded' && data?.connected && messages.length === 0 && <Note>No unread mail across your accounts right now.</Note>}

      {state === 'loaded' && data?.connected && messages.length > 0 && (
        <ul className="space-y-2.5">
          {messages.map((m, i) => (
            <li key={i}>
              <button type="button" onClick={() => setOpen(m)} className="block w-full rounded-[14px] border border-border bg-surface p-4 text-left transition hover:bg-hover">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-accent">{m.account}</span>
                  <span className="text-[11.5px] text-muted">{m.receivedAt ? new Date(m.receivedAt).toLocaleString('en-GB') : ''}</span>
                </div>
                <p className="mt-1.5 text-[13.5px] font-semibold text-text">{m.subject || '(no subject)'}</p>
                <p className="text-[11.5px] text-muted">{m.from}</p>
                <p className="mt-1 line-clamp-2 text-[12.5px] text-text-2">{m.snippet}</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* message detail */}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.subject || '(no subject)'} subtitle={open ? `${open.from} · ${open.account}` : undefined} width="max-w-xl">
        {open && (
          <>
            <div className="whitespace-pre-wrap rounded-[11px] border border-border bg-bg px-3.5 py-3 text-[13px] leading-relaxed text-text-2">{open.snippet || 'No preview available.'}</div>
            <div className="mt-4 flex justify-end gap-2.5">
              <button type="button" onClick={() => setOpen(null)} className="rounded-[10px] border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-text-2 hover:bg-hover">Close</button>
              <button
                type="button"
                onClick={() => {
                  setCompose({ mode: 'reply', to: open.from, subject: open.subject?.startsWith('Re:') ? open.subject : `Re: ${open.subject ?? ''}`, account: open.account });
                  setOpen(null);
                }}
                className="rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent-dim"
              >
                Reply
              </button>
            </div>
          </>
        )}
      </Modal>

      {compose && (
        <ComposeModal
          open
          mode={compose.mode}
          initialTo={compose.to}
          initialSubject={compose.subject}
          account={compose.account}
          onClose={() => setCompose(null)}
          onQueued={() => setQueued(true)}
        />
      )}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-sm text-text-2">{children}</div>;
}
