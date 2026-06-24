'use client';

import { useState } from 'react';
import { fetchBuffer, PATHS } from '@/lib/marvin-data';
import { useLiveData } from '@/lib/use-live-data';
import type { BufferData } from '@/lib/marvin-protocol';
import { Modal } from '@/components/ui/Modal';
import { enqueueApproval } from '@/lib/approvals';

const PLATFORMS = ['Instagram', 'TikTok', 'LinkedIn', 'X', 'Threads', 'Facebook'];

export default function BufferPage() {
  const { data, state } = useLiveData<BufferData>(PATHS.buffer, fetchBuffer);
  const [creating, setCreating] = useState(false);
  const [queued, setQueued] = useState(false);
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  const [caption, setCaption] = useState('');

  const badge = state === 'loading' ? 'Loading…' : state === 'offline' ? 'Sidecar offline' : data?.connected ? 'Connected' : 'Not connected';

  const createPost = () => {
    if (caption.trim().length === 0) return;
    enqueueApproval({
      kind: 'social',
      title: `${platform} post`,
      source: `Buffer · ${platform}`,
      preview: `Platform: ${platform}\n\n${caption.trim()}`,
      actionLabel: 'Schedule post',
      payload: { kind: 'social', platform: platform ?? 'Instagram', caption: caption.trim() },
    });
    setCaption('');
    setCreating(false);
    setQueued(true);
  };

  return (
    <div className="mx-auto max-w-3xl px-8 pb-16 pt-7">
      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">Buffer</h1>
          <p className="mt-1 text-[13px] text-muted">Social queue · all channels</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11.5px] text-muted">{badge}</span>
          <button type="button" onClick={() => setCreating(true)} className="rounded-[10px] bg-accent px-3.5 py-2 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">New post</button>
        </div>
      </div>

      {queued && (
        <div className="mb-4 flex items-center gap-2 rounded-[11px] border border-border bg-surface px-4 py-2.5 text-[12.5px] text-text-2">
          <span className="h-1.5 w-1.5 rounded-full bg-green" /> Draft sent to Approvals.
          <a href="/approvals" className="ml-auto font-semibold text-accent hover:underline">Review</a>
        </div>
      )}

      {state === 'loading' && <div className="xsk h-24 rounded-2xl" />}
      {state === 'offline' && <Note>MARVIN’s runtime isn’t reachable. Start it with <code className="rounded bg-bg px-1">npm run sidecar</code>. You can still draft a post — it waits in Approvals.</Note>}
      {state === 'loaded' && data && !data.connected && <Note>Buffer connects via Direct MCP (pending wiring). Draft/scheduled counts per platform will appear here. You can still draft a post — it waits in Approvals. Publishing always needs your confirmation.</Note>}
      {state === 'loaded' && data?.connected && data.drafts === 0 && data.scheduled === 0 && <Note>Nothing in the Buffer queue.</Note>}

      {state === 'loaded' && data?.connected && (data.drafts > 0 || data.scheduled > 0) && (
        <ul className="space-y-2.5">
          <li className="flex items-center justify-between rounded-[14px] border border-border bg-surface p-4">
            <span className="text-[13px] text-text-2">Drafts / Scheduled</span>
            <span className="tabular-nums text-[13px] font-semibold text-text">{data.drafts} / {data.scheduled}</span>
          </li>
          {data.byPlatform.map((p) => (
            <li key={p.platform} className="flex items-center justify-between rounded-[14px] border border-border bg-surface p-4">
              <span className="text-[13px] text-text">{p.platform}</span>
              <span className="tabular-nums text-[13px] text-muted">{p.count}</span>
            </li>
          ))}
        </ul>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="New post" subtitle="Held in Approvals before it’s scheduled" width="max-w-lg">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-muted">Channel</span>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-text outline-none focus:border-accent">
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-muted">Caption</span>
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Write the caption…" className="min-h-36 w-full resize-y rounded-[10px] border border-border bg-bg px-3 py-3 text-[13.5px] leading-relaxed text-text outline-none focus:border-accent" />
          </label>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <p className="text-[11.5px] text-muted">The Amargi Studio can draft this in brand voice.</p>
          <div className="flex gap-2.5">
            <button type="button" onClick={() => setCreating(false)} className="rounded-[10px] border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-text-2 hover:bg-hover">Cancel</button>
            <button type="button" onClick={createPost} disabled={caption.trim().length === 0} className="rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent-dim disabled:opacity-40">Queue post</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-sm text-text-2">{children}</div>;
}
