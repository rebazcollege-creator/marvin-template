'use client';

import { useMemo, useState } from 'react';
import { fetchSlack, PATHS } from '@/lib/marvin-data';
import { useLiveData } from '@/lib/use-live-data';
import { RefreshButton } from '@/components/ui/RefreshButton';
import type { SlackData } from '@/lib/marvin-protocol';
import { Modal } from '@/components/ui/Modal';
import { enqueueApproval } from '@/lib/approvals';

export default function SlackPage() {
  const { data, state, refresh, refreshing } = useLiveData<SlackData>(PATHS.slack, fetchSlack);
  const [active, setActive] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [queued, setQueued] = useState(false);
  const [channel, setChannel] = useState('');
  const [text, setText] = useState('');

  const badge = state === 'loading' ? 'Loading…' : state === 'offline' ? 'Sidecar offline' : data?.connected ? 'Connected' : 'Not connected';
  const messages = useMemo(() => data?.messages ?? [], [data]);
  const channels = useMemo(() => Array.from(new Set(messages.map((m) => m.channel))), [messages]);
  const current = active ?? channels[0] ?? null;
  const channelMsgs = messages.filter((m) => m.channel === current);

  const post = () => {
    const ch = channel.trim().replace(/^#/, '');
    if (ch.length === 0 || text.trim().length === 0) return;
    enqueueApproval({
      kind: 'slack',
      title: `Message #${ch}`,
      source: `Slack · #${ch}`,
      preview: `#${ch}\n\n${text.trim()}`,
      actionLabel: 'Post to Slack',
      payload: { kind: 'slack', channel: ch, text: text.trim() },
    });
    setText('');
    setComposing(false);
    setQueued(true);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-none items-end gap-4 border-b border-border px-8 pb-4 pt-6">
        <div className="flex-1">
          <h1 className="font-display text-2xl font-semibold text-text">Slack</h1>
          <p className="mt-1 text-[13px] text-muted">Watched channels · MARVIN surfaces what matters</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11.5px] text-muted">{badge}</span>
          <RefreshButton onClick={refresh} refreshing={refreshing} />
          <button type="button" onClick={() => { setComposing(true); setChannel(current ? `#${current}` : ''); }} className="rounded-[10px] bg-accent px-3.5 py-2 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">New message</button>
        </div>
      </div>

      {queued && (
        <div className="mx-8 mt-4 flex items-center gap-2 rounded-[11px] border border-border bg-surface px-4 py-2.5 text-[12.5px] text-text-2">
          <span className="h-1.5 w-1.5 rounded-full bg-green" /> Message sent to Approvals.
          <a href="/approvals" className="ml-auto font-semibold text-accent hover:underline">Review</a>
        </div>
      )}

      {state !== 'loaded' || !data?.connected || messages.length === 0 ? (
        <div className="px-8 py-7">
          {state === 'loading' && <div className="xsk h-24 rounded-2xl" />}
          {state === 'offline' && <Note>MARVIN’s runtime isn’t reachable. Start it with <code className="rounded bg-bg px-1">npm run sidecar</code>. You can still draft a message — it waits in Approvals.</Note>}
          {state === 'loaded' && data && !data.connected && <Note>Slack isn’t connected. Add SLACK_&lt;WORKSPACE&gt;_BOT_TOKEN (or connect on Connections) to watch your channels. You can still draft a message — it waits in Approvals.</Note>}
          {state === 'loaded' && data?.connected && messages.length === 0 && <Note>No recent messages in the watched channels.</Note>}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* channels */}
          <div className="w-[220px] flex-none overflow-y-auto border-r border-border p-3">
            <div className="mb-2 px-2 text-[11px] font-bold tracking-[0.08em] text-muted">CHANNELS</div>
            <div className="space-y-0.5">
              {channels.map((c) => (
                <button key={c} type="button" onClick={() => setActive(c)} className={`flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-left text-[13px] transition ${current === c ? 'bg-accent-soft font-semibold text-text' : 'text-text-2 hover:bg-hover'}`}>
                  <span className="text-muted">#</span>{c}
                </button>
              ))}
            </div>
          </div>
          {/* messages */}
          <div className="flex-1 overflow-y-auto px-7 py-6">
            <div className="mb-4 flex items-center gap-2 text-[13px] font-semibold text-text">
              <span className="text-muted">#</span>{current}
            </div>
            <div className="space-y-3">
              {channelMsgs.map((m, i) => (
                <div key={i} className="flex gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-accent-soft text-[11px] font-bold text-accent">{(m.user || '?').slice(0, 2).toUpperCase()}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12.5px] font-semibold text-text">{m.user || 'unknown'}</span>
                      {m.emergency && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-on-accent">Emergency</span>}
                    </div>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-text-2">{m.text}</p>
                  </div>
                </div>
              ))}
            </div>
            {current && (
              <button type="button" onClick={() => { setComposing(true); setChannel(`#${current}`); }} className="mt-6 w-full rounded-[12px] border border-dashed border-border bg-surface px-4 py-3 text-left text-[13px] text-muted transition hover:bg-hover">
                Message #{current}…
              </button>
            )}
          </div>
        </div>
      )}

      <Modal open={composing} onClose={() => setComposing(false)} title="New message" subtitle="Held in Approvals before it posts" width="max-w-lg">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-muted">Channel</span>
            <input value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="#channel" className="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-text outline-none focus:border-accent" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-muted">Message</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your message…" className="min-h-32 w-full resize-y rounded-[10px] border border-border bg-bg px-3 py-3 text-[13.5px] leading-relaxed text-text outline-none focus:border-accent" />
          </label>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <p className="text-[11.5px] text-muted">The Amargi Studio can compose this for you.</p>
          <div className="flex gap-2.5">
            <button type="button" onClick={() => setComposing(false)} className="rounded-[10px] border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-text-2 hover:bg-hover">Cancel</button>
            <button type="button" onClick={post} disabled={channel.trim().length === 0 || text.trim().length === 0} className="rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent-dim disabled:opacity-40">Post</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-sm text-text-2">{children}</div>;
}
