'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSlack, fetchSlackHistory, PATHS, draftReply, summarizeThread } from '@/lib/marvin-data';
import { useLiveData } from '@/lib/use-live-data';
import { RefreshButton } from '@/components/ui/RefreshButton';
import type { SlackData } from '@/lib/marvin-protocol';
import { enqueueApproval } from '@/lib/approvals';
import { voicePromptFor } from '@/lib/voice';
import { mailboxAction } from '@/lib/marvin-client';
import { SlackText, emojiFor } from '@/lib/slack-mrkdwn';

type Msg = SlackData['messages'][number];
type Chan = SlackData['channels'][number];

const AV_PALETTE = ['#C0613A', '#6E8B6A', '#D89A4E', '#7A6E9C', '#A8512E'];
function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AV_PALETTE[h % AV_PALETTE.length] ?? '#C0613A';
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return '?';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase();
}
function fmtTs(ts: string): string {
  const n = Number(ts);
  if (!n) return '';
  const d = new Date(n * 1000);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** Real Slack-style avatar: the person's photo when they have one, else coloured initials —
 *  exactly like the real client. Falls back to initials if the image fails to load. */
function Avatar({ name, url, size = 36, group }: { name: string; url?: string; size?: number; group?: boolean }) {
  const [err, setErr] = useState(false);
  const radius = Math.round(size * 0.26);
  if (url && !err) {
    return (
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setErr(true)}
        className="flex-none object-cover"
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }
  return (
    <span
      className="grid flex-none place-items-center font-bold text-on-accent"
      style={{ width: size, height: size, borderRadius: radius, background: colorFor(name), fontSize: Math.round(size * 0.36) }}
    >
      {group ? '👥' : initials(name)}
    </span>
  );
}

export default function SlackPage() {
  const { data, state, refresh, refreshing } = useLiveData<SlackData>(PATHS.slack, fetchSlack);

  const workspaces = useMemo(() => data?.workspaces ?? [], [data]);
  const allChannels = useMemo(() => data?.channels ?? [], [data]);

  const [ws, setWs] = useState<string | null>(null);
  const [chId, setChId] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [marvin, setMarvin] = useState<{ title: string; text: string; loading?: boolean } | null>(null);
  const [composeText, setComposeText] = useState('');
  const [queued, setQueued] = useState(false);

  // Per-open-channel history (oldest→newest), with a cursor for older pages.
  const [hist, setHist] = useState<{ messages: Msg[]; cursor?: string; loading: boolean; loadingMore: boolean; error?: string }>(
    { messages: [], loading: false, loadingMore: false },
  );

  const activeWs = ws ?? workspaces[0]?.role ?? null;
  const activeWsRec = workspaces.find((w) => w.role === activeWs) ?? null;
  const [showAllDms, setShowAllDms] = useState(false);
  const wsChannels = useMemo(() => allChannels.filter((c) => c.workspace === activeWs && c.kind === 'channel'), [allChannels, activeWs]);
  const wsGroups = useMemo(() => allChannels.filter((c) => c.workspace === activeWs && c.kind === 'group'), [allChannels, activeWs]);
  const wsDms = useMemo(() => allChannels.filter((c) => c.workspace === activeWs && c.kind === 'dm'), [allChannels, activeWs]);
  const sidebarConvos = wsChannels; // Channels section is channels only now
  // DMs + group DMs together, active-first — so the pile of stale mpdm groups sinks to the
  // bottom (or hides) instead of flooding the sidebar the way it did before.
  const dmConvos = useMemo(() => {
    return [...wsGroups, ...wsDms].sort(
      (a, b) =>
        Number(b.hasUnread) - Number(a.hasUnread) ||
        Number(b.lastTs || 0) - Number(a.lastTs || 0) ||
        a.name.localeCompare(b.name),
    );
  }, [wsGroups, wsDms]);
  const DM_CAP = 16;
  const shownDms = showAllDms ? dmConvos : dmConvos.slice(0, DM_CAP);

  const activeChan: Chan | null = allChannels.find((c) => c.workspace === activeWs && c.id === chId) ?? null;

  // Default workspace's first conversation; reset channel when workspace changes.
  useEffect(() => { setChId(null); }, [activeWs]);
  const effectiveChId = chId ?? sidebarConvos[0]?.id ?? dmConvos[0]?.id ?? null;

  const loadHistory = useCallback(async (workspace: string, channel: string) => {
    setHist({ messages: [], loading: true, loadingMore: false });
    const r = await fetchSlackHistory({ workspace, channel, limit: 50 });
    if (!r) { setHist({ messages: [], loading: false, loadingMore: false, error: 'Runtime unreachable.' }); return; }
    if (!r.ok) { setHist({ messages: [], loading: false, loadingMore: false, error: r.error }); return; }
    setHist({ messages: r.messages.slice().reverse(), cursor: r.nextCursor, loading: false, loadingMore: false });
  }, []);

  const loadOlder = useCallback(async () => {
    if (!activeWs || !effectiveChId || !hist.cursor || hist.loadingMore) return;
    setHist((h) => ({ ...h, loadingMore: true }));
    const r = await fetchSlackHistory({ workspace: activeWs, channel: effectiveChId, cursor: hist.cursor, limit: 50 });
    if (!r || !r.ok) { setHist((h) => ({ ...h, loadingMore: false, error: r?.error ?? 'Could not load older.' })); return; }
    setHist((h) => ({ ...h, messages: [...r.messages.slice().reverse(), ...h.messages], cursor: r.nextCursor, loadingMore: false }));
  }, [activeWs, effectiveChId, hist.cursor, hist.loadingMore]);

  // Load history whenever the active conversation changes.
  useEffect(() => {
    if (activeWs && effectiveChId) void loadHistory(activeWs, effectiveChId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWs, effectiveChId]);

  const badge = state === 'loading' ? 'Loading…' : state === 'offline' ? 'Sidecar offline' : data?.connected ? 'Live' : 'Not connected';

  const enqueue = (channelName: string, text: string) => {
    if (!channelName || !text.trim()) return;
    enqueueApproval({
      kind: 'slack',
      title: `Message ${activeChan?.kind === 'dm' ? channelName : `#${channelName}`}`,
      source: `Slack · ${activeWsRec?.name ?? activeWs} · ${channelName}`,
      preview: `${activeChan?.kind === 'dm' ? channelName : `#${channelName}`}\n\n${text.trim()}`,
      actionLabel: 'Post to Slack',
      payload: { kind: 'slack', channel: activeChan?.id ?? channelName, text: text.trim(), workspace: activeWs ?? undefined },
    });
    setComposeText('');
    setQueued(true);
    window.setTimeout(() => setQueued(false), 3500);
  };

  const aiDraft = async (m: Msg) => {
    setMarvin({ title: 'DRAFT REPLY', text: '', loading: true });
    const draft = await draftReply({ account: m.workspace, from: m.user, subject: activeChan?.name ?? '', body: m.text, medium: 'slack', voice: voicePromptFor('slack', m.workspace) });
    setMarvin(null);
    if (draft) setComposeText(draft);
    else setMarvin({ title: 'DRAFT REPLY', text: 'Couldn’t draft a reply — is the runtime running with an API key?' });
  };
  const react = async (m: Msg) => {
    const r = await mailboxAction({ kind: 'slack.react', workspace: m.workspace, channel: m.channelId, ts: m.ts, emoji: '+1' });
    if (!r.ok) window.setTimeout(() => alert(`Couldn’t react — ${r.error ?? (r.offline ? 'runtime offline' : 'failed')}.`), 0);
  };
  const markRead = async (m: Msg) => {
    const r = await mailboxAction({ kind: 'slack.read', workspace: m.workspace, channel: m.channelId, ts: m.ts });
    if (!r.ok) window.setTimeout(() => alert(`Couldn’t mark read — ${r.error ?? 'needs a Slack user token'}.`), 0);
    else refresh();
  };
  const summarise = async () => {
    if (!activeChan) return;
    setMarvin({ title: 'THREAD SUMMARY', text: '', loading: true });
    const text = hist.messages.map((m) => `${m.user}: ${m.text}`).join('\n');
    const sum = await summarizeThread({ title: activeChan.name, text });
    setMarvin({ title: 'THREAD SUMMARY', text: sum || 'Couldn’t summarise — is the runtime running with an API key?' });
  };
  const addToQueue = (m: Msg) => {
    enqueueApproval({
      kind: 'task',
      title: `Verify: ${m.text.slice(0, 60)}`,
      source: `Slack · ${activeChan?.name ?? ''}`,
      preview: `From ${m.user} in ${activeChan?.name ?? ''}\n\n${m.text}`,
      actionLabel: 'Create Trello card',
      payload: { kind: 'task', name: `Verify: ${m.text.slice(0, 80)}` },
    });
    setQueued(true);
    window.setTimeout(() => setQueued(false), 3500);
  };

  // Not connected / offline — honest states.
  if (state !== 'loaded' || !data?.connected) {
    return (
      <div className="flex h-full flex-col">
        <Header badge={badge} refresh={refresh} refreshing={refreshing} />
        <div className="px-8 py-7">
          {state === 'loading' && <div className="xsk h-24 rounded-2xl" />}
          {state === 'offline' && <Note>MARVIN’s runtime isn’t reachable. Start it with <code className="rounded bg-bg px-1">npm run dev:all</code>.</Note>}
          {state === 'loaded' && data && !data.connected && (
            <Note>
              No Slack workspace connected. Add a <strong>User OAuth Token (xoxp-)</strong> per workspace on the{' '}
              <a href="/connections" className="font-semibold text-accent hover:underline">Connections</a> page. The user token is what unlocks unread badges and your DMs — a bot token can’t see either.
            </Note>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 bg-surface">
      {/* workspace rail */}
      <div className="flex w-[66px] flex-none flex-col items-center gap-3 border-r border-border bg-surface-2 pb-3.5 pt-3">
        {workspaces.map((w) => {
          const on = w.role === activeWs;
          const wsUnread = allChannels.some((c) => c.workspace === w.role && c.hasUnread);
          return (
            <button
              key={w.role}
              type="button"
              title={w.error ? `${w.name}: ${w.error}` : w.name}
              onClick={() => setWs(w.role)}
              className="relative grid h-[42px] w-[42px] place-items-center rounded-[13px] text-base font-extrabold text-on-accent transition"
              style={{ background: w.avBg, boxShadow: on ? '0 0 0 2px var(--surface-2), 0 0 0 4px var(--text-2)' : 'none' }}
            >
              {w.name[0]}
              {w.error && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-surface-2 bg-accent" />}
              {!w.error && wsUnread && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface-2 bg-text" />}
            </button>
          );
        })}
        <a href="/connections" title="Add a workspace" className="grid h-[38px] w-[38px] place-items-center rounded-[12px] bg-hover text-[23px] leading-none text-text-2 transition hover:bg-border">+</a>
        <div className="flex-1" />
        <span className="grid h-[30px] w-[30px] place-items-center rounded-full text-[12px] font-bold text-white" style={{ background: 'linear-gradient(135deg,#C0613A,#D89A4E)', border: '2px solid var(--surface)' }}>R</span>
      </div>

      {/* channel sidebar */}
      <div className="flex w-[248px] flex-none flex-col border-r border-border bg-bg">
        <div className="flex h-[50px] flex-none items-center gap-2 border-b border-border px-4">
          <span className="flex-1 truncate text-[16px] font-extrabold text-text">{activeWsRec?.name}</span>
          <RefreshButton onClick={refresh} refreshing={refreshing} />
        </div>

        {/* token-kind honesty line — shows the workspace the token REALLY belongs to */}
        <div className="border-b border-border px-4 py-1.5 text-[11px] text-muted">
          {activeWsRec?.tokenKind === 'user'
            ? 'Reading as you · unread + DMs on'
            : activeWsRec?.tokenKind === 'bot'
              ? 'Bot token · no unread or DMs (add a user token)'
              : '—'}
          {activeWsRec?.team && (
            <span className="ml-1 text-muted/80">· token workspace: <span className="font-semibold">{activeWsRec.team}</span></span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4 pt-2">
          {activeWsRec?.mismatch && (
            <div className="mx-1 mb-2 rounded-[9px] border border-red-500/40 bg-red-500/10 px-2.5 py-2 text-[11.5px] text-text-2">
              ⚠︎ Wrong workspace. This token is signed into{' '}
              <span className="font-semibold">{activeWsRec.team ?? 'another Slack'}</span>, not{' '}
              <span className="font-semibold">{activeWsRec.name}</span>. The names and messages here are
              from that other workspace. Regenerate the token from the real{' '}
              <span className="font-semibold">{activeWsRec.name}</span> workspace and re-add it on{' '}
              <a href="/connections" className="underline">Connections</a>.
            </div>
          )}
          {activeWsRec?.error && (
            <div className="mx-1 mb-2 rounded-[9px] border border-accent/30 bg-accent-soft px-2.5 py-2 text-[11.5px] text-text-2">
              Slack error: <span className="font-semibold">{activeWsRec.error}</span>
            </div>
          )}

          <div className="px-2.5 pb-1 pt-1 text-[13px] font-semibold text-muted">Channels</div>
          {sidebarConvos.map((c) => <ConvoRow key={c.id} c={c} active={c.id === effectiveChId} onClick={() => setChId(c.id)} />)}
          {sidebarConvos.length === 0 && <div className="px-2.5 py-2 text-[12.5px] text-muted">No channels — invite the app to a channel in Slack.</div>}
          <a href="/connections" className="mt-0.5 flex items-center gap-2.5 rounded-[7px] px-2.5 py-1.5 text-[14px] text-muted transition hover:bg-hover">
            <span className="grid h-5 w-5 place-items-center rounded-[6px] bg-hover text-[15px] leading-none">+</span> Add channels
          </a>

          <div className="px-2.5 pb-1 pt-3.5 text-[13px] font-semibold text-muted">Direct messages</div>
          {shownDms.map((c) => <ConvoRow key={c.id} c={c} active={c.id === effectiveChId} onClick={() => setChId(c.id)} />)}
          {dmConvos.length > DM_CAP && (
            <button type="button" onClick={() => setShowAllDms((v) => !v)} className="mt-0.5 w-full rounded-[7px] px-2.5 py-1.5 text-left text-[12.5px] font-medium text-muted transition hover:bg-hover">
              {showAllDms ? 'Show fewer' : `Show ${dmConvos.length - DM_CAP} more…`}
            </button>
          )}
          {dmConvos.length === 0 && (
            <div className="px-2.5 py-2 text-[12px] leading-snug text-muted">
              {activeWsRec?.tokenKind === 'user' ? 'No direct messages.' : 'DMs need a user token (xoxp-).'}
            </div>
          )}

          <div className="px-2.5 pb-1 pt-3.5 text-[13px] font-semibold text-muted">Apps</div>
          <div className="flex items-center gap-2.5 rounded-[7px] px-2.5 py-1.5 text-[14px] text-text-2">
            <span className="grid h-5 w-5 place-items-center rounded-[6px] text-[11px] font-bold text-white" style={{ background: 'linear-gradient(135deg,#C0613A,#D89A4E)' }}>✦</span> MARVIN
          </div>
        </div>
      </div>

      {/* message pane */}
      <div className="flex min-w-0 flex-1 flex-col bg-surface">
        <div className="flex h-[50px] flex-none items-center gap-2.5 border-b border-border px-[18px]">
          <span className="text-[15.5px] font-bold text-text">{activeChan?.kind === 'dm' ? activeChan.name : `# ${activeChan?.name ?? '—'}`}</span>
          {activeChan?.topic && <><div className="h-[18px] w-px bg-border" /><span className="truncate text-[12.5px] text-text-2">{activeChan.topic}</span></>}
          <div className="flex-1" />
          <button type="button" onClick={summarise} disabled={hist.messages.length === 0} className="rounded-[8px] border border-border px-2.5 py-1 text-[11.5px] font-semibold text-text-2 transition hover:bg-hover disabled:opacity-40">✦ Summarise</button>
        </div>

        <div className="flex-1 overflow-y-auto py-3.5">
          {/* load older */}
          {!hist.loading && hist.cursor && (
            <div className="flex justify-center pb-2">
              <button type="button" onClick={() => void loadOlder()} disabled={hist.loadingMore} className="rounded-full border border-border bg-bg px-3.5 py-1 text-[12px] font-semibold text-text-2 transition hover:bg-hover disabled:opacity-50">
                {hist.loadingMore ? 'Loading…' : 'Load older messages'}
              </button>
            </div>
          )}
          {hist.loading && <div className="px-5 py-10 text-center text-[13px] text-muted">Loading messages…</div>}
          {hist.error && !hist.loading && (
            <div className="mx-5 my-4 rounded-[10px] border border-accent/30 bg-accent-soft px-4 py-3 text-[13px] text-text-2">
              Couldn’t load this conversation: <span className="font-semibold">{hist.error}</span>
              {hist.error.includes('missing_scope') && <div className="mt-1 text-[12px] text-muted">Add the listed scope to your Slack app’s User Token Scopes and reinstall.</div>}
              {hist.error.includes('ratelimited') && <div className="mt-1 text-[12px] text-muted">This app is on Slack’s 1-request/minute history tier. Keep the app internal (public distribution off) for full speed.</div>}
            </div>
          )}
          {!hist.loading && !hist.error && hist.messages.length === 0 && <div className="px-5 py-10 text-center text-[13px] text-muted">No messages yet.</div>}

          {hist.messages.map((m, i) => {
            const id = `${m.channelId}:${m.ts}:${i}`;
            return (
              <div
                key={id}
                onMouseEnter={() => setHover(id)}
                onMouseLeave={() => setHover((h) => (h === id ? null : h))}
                className="relative flex gap-2.5 px-5 py-1.5"
                style={{ background: m.emergency ? 'var(--accent-soft)' : 'transparent', boxShadow: m.emergency ? 'inset 4px 0 0 #C0613A' : 'none' }}
              >
                <Avatar name={m.user} url={m.avatar} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-bold text-text">{m.user}</span>
                    <span className="text-[11.5px] text-muted">{fmtTs(m.ts)}</span>
                    {m.emergency && <span className="rounded-[9px] bg-accent px-2 py-px text-[10.5px] font-bold text-on-accent">Urgent</span>}
                  </div>
                  <div className="mt-px text-[14px] leading-[1.5] text-text"><SlackText text={m.text} /></div>
                  {m.reactions && m.reactions.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {m.reactions.map((r, ri) => (
                        <span key={ri} className="flex h-6 items-center gap-1.5 rounded-xl border px-2 text-[12px] font-semibold text-text-2" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent-soft-border)' }}>
                          {emojiFor(r.emoji)} {r.count}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.replies ? <div className="mt-1.5 text-[12.5px] font-semibold text-accent">{m.replies} repl{m.replies === 1 ? 'y' : 'ies'} in thread</div> : null}
                </div>
                {hover === id && (
                  <div className="absolute -top-3 right-[18px] flex items-center gap-0.5 rounded-[8px] border bg-surface p-[3px] shadow-md" style={{ borderColor: 'var(--accent-soft-border)' }}>
                    <span className="grid h-[22px] w-[22px] place-items-center rounded-[6px] text-[11px] text-on-accent" style={{ background: '#C0613A' }}>✦</span>
                    <button type="button" title="React 👍" onClick={() => void react(m)} className="rounded-[6px] px-2 py-1 text-[12px] font-semibold text-text-2 transition hover:bg-hover">👍</button>
                    <button type="button" onClick={() => void aiDraft(m)} className="rounded-[6px] px-2 py-1 text-[12px] font-semibold text-text-2 transition hover:bg-hover">Draft reply</button>
                    <button type="button" onClick={() => void markRead(m)} className="rounded-[6px] px-2 py-1 text-[12px] font-semibold text-text-2 transition hover:bg-hover">Mark read</button>
                    <button type="button" onClick={() => addToQueue(m)} className="rounded-[6px] px-2 py-1 text-[12px] font-semibold text-text-2 transition hover:bg-hover">Add to queue</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* composer — drafts route to Approvals, never direct-send */}
        <div className="flex-none px-[18px] pb-4">
          <div className="overflow-hidden rounded-[11px] border border-border shadow-sm">
            <textarea
              value={composeText}
              onChange={(e) => setComposeText(e.target.value)}
              placeholder={`Message ${activeChan ? (activeChan.kind === 'dm' ? activeChan.name : `#${activeChan.name}`) : ''}`}
              className="min-h-[58px] w-full resize-y bg-surface px-3.5 py-3 text-[14px] text-text outline-none placeholder:text-muted"
            />
            <div className="flex items-center gap-2 border-t border-border bg-surface-2 px-2.5 py-1.5">
              <span className="flex items-center gap-1.5 rounded-[14px] border border-border px-2.5 py-1 text-[11px] text-muted">
                <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="5" y="9" width="10" height="7" rx="1.5" /><path d="M7 9V7a3 3 0 0 1 6 0v2" /></svg>
                held for approval
              </span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => activeChan && enqueue(activeChan.name, composeText)}
                disabled={!activeChan || composeText.trim().length === 0}
                className="rounded-[8px] bg-accent px-4 py-1.5 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      {queued && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 rounded-[11px] border border-border bg-surface px-4 py-2.5 text-[12.5px] text-text-2 shadow-lg">
          Sent to Approvals. <a href="/approvals" className="pointer-events-auto font-semibold text-accent hover:underline">Review</a>
        </div>
      )}

      {marvin && (
        <div onClick={() => setMarvin(null)} className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(20,20,18,.34)' }}>
          <div onClick={(e) => e.stopPropagation()} className="w-[420px] rounded-2xl border border-border bg-surface p-5 shadow-2xl">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-[7px] text-[12px] font-bold text-on-accent" style={{ background: '#C0613A' }}>✦</span>
              <span className="text-[12px] font-bold text-text-2">MARVIN</span>
              <span className="text-[11px] text-muted">· Slack</span>
            </div>
            <div className="mb-1.5 text-[10.5px] font-bold tracking-[0.05em] text-text-2">{marvin.title}</div>
            {marvin.loading ? (
              <div className="flex items-center gap-2 py-3 text-[13px] text-muted"><span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent" /> Thinking…</div>
            ) : (
              <div className="mb-4 whitespace-pre-line text-[13.5px] leading-[1.6] text-text">{marvin.text}</div>
            )}
            <div className="flex justify-end">
              <button type="button" onClick={() => setMarvin(null)} className="rounded-[9px] px-4 py-2 text-[13px] font-semibold text-on-accent" style={{ background: '#C0613A' }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConvoRow({ c, active, onClick }: { c: Chan; active: boolean; onClick: () => void }) {
  const strong = c.hasUnread;
  const isDM = c.kind === 'dm';
  const isGroup = c.kind === 'group';
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-1 text-left transition"
      style={{ background: active ? 'var(--accent-soft)' : 'transparent' }}
    >
      {isDM || isGroup ? (
        <Avatar name={c.name} url={c.avatar} size={20} group={isGroup} />
      ) : (
        <span className="grid h-5 w-5 flex-none place-items-center text-[15px] leading-none" style={{ color: active || strong ? 'var(--text)' : 'var(--muted)' }}>#</span>
      )}
      <span className="flex-1 truncate text-[14px]" style={{ color: active || strong ? 'var(--text)' : 'var(--text-2)', fontWeight: strong ? 700 : active ? 600 : 400 }}>{c.name}</span>
      {c.unread > 0 ? (
        <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10.5px] font-bold text-on-accent">{c.unread}</span>
      ) : strong ? (
        <span className="h-2 w-2 rounded-full bg-accent" />
      ) : null}
    </button>
  );
}

function Header({ badge, refresh, refreshing }: { badge: string; refresh: () => void; refreshing: boolean }) {
  return (
    <div className="flex flex-none items-end gap-4 border-b border-border px-8 pb-4 pt-6">
      <div className="flex-1">
        <h1 className="font-display text-2xl font-semibold text-text">Slack</h1>
        <p className="mt-1 text-[13px] text-muted">Watched channels · MARVIN surfaces what matters</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[11.5px] text-muted">{badge}</span>
        <RefreshButton onClick={refresh} refreshing={refreshing} />
      </div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-sm text-text-2">{children}</div>;
}
