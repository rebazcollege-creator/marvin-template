'use client';

import { useState } from 'react';
import { fetchInbox, PATHS } from '@/lib/marvin-data';
import { useLiveData } from '@/lib/use-live-data';
import type { InboxData } from '@/lib/marvin-protocol';
import { ComposeModal } from '@/components/inbox/ComposeModal';

type Msg = InboxData['messages'][number];

const ACCOUNT_COLORS: Record<string, string> = {
  personal: '#C0613A',
  moonshot: '#6E8B6A',
  leadstories: '#7A6E9C',
  zoho: '#D89A4E',
  amargi: '#4F76B8',
};
const colorFor = (a: string) => ACCOUNT_COLORS[a] ?? '#97948C';
const isReadOnly = (a: string) => a === 'leadstories';

const FOLDERS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'starred', label: 'Starred' },
  { id: 'sent', label: 'Sent' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'spam', label: 'Spam' },
  { id: 'trash', label: 'Trash' },
];

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
  const [folder, setFolder] = useState('inbox');
  const [acct, setAcct] = useState<string | null>(null);
  const [open, setOpen] = useState<Msg | null>(null);
  const [starred, setStarred] = useState<Record<string, boolean>>({});
  const [compose, setCompose] = useState<{ mode: 'new' | 'reply'; to?: string; subject?: string; account?: string } | null>(null);
  const [queued, setQueued] = useState(false);

  const messages = data?.messages ?? [];
  const accounts = Array.from(new Set(messages.map((m) => m.account)));
  const unreadByAccount = (a: string) => messages.filter((m) => m.account === a && m.unread).length;
  const rows = (acct ? messages.filter((m) => m.account === acct) : messages);

  return (
    <div className="flex h-full min-w-0 bg-bg">
      {/* rail */}
      <div className="flex w-[210px] flex-none flex-col overflow-y-auto px-3 pb-3 pt-4">
        <button
          type="button"
          onClick={() => setCompose({ mode: 'new' })}
          className="mb-3 flex items-center gap-2.5 self-start rounded-2xl border border-border bg-accent-soft px-4 py-3 text-sm font-semibold text-text-2 shadow-sm transition hover:bg-hover"
        >
          <span className="text-base">✎</span> Compose
        </button>
        {FOLDERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => { setFolder(f.id); setOpen(null); }}
            className={`flex items-center gap-3 rounded-r-2xl px-3.5 py-2 text-left text-[13.5px] transition ${
              folder === f.id ? 'bg-accent-soft font-semibold text-text' : 'text-text-2 hover:bg-hover'
            }`}
          >
            <span className="flex-1">{f.label}</span>
            {f.id === 'inbox' && messages.some((m) => m.unread) && (
              <span className="text-[12px] font-bold">{messages.filter((m) => m.unread).length}</span>
            )}
          </button>
        ))}
        {accounts.length > 0 && (
          <>
            <div className="my-3 h-px bg-border" />
            <div className="px-3.5 pb-2 text-[10.5px] font-semibold tracking-[0.06em] text-muted">ACCOUNTS</div>
            <button type="button" onClick={() => setAcct(null)} className={`flex items-center gap-3 rounded-r-2xl px-3.5 py-1.5 text-left text-[13px] transition ${acct === null ? 'bg-hover font-semibold text-text' : 'text-text-2 hover:bg-hover'}`}>
              <span className="h-2.5 w-2.5 rounded-full bg-muted" /> <span className="flex-1">All accounts</span>
            </button>
            {accounts.map((a) => (
              <button key={a} type="button" onClick={() => setAcct(a)} className={`flex items-center gap-3 rounded-r-2xl px-3.5 py-1.5 text-left text-[13px] transition ${acct === a ? 'bg-hover font-semibold text-text' : 'text-text hover:bg-hover'}`}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorFor(a) }} />
                <span className="flex-1 capitalize">{a}</span>
                {unreadByAccount(a) > 0 && <span className="text-[11px] font-bold" style={{ color: colorFor(a) }}>{unreadByAccount(a)}</span>}
              </button>
            ))}
          </>
        )}
      </div>

      {/* main */}
      <div className="flex min-w-0 flex-1 overflow-hidden rounded-tl-2xl border border-r-0 border-border bg-surface">
        {state === 'loading' && (
          <div className="flex flex-1 flex-col gap-2 p-4">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="xsk h-11" />)}</div>
        )}
        {state === 'offline' && <Centered dot="#D89A4E" title="The runtime is offline" body="Live mail is paused. Start it with npm run dev:all." />}
        {state === 'loaded' && data && !data.connected && <Centered title="No account connected" body="Connect Gmail on the Connections page to see your mail here." />}
        {state === 'loaded' && data?.connected && folder !== 'inbox' && (
          <Centered title={`${FOLDERS.find((f) => f.id === folder)?.label} is coming`} body="Inbox is live; the other folders are next." />
        )}
        {state === 'loaded' && data?.connected && folder === 'inbox' && rows.length === 0 && <Centered title="Nothing here" body="No mail in this view right now." />}

        {state === 'loaded' && data?.connected && folder === 'inbox' && rows.length > 0 && (
          <>
            {/* list */}
            <div className={`flex flex-none flex-col border-r border-border-2 ${open ? 'w-[360px]' : 'flex-1'}`}>
              <div className="flex h-12 flex-none items-center gap-3 border-b border-border-2 px-4 text-muted">
                <span className="text-[12px] text-muted">{rows.length} message{rows.length === 1 ? '' : 's'}</span>
                <div className="flex-1" />
                <span className="text-[12px]">Primary</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {rows.map((m) => {
                  const f = parseFrom(m.from);
                  const star = starred[m.id];
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setOpen(m)}
                      className={`flex w-full items-center gap-2.5 border-b border-line px-3.5 text-left transition hover:bg-hover ${open?.id === m.id ? 'bg-hover' : m.unread ? 'bg-surface' : 'bg-surface-2'}`}
                      style={{ height: 44 }}
                    >
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => { e.stopPropagation(); setStarred((s) => ({ ...s, [m.id]: !s[m.id] })); }}
                        className={`w-4 flex-none text-[15px] ${star ? 'text-gold' : 'text-muted'}`}
                      >
                        {star ? '★' : '☆'}
                      </span>
                      <span className="h-2 w-2 flex-none rounded-full" style={{ background: colorFor(m.account) }} />
                      <span className={`w-[110px] flex-none truncate text-[13px] ${m.unread ? 'font-bold text-text' : 'text-text-2'}`}>{f.name}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px]">
                        <span className={m.unread ? 'font-semibold text-text' : 'text-text'}>{m.subject || '(no subject)'}</span>
                        <span className="text-text-2"> — {m.snippet}</span>
                      </span>
                      {isReadOnly(m.account) && <span className="flex-none rounded border border-border px-1.5 text-[9.5px] text-muted">read-only</span>}
                      <span className={`flex-none text-[11.5px] ${m.unread ? 'font-bold text-text' : 'text-muted'}`}>{fmtTime(m.receivedAt)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* reading pane */}
            {open && (
              <div className="flex min-w-0 flex-1 flex-col bg-surface">
                <div className="flex-1 overflow-y-auto px-7 py-6">
                  <div className="mb-4 flex items-start gap-3">
                    <h1 className="flex-1 font-display text-[21px] font-semibold leading-tight text-text">{open.subject || '(no subject)'}</h1>
                    <span className="flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border px-2 py-1 text-[12px] text-text-2">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: colorFor(open.account) }} />
                      <span className="capitalize">{open.account}</span>
                    </span>
                    <button type="button" onClick={() => setOpen(null)} className="rounded-md px-2 py-1 text-muted hover:text-text">✕</button>
                  </div>
                  {(() => {
                    const f = parseFrom(open.from);
                    return (
                      <div className="mb-5 flex items-center gap-3">
                        <span className="grid h-10 w-10 place-items-center rounded-full text-base font-semibold text-on-accent" style={{ background: colorFor(open.account) }}>{f.initial}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-text"><span className="font-semibold">{f.name}</span> <span className="text-[12px] text-muted">&lt;{f.email}&gt;</span></div>
                          <div className="text-[12px] text-muted">to me · {new Date(open.receivedAt).toLocaleString('en-GB')}</div>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="whitespace-pre-line text-[14px] leading-relaxed text-text">{open.snippet}…</div>
                  <a href={`https://mail.google.com/mail/u/0/#inbox/${open.id}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[12.5px] font-medium text-accent hover:underline">Open the full email in Gmail →</a>

                  <div className="mt-6 flex flex-wrap items-center gap-2.5 rounded-xl border border-border bg-accent-soft px-3.5 py-3">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-[11px] font-bold text-on-accent">✦</span>
                    <span className="text-[12px] font-bold text-text-2">MARVIN</span>
                    {!isReadOnly(open.account) && (
                      <button type="button" onClick={() => setCompose({ mode: 'reply', to: parseFrom(open.from).email, subject: open.subject?.startsWith('Re:') ? open.subject : `Re: ${open.subject ?? ''}`, account: open.account })} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-hover">Draft a reply</button>
                    )}
                  </div>

                  {isReadOnly(open.account) ? (
                    <div className="mt-5 rounded-[10px] border border-dashed border-border px-3.5 py-3 text-[12.5px] text-muted">This is a LeadStories account — monitored read-only. No replies are sent from Xanî.</div>
                  ) : (
                    <div className="mt-5 flex gap-2.5">
                      <button type="button" onClick={() => setCompose({ mode: 'reply', to: parseFrom(open.from).email, subject: open.subject?.startsWith('Re:') ? open.subject : `Re: ${open.subject ?? ''}`, account: open.account })} className="rounded-[20px] border border-border bg-surface px-5 py-2 text-[13.5px] font-medium text-text hover:bg-bg">Reply</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {queued && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 rounded-[11px] border border-border bg-surface px-4 py-2.5 text-[12.5px] text-text-2 shadow-lg">
          Draft sent to Approvals.
        </div>
      )}

      {compose && (
        <ComposeModal open mode={compose.mode} initialTo={compose.to} initialSubject={compose.subject} account={compose.account} onClose={() => setCompose(null)} onQueued={() => { setQueued(true); window.setTimeout(() => setQueued(false), 3500); }} />
      )}
    </div>
  );
}

function Centered({ dot, title, body }: { dot?: string; title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted">
      {dot && <span className="h-2.5 w-2.5 rounded-full" style={{ background: dot }} />}
      <div className="text-sm font-semibold text-text-2">{title}</div>
      <div className="text-[12.5px]">{body}</div>
    </div>
  );
}
