'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSlack, fetchSlackHistory, PATHS, draftReply, summarizeThread } from '@/lib/marvin-data';
import { useLiveData } from '@/lib/use-live-data';
import { RefreshButton } from '@/components/ui/RefreshButton';
import type { SlackData } from '@/lib/marvin-protocol';
import { enqueueApproval } from '@/lib/approvals';
import { voicePromptFor } from '@/lib/voice';
import { SlackText, emojiFor } from '@/lib/slack-mrkdwn';
import { markSlackRead } from '@/lib/marvin-data';
import { buildSidebar, defaultConversationId, QUIET_CHANNELS_SHOWN } from '@/lib/slack-view-core';

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

  // Conversations opened this session are treated as read immediately (optimistic),
  // so an unread clears from the glance list the moment Rebaz reads it.
  const [locallyRead, setLocallyRead] = useState<Set<string>>(new Set());
  const [showAllChannels, setShowAllChannels] = useState(false);

  // Slack-faithful sidebar: Unread first (the glance), then DMs, then channels.
  const sidebar = useMemo(() => {
    const convos = allChannels
      .filter((c) => c.workspace === activeWs)
      .map((c) => (locallyRead.has(c.id) ? { ...c, hasUnread: false, unread: 0 } : c));
    return buildSidebar(convos);
  }, [allChannels, activeWs, locallyRead]);

  const hasAnyDm = useMemo(
    () => allChannels.some((c) => c.workspace === activeWs && (c.kind === 'dm' || c.kind === 'group')),
    [allChannels, activeWs],
  );

  // Default-open the most important conversation (top unread → recent DM → recent
  // channel), never the alphabetically-first one. activeChan is derived from the
  // SAME id the history loads from, so the header can never say "# —" over a loaded
  // conversation again.
  const effectiveChId = chId ?? defaultConversationId(sidebar);
  const activeChan: Chan | null = allChannels.find((c) => c.workspace === activeWs && c.id === effectiveChId) ?? null;

  // Open a conversation and mark it read (optimistic locally + best-effort in Slack).
  const openConvo = useCallback((c: Chan) => {
    setChId(c.id);
    if (c.hasUnread) {
      setLocallyRead((s) => new Set(s).add(c.id));
      void markSlackRead({ workspace: c.workspace, channel: c.id, ts: c.lastTs });
    }
  }, []);

  // Reset selection + optimistic-read when the workspace changes.
  useEffect(() => { setChId(null); setLocallyRead(new Set()); setShowAllChannels(false); }, [activeWs]);

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

        {/* token-kind honesty line */}
        <div className="border-b border-border px-4 py-1.5 text-[11px] text-muted">
          {activeWsRec?.tokenKind === 'user'
            ? 'Reading as you · unread + DMs on'
            : activeWsRec?.tokenKind === 'bot'
              ? 'Bot token · no unread or DMs (add a user token)'
              : '—'}
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4 pt-2">
          {activeWsRec?.error && (
            <div className="mx-1 mb-2 rounded-[9px] border border-accent/30 bg-accent-soft px-2.5 py-2 text-[11.5px] text-text-2">
              Slack error: <span className="font-semibold">{activeWsRec.error}</span>
            </div>
          )}

          {/* Unread — the one glance: everything that needs you, most-recent first. */}
          {sidebar.unread.length > 0 && (
            <>
              <div className="flex items-center justify-between px-2.5 pb-1 pt-1">
                <span className="text-[13px] font-semibold text-muted">Unread</span>
                <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10.5px] font-bold text-on-accent">{sidebar.totalUnread || sidebar.unread.length}</span>
              </div>
              {sidebar.unread.map((c) => (
                <ConvoRow key={c.id} c={c} active={c.id === effectiveChId} dm={c.kind !== 'channel'} onClick={() => openConvo(c)} />
              ))}
            </>
          )}

          {/* Direct messages — always visible, never buried under a wall of channels. */}
          <div className="px-2.5 pb-1 pt-3.5 text-[13px] font-semibold text-muted">Direct messages</div>
          {sidebar.dms.map((c) => <ConvoRow key={c.id} c={c} active={c.id === effectiveChId} dm onClick={() => openConvo(c)} />)}
          {!hasAnyDm && (
            <div className="px-2.5 py-2 text-[12px] leading-snug text-muted">
              {activeWsRec?.tokenKind === 'user' ? 'No direct messages.' : 'DMs need a user token (xoxp-).'}
            </div>
          )}

          {/* Channels — recent activity first; quiet ones collapse so this isn't noise. */}
          <div className="px-2.5 pb-1 pt-3.5 text-[13px] font-semibold text-muted">Channels</div>
          {(showAllChannels ? sidebar.channels : sidebar.channels.slice(0, QUIET_CHANNELS_SHOWN)).map((c) => (
            <ConvoRow key={c.id} c={c} active={c.id === effectiveChId} onClick={() => openConvo(c)} />
          ))}
          {sidebar.channels.length > QUIET_CHANNELS_SHOWN && (
            <button type="button" onClick={() => setShowAllChannels((v) => !v)} className="mt-0.5 flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-1.5 text-[13px] font-medium text-muted transition hover:bg-hover">
              <span className="grid h-5 w-5 place-items-center rounded-[6px] bg-hover text-[13px] leading-none">{showAllChannels ? '–' : '+'}</span>
              {showAllChannels ? 'Show fewer' : `${sidebar.channels.length - QUIET_CHANNELS_SHOWN} more channels`}
            </button>
          )}
          {sidebar.unread.length === 0 && sidebar.dms.length === 0 && sidebar.channels.length === 0 && (
            <div className="px-2.5 py-2 text-[12.5px] text-muted">Nothing here yet — invite the app to a channel in Slack, or add a user token for your DMs.</div>
          )}
          <a href="/connections" className="mt-0.5 flex items-center gap-2.5 rounded-[7px] px-2.5 py-1.5 text-[14px] text-muted transition hover:bg-hover">
            <span className="grid h-5 w-5 place-items-center rounded-[6px] bg-hover text-[15px] leading-none">+</span> Add channels
          </a>

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
            const col = colorFor(m.user);
            return (
              <div
                key={id}
                onMouseEnter={() => setHover(id)}
                onMouseLeave={() => setHover((h) => (h === id ? null : h))}
                className="relative flex gap-2.5 px-5 py-1.5"
                style={{ background: m.emergency ? 'var(--accent-soft)' : 'transparent', boxShadow: m.emergency ? 'inset 4px 0 0 #C0613A' : 'none' }}
              >
                <span className="grid h-9 w-9 flex-none place-items-center rounded-[9px] text-[13px] font-bold text-on-accent" style={{ background: col }}>{initials(m.user)}</span>
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
                    <button type="button" onClick={summarise} className="rounded-[6px] px-2 py-1 text-[12px] font-semibold text-text-2 transition hover:bg-hover">Summarise</button>
                    <button type="button" onClick={() => void aiDraft(m)} className="rounded-[6px] px-2 py-1 text-[12px] font-semibold text-text-2 transition hover:bg-hover">Draft reply</button>
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

function ConvoRow({ c, active, dm, onClick }: { c: Chan; active: boolean; dm?: boolean; onClick: () => void }) {
  const strong = c.hasUnread;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-1.5 text-left transition"
      style={{ background: active ? 'var(--accent-soft)' : 'transparent' }}
    >
      {dm ? (
        <span className="grid h-5 w-5 flex-none place-items-center rounded-[6px] text-[10px] font-bold text-on-accent" style={{ background: colorFor(c.name) }}>{initials(c.name)}</span>
      ) : (
        <span className="text-[15px] leading-none" style={{ color: active || strong ? 'var(--text)' : 'var(--muted)' }}>{c.kind === 'group' ? '⌗' : '#'}</span>
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
