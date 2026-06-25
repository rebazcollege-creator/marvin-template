'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { draftReply, fetchInboxFolder, fetchMessageBody, PATHS } from '@/lib/marvin-data';
import { useLiveData } from '@/lib/use-live-data';
import type { InboxData } from '@/lib/marvin-protocol';
import { ComposeModal } from '@/components/inbox/ComposeModal';
import { EmailBody } from '@/components/inbox/EmailBody';
import { enqueueApproval } from '@/lib/approvals';

type Msg = InboxData['messages'][number];

// Account → display name + accent colour (matches the Gmail-clone handoff).
const ACCOUNT_META: Record<string, { name: string; color: string }> = {
  personal: { name: 'Personal', color: 'var(--text-2)' },
  moonshot: { name: 'Moonshot', color: '#7A6E9C' },
  leadstories: { name: 'LeadStories', color: '#C0613A' },
  zoho: { name: 'Zoho', color: '#6E8B6A' },
  amargi: { name: 'Amargi', color: '#D89A4E' },
};
const meta = (role: string) => ACCOUNT_META[role] ?? { name: role.charAt(0).toUpperCase() + role.slice(1), color: '#97948C' };

const FOLDERS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'starred', label: 'Starred' },
  { id: 'sent', label: 'Sent' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'spam', label: 'Spam' },
] as const;

function FolderIcon({ id, color }: { id: string; color: string }) {
  const p = { width: 17, height: 17, viewBox: '0 0 20 20', fill: 'none', stroke: color, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (id) {
    case 'inbox': return (<svg {...p}><rect x="3" y="5" width="14" height="10" rx="2" /><path d="M3 6.5l7 4.5 7-4.5" /></svg>);
    case 'starred': return (<svg {...p}><path d="M10 3.2l2 4.3 4.6.5-3.4 3.1 1 4.6L10 15.3 5.8 17.8l1-4.6L3.4 8l4.6-.5z" /></svg>);
    case 'sent': return (<svg {...p}><path d="M3 10l14-6-6 14-2.5-5.5z" /></svg>);
    case 'drafts': return (<svg {...p}><path d="M13 3.5l3.5 3.5L8 15.5H4.5V12z" /></svg>);
    case 'spam': return (<svg {...p}><path d="M7 3.5h6L16.5 7v6L13 16.5H7L3.5 13V7z" /><path d="M10 6.5v4M10 13h.01" /></svg>);
    default: return (<svg {...p}><circle cx="10" cy="10" r="6" /></svg>);
  }
}

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
  if (now.getFullYear() === d.getFullYear()) return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}
const fullTime = (iso: string) => (iso && !Number.isNaN(new Date(iso).getTime()) ? new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

// Triage split comes from the runtime (real Gmail IMPORTANT / category labels).
const splitOf = (m: Msg): string => m.split ?? 'other';
const SPLIT_DEFS: [string, string][] = [['important', 'Important'], ['calendar', 'Calendar'], ['news', 'News'], ['other', 'Other']];
// All accounts always shown in the rail (handoff design), in this order.
const ACCOUNT_ORDER = ['personal', 'moonshot', 'leadstories', 'zoho', 'amargi'];

export default function InboxPage() {
  const [folder, setFolder] = useState('inbox');
  const [acct, setAcct] = useState('all');
  const [split, setSplit] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [stars, setStars] = useState<Record<string, boolean>>({});
  const [compose, setCompose] = useState<{ mode: 'new' | 'reply'; to?: string; subject?: string; body?: string; account?: string } | null>(null);
  const [queued, setQueued] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; body: string; detail?: string; okLabel: string; onOk: () => void } | null>(null);
  const [body, setBody] = useState<{ html?: string; text?: string }>({});
  const [bodyLoading, setBodyLoading] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const fetcher = useCallback(() => fetchInboxFolder(folder), [folder]);
  const { data, state, refresh, refreshing } = useLiveData<InboxData>(`${PATHS.inbox}?folder=${folder}`, fetcher);

  // Older pages, loaded on demand (so the first paint stays small and fast).
  const [more, setMore] = useState<Msg[]>([]);
  const [moreCursor, setMoreCursor] = useState<string | undefined>(undefined);
  const [pagedOnce, setPagedOnce] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => { setMore([]); setMoreCursor(undefined); setPagedOnce(false); }, [folder]);

  const messages = useMemo(() => {
    const base = data?.messages ?? [];
    if (more.length === 0) return base;
    const seen = new Set(base.map((m) => m.id));
    const merged = [...base, ...more.filter((m) => !seen.has(m.id))];
    merged.sort((x, y) => (y.receivedAt > x.receivedAt ? 1 : y.receivedAt < x.receivedAt ? -1 : 0));
    return merged;
  }, [data, more]);

  const nextCursor = pagedOnce ? moreCursor : data?.cursor;
  const canLoadMore = Boolean(nextCursor) && acct === 'all' && split === 'all';

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const resp = await fetchInboxFolder(folder, nextCursor);
    if (resp) {
      setMore((prev) => {
        const seen = new Set([...(data?.messages ?? []), ...prev].map((m) => m.id));
        return [...prev, ...resp.messages.filter((m) => !seen.has(m.id))];
      });
      setMoreCursor(resp.cursor);
      setPagedOnce(true);
    }
    setLoadingMore(false);
  }, [folder, nextCursor, loadingMore, data]);
  // Show every account (design), ordered; append any unknown roles that show up.
  const accounts = useMemo(() => {
    const present = new Set(messages.map((m) => m.account));
    const extra = [...present].filter((a) => !ACCOUNT_ORDER.includes(a));
    return [...ACCOUNT_ORDER, ...extra];
  }, [messages]);
  const unreadByAccount = (k: string) => messages.filter((m) => m.account === k && m.unread).length;
  const totalUnread = messages.filter((m) => m.unread).length;

  // account filter
  let rows = acct === 'all' ? messages : messages.filter((m) => m.account === acct);

  // split tabs (Inbox only)
  const inSplitMode = folder === 'inbox';
  let splitTabs: { id: string; label: string; count: number }[] = [];
  if (inSplitMode) {
    const counts: Record<string, number> = {};
    rows.forEach((m) => { const s = splitOf(m); counts[s] = (counts[s] ?? 0) + 1; });
    splitTabs = [{ id: 'all', label: 'All', count: rows.length }, ...SPLIT_DEFS.filter(([id]) => counts[id]).map(([id, label]) => ({ id, label, count: counts[id]! }))];
    if (split !== 'all') rows = rows.filter((m) => splitOf(m) === split);
  }

  const open = openId ? messages.find((m) => m.id === openId) ?? null : null;

  useEffect(() => {
    if (!open) { setBody({}); return; }
    let alive = true;
    setBody({});
    setBodyLoading(true);
    fetchMessageBody(open.account, open.id).then((r) => {
      if (!alive) return;
      setBody({ html: r?.html, text: r?.text || r?.body || open.snippet });
      setBodyLoading(false);
    });
    return () => { alive = false; };
  }, [open]);

  // AI-drafted reply: ask the runtime, then open the composer pre-filled (still gated by Approvals).
  const aiDraftReply = async (m: Msg) => {
    const f = parseFrom(m.from);
    setDrafting(true);
    const text = body.text || m.snippet || '';
    const draft = await draftReply({ account: m.account, from: m.from, subject: m.subject ?? '', body: text });
    setDrafting(false);
    setCompose({
      mode: 'reply',
      to: f.email,
      subject: m.subject?.startsWith('Re:') ? m.subject : `Re: ${m.subject ?? ''}`,
      body: draft ?? '',
      account: m.account,
    });
    if (draft === null) window.setTimeout(() => alert('MARVIN couldn’t draft a reply — is the runtime running with an API key?'), 0);
  };

  const replyTo = (m: Msg) => {
    const f = parseFrom(m.from);
    setCompose({ mode: 'reply', to: f.email, subject: m.subject?.startsWith('Re:') ? m.subject : `Re: ${m.subject ?? ''}`, account: m.account });
  };

  const switchFolder = (id: string) => { setFolder(id); setAcct('all'); setSplit('all'); setOpenId(null); };

  const addToTrello = (m: Msg) => setConfirm({
    title: 'Add to Trello?',
    body: 'MARVIN will create a card on your Trello board. It waits in Approvals before anything is created.',
    detail: `Card: "${m.subject || '(no subject)'}"\nFrom: ${parseFrom(m.from).name}`,
    okLabel: 'Send to Approvals',
    onOk: () => {
      enqueueApproval({
        kind: 'task',
        title: `Card: ${m.subject || '(no subject)'}`,
        source: `Inbox · ${meta(m.account).name}`,
        preview: `${m.subject || '(no subject)'}\n\nFrom ${m.from}\n${m.snippet}`,
        actionLabel: 'Create Trello card',
        payload: { kind: 'task', name: m.subject || '(no subject)' },
      });
      setConfirm(null);
      setQueued(true);
      window.setTimeout(() => setQueued(false), 3500);
    },
  });

  const statusEmpty = state === 'loaded' && data?.connected && rows.length === 0;

  return (
    <div className="flex h-full min-w-0 bg-bg" style={{ fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
      {/* folders + accounts rail */}
      <div className="flex w-[206px] flex-none flex-col overflow-y-auto pb-3 pl-4 pr-2 pt-[18px]">
        <button
          type="button"
          onClick={() => setCompose({ mode: 'new' })}
          className="mb-3.5 flex items-center gap-3 self-start rounded-2xl border border-border bg-accent-soft px-[15px] py-3 pr-[22px] text-sm font-semibold text-text-2 shadow-sm transition hover:bg-hover"
        >
          <span className="text-[17px]">✎</span> Compose
        </button>
        {FOLDERS.map((f) => {
          const on = folder === f.id;
          const count = f.id === 'inbox' ? totalUnread : 0;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => switchFolder(f.id)}
              className="mr-1.5 flex items-center gap-3.5 rounded-r-2xl px-3.5 py-2 text-left text-[13.5px] transition hover:bg-hover"
              style={{ background: on ? 'var(--accent-soft)' : 'transparent', color: on ? '#A8512E' : 'var(--text)', fontWeight: on ? 700 : 500 }}
            >
              <FolderIcon id={f.id} color={on ? '#A8512E' : 'var(--text-2)'} />
              <span className="flex-1">{f.label}</span>
              {count > 0 && <span className="text-[12px] font-bold">{count}</span>}
            </button>
          );
        })}
        <div className="my-3 ml-0 mr-2 h-px bg-border" />
        <div className="px-3.5 pb-2 pt-0.5 text-[10.5px] font-semibold tracking-[0.06em] text-muted">ACCOUNTS</div>
        {accounts.map((k) => {
          const m = meta(k);
          const on = acct === k;
          const u = unreadByAccount(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => setAcct(on ? 'all' : k)}
              className="mr-1.5 flex items-center gap-3 rounded-r-2xl px-3.5 py-[7px] text-left text-[13px] text-text transition hover:bg-hover"
              style={{ background: on ? 'var(--accent-soft)' : 'transparent' }}
            >
              <span className="h-[9px] w-[9px] flex-none rounded-full" style={{ background: m.color }} />
              <span className="flex-1" style={{ fontWeight: on ? 700 : 500 }}>{m.name}</span>
              {u > 0 && <span className="text-[11px] font-bold" style={{ color: m.color }}>{u}</span>}
            </button>
          );
        })}
      </div>

      {/* main panel */}
      <div className="flex min-w-0 flex-1 overflow-hidden rounded-tl-2xl border border-r-0 border-border bg-surface">
        {/* list column */}
        <div className="flex flex-none flex-col border-r border-border-2" style={{ width: open ? 'clamp(300px, 38%, 360px)' : '100%' }}>
          <div className="flex h-[46px] flex-none items-center gap-[18px] border-b border-border-2 px-4 text-muted">
            <span className="h-[17px] w-[17px] rounded-[3px] border-2 border-border" />
            <button
              type="button"
              onClick={() => refresh()}
              disabled={refreshing}
              title="Refresh"
              aria-label="Refresh"
              className={`inline-block text-[15px] text-muted transition hover:text-text disabled:opacity-50 ${refreshing ? 'animate-spin' : ''}`}
            >
              ⟳
            </button>
            <div className="flex-1" />
            <span className="text-[12px] text-muted">{rows.length === 0 ? '0' : `1–${rows.length}`}{canLoadMore ? '+' : ''}</span>
          </div>

          {inSplitMode && splitTabs.length > 1 && (
            <div className="flex h-11 flex-none items-stretch border-b border-border-2">
              {splitTabs.map((t) => {
                const on = split === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSplit(t.id)}
                    className="flex items-center gap-[7px] px-4 text-[13px]"
                    style={{ borderBottom: `3px solid ${on ? '#C0613A' : 'transparent'}`, color: on ? 'var(--text)' : 'var(--muted)', fontWeight: on ? 600 : 500 }}
                  >
                    {t.label}
                    {t.count > 0 && <span className="rounded-lg bg-hover px-1.5 py-px text-[10.5px] text-muted">{t.count}</span>}
                  </button>
                );
              })}
            </div>
          )}

          <div
            className="flex-1 overflow-y-auto"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (canLoadMore && !loadingMore && el.scrollHeight - el.scrollTop - el.clientHeight < 240) loadMore();
            }}
          >
            {state === 'loading' && <div className="flex flex-col gap-px p-3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="xsk h-9" />)}</div>}
            {state === 'offline' && <Centered title="The runtime is offline" body="Live mail is paused. Start it with npm run dev:all." />}
            {state === 'loaded' && data && !data.connected && <Centered title="No accounts connected" body="Connect Gmail on the Connections page to see your mail here." href="/connections" cta="Connect Gmail" />}
            {statusEmpty && <Centered title={data?.error ? 'Couldn’t load your mail' : 'Nothing here'} body={data?.error ?? 'No mail in this view right now.'} />}

            {state === 'loaded' && data?.connected && rows.map((m) => {
              const f = parseFrom(m.from);
              const mt = meta(m.account);
              const starred = stars[m.id];
              const sel = m.id === openId;
              return (
                <div
                  key={m.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenId(m.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(m.id); }}
                  className="flex h-11 cursor-pointer items-center gap-[11px] border-b border-line px-3.5"
                  style={{ background: sel ? 'var(--accent-soft)' : 'transparent', boxShadow: m.account === 'leadstories' && m.unread ? 'inset 3px 0 0 #C0613A' : 'none' }}
                  onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = '#F5EEDF'; void fetchMessageBody(m.account, m.id); }}
                  onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span className="h-[15px] w-[15px] flex-none rounded-[3px] border-2 border-border" />
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => { e.stopPropagation(); setStars((s) => ({ ...s, [m.id]: !s[m.id] })); }}
                    className="w-[15px] flex-none text-[15px]"
                    style={{ color: starred ? '#D89A4E' : 'var(--muted)' }}
                  >
                    {starred ? '★' : '☆'}
                  </span>
                  <span className="h-[9px] w-[9px] flex-none rounded-full" style={{ background: mt.color }} />
                  <span className="w-[120px] flex-none truncate text-[13px] text-text" style={{ fontWeight: m.unread ? 700 : 400 }}>{f.name}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    <span className="text-text" style={{ fontWeight: m.unread ? 700 : 400 }}>{m.subject || '(no subject)'}</span>
                    <span className="text-text-2"> — {m.snippet}</span>
                  </span>
                  <span className="flex-none text-[11.5px]" style={{ color: m.unread ? 'var(--text)' : 'var(--muted)', fontWeight: m.unread ? 700 : 400 }}>{fmtTime(m.receivedAt)}</span>
                </div>
              );
            })}

            {state === 'loaded' && data?.connected && canLoadMore && (
              <button
                type="button"
                onClick={() => loadMore()}
                disabled={loadingMore}
                className="flex h-11 w-full items-center justify-center gap-2 border-b border-line text-[12.5px] font-medium text-muted transition hover:bg-hover hover:text-text disabled:opacity-60"
              >
                {loadingMore ? <span className="animate-spin">⟳</span> : '↓'} {loadingMore ? 'Loading older mail…' : 'Load older mail'}
              </button>
            )}
          </div>
        </div>

        {/* reading pane */}
        {open && (() => {
          const f = parseFrom(open.from);
          const mt = meta(open.account);
          return (
            <div className="flex min-w-0 flex-1 flex-col bg-surface">
              {/* Sticky header — subject, sender, and the action bar are always visible (no scrolling to reply). */}
              <div className="flex-none border-b border-border-2 px-[26px] pb-3 pt-[18px]">
                <div className="mb-[14px] flex items-start gap-3.5">
                  <h1 className="flex-1 text-[21px] font-semibold leading-[1.25] text-text" style={{ fontFamily: "var(--font-playfair), Georgia, serif" }}>{open.subject || '(no subject)'}</h1>
                  <span className="flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border px-[9px] py-[3px] text-[12px] text-text-2">
                    <span className="h-[7px] w-[7px] rounded-full" style={{ background: mt.color }} />
                    {mt.name}
                  </span>
                  <button type="button" onClick={() => setOpenId(null)} className="rounded-md px-1.5 text-muted hover:text-text">✕</button>
                </div>
                <div className="mb-3 flex items-center gap-3.5">
                  <span className="grid h-10 w-10 place-items-center rounded-full text-base font-semibold text-on-accent" style={{ background: mt.color }}>{f.initial}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-text"><span className="font-semibold">{f.name}</span> <span className="text-[12px] text-muted">&lt;{f.email}&gt;</span></div>
                    <div className="text-[12px] text-muted">to me</div>
                  </div>
                  <span className="text-[12px] text-muted">{fullTime(open.receivedAt)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => replyTo(open)} className="rounded-[18px] border border-border bg-surface px-4 py-1.5 text-[13px] font-medium text-text hover:bg-bg">↩ Reply</button>
                  <button type="button" onClick={() => replyTo(open)} className="rounded-[18px] border border-border bg-surface px-4 py-1.5 text-[13px] font-medium text-text hover:bg-bg">Reply all</button>
                  <button type="button" onClick={() => setCompose({ mode: 'new', subject: `Fwd: ${open.subject ?? ''}`, account: open.account })} className="rounded-[18px] border border-border bg-surface px-4 py-1.5 text-[13px] font-medium text-text hover:bg-bg">Forward</button>
                  <button
                    type="button"
                    onClick={() => aiDraftReply(open)}
                    disabled={drafting}
                    className="flex items-center gap-1.5 rounded-[18px] px-4 py-1.5 text-[13px] font-semibold text-on-accent disabled:opacity-60"
                    style={{ background: '#C0613A' }}
                  >
                    <span className="text-[12px]">✦</span> {drafting ? 'Drafting…' : 'AI draft reply'}
                  </button>
                  <button type="button" onClick={() => addToTrello(open)} className="ml-auto rounded-[18px] border border-border bg-surface px-4 py-1.5 text-[13px] font-medium text-text-2 hover:bg-bg">Add to Trello</button>
                </div>
              </div>

              {/* Scrollable body — real HTML, rendered sandboxed and calm. */}
              <div className="flex-1 overflow-y-auto px-[26px] py-[22px]">
                <EmailBody html={body.html} text={body.text || open.snippet} loading={bodyLoading} />
                <a href={`https://mail.google.com/mail/u/0/#all/${open.id}`} target="_blank" rel="noreferrer" className="mt-4 inline-block text-[12.5px] font-medium text-accent hover:underline">Open the full email in Gmail →</a>
              </div>
            </div>
          );
        })()}
      </div>

      {confirm && (
        <div onClick={() => setConfirm(null)} className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(20,20,18,.34)' }}>
          <div onClick={(e) => e.stopPropagation()} className="w-[380px] rounded-2xl border border-border bg-surface p-5 shadow-2xl xpop">
            <div className="mb-2 text-[18px] font-semibold text-text" style={{ fontFamily: "var(--font-playfair), Georgia, serif" }}>{confirm.title}</div>
            <div className="mb-3 text-[13px] leading-[1.55] text-text-2">{confirm.body}</div>
            {confirm.detail && <div className="mb-4 whitespace-pre-line rounded-[10px] border px-3 py-2.5 text-[12.5px] leading-[1.5] text-text" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent-soft-border)' }}>{confirm.detail}</div>}
            <div className="flex justify-end gap-2.5">
              <button type="button" onClick={() => setConfirm(null)} className="rounded-[9px] border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-text-2 hover:bg-bg">Cancel</button>
              <button type="button" onClick={confirm.onOk} className="rounded-[9px] px-4 py-2 text-[13px] font-semibold text-on-accent" style={{ background: '#C0613A' }}>{confirm.okLabel}</button>
            </div>
          </div>
        </div>
      )}

      {compose && (
        <ComposeModal open mode={compose.mode} initialTo={compose.to} initialSubject={compose.subject} initialBody={compose.body} account={compose.account} onClose={() => setCompose(null)} onQueued={() => { setQueued(true); window.setTimeout(() => setQueued(false), 3500); }} />
      )}

      {queued && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 rounded-[11px] border border-border bg-surface px-4 py-2.5 text-[12.5px] text-text-2 shadow-lg">
          Sent to Approvals.
        </div>
      )}
    </div>
  );
}

function Centered({ title, body, href, cta }: { title: string; body: string; href?: string; cta?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center text-muted">
      <div className="text-sm font-semibold text-text-2">{title}</div>
      <div className="max-w-sm text-[12.5px]">{body}</div>
      {href && cta && <a href={href} className="mt-1 text-[12.5px] font-semibold text-accent hover:underline">{cta}</a>}
    </div>
  );
}
