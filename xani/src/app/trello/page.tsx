'use client';

import { useState } from 'react';
import { fetchTrello, PATHS } from '@/lib/marvin-data';
import { useLiveData } from '@/lib/use-live-data';
import { RefreshButton } from '@/components/ui/RefreshButton';
import type { TrelloData } from '@/lib/marvin-protocol';
import { Modal } from '@/components/ui/Modal';
import { enqueueApproval } from '@/lib/approvals';

type Card = TrelloData['cards'][number];
const LISTS = ['To do', 'Doing', 'In review', 'Done'];

export default function TrelloPage() {
  const { data, state, refresh, refreshing } = useLiveData<TrelloData>(PATHS.trello, fetchTrello);
  const [open, setOpen] = useState<Card | null>(null);
  const [creating, setCreating] = useState(false);
  const [queued, setQueued] = useState(false);

  // new-card form
  const [title, setTitle] = useState('');
  const [list, setList] = useState(LISTS[0]);
  const [due, setDue] = useState('');
  // move form
  const [moveTo, setMoveTo] = useState(LISTS[0]);

  const badge = state === 'loading' ? 'Loading…' : state === 'offline' ? 'Sidecar offline' : data?.connected ? 'Connected' : 'Not connected';
  const cards = data?.cards ?? [];

  const createCard = () => {
    if (title.trim().length === 0) return;
    enqueueApproval({
      kind: 'task',
      title: title.trim(),
      source: 'Trello · Amargi board',
      preview: `List: ${list}${due ? `\nDue: ${new Date(due).toLocaleDateString('en-GB')}` : ''}\n\n${title.trim()}`,
      actionLabel: 'Create card',
      payload: { kind: 'task', name: title.trim(), list, due: due || undefined },
    });
    setTitle('');
    setDue('');
    setCreating(false);
    setQueued(true);
  };

  const requestMove = (card: Card) => {
    enqueueApproval({
      kind: 'task',
      title: `Move “${card.name}” → ${moveTo}`,
      source: 'Trello · Amargi board',
      preview: `Move card to list: ${moveTo}\n\n${card.name}`,
      actionLabel: 'Move card',
    });
    setOpen(null);
    setQueued(true);
  };

  return (
    <div className="mx-auto max-w-3xl px-8 pb-16 pt-7">
      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">Trello</h1>
          <p className="mt-1 text-[13px] text-muted">Amargi social media board</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11.5px] text-muted">{badge}</span>
          <RefreshButton onClick={refresh} refreshing={refreshing} />
          <button type="button" onClick={() => setCreating(true)} className="rounded-[10px] bg-accent px-3.5 py-2 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">New card</button>
        </div>
      </div>

      {queued && (
        <div className="mb-4 flex items-center gap-2 rounded-[11px] border border-border bg-surface px-4 py-2.5 text-[12.5px] text-text-2">
          <span className="h-1.5 w-1.5 rounded-full bg-green" /> Sent to Approvals.
          <a href="/approvals" className="ml-auto font-semibold text-accent hover:underline">Review</a>
        </div>
      )}

      {state === 'loading' && <div className="xsk h-24 rounded-2xl" />}
      {state === 'offline' && <Note>MARVIN’s runtime isn’t reachable. Start it with <code className="rounded bg-bg px-1">npm run sidecar</code>. You can still draft a card — it waits in Approvals.</Note>}
      {state === 'loaded' && data && !data.connected && <Note>Trello connects via Zapier MCP (pending wiring). Cards will appear here, urgent first. You can still draft a card — it waits in Approvals. Moving a card always needs your confirmation.</Note>}
      {state === 'loaded' && data?.connected && cards.length === 0 && <Note>No cards awaiting action.</Note>}

      {state === 'loaded' && data?.connected && cards.length > 0 && (
        <ul className="space-y-2.5">
          {cards.map((c, i) => (
            <li key={i}>
              <button type="button" onClick={() => { setOpen(c); setMoveTo(LISTS[0] ?? 'To do'); }} className="flex w-full items-center justify-between rounded-[14px] border border-border bg-surface p-4 text-left transition hover:bg-hover">
                <div className="min-w-0">
                  <span className="text-[13.5px] font-semibold text-text">{c.name}</span>
                  {c.due && <p className="text-[11.5px] text-muted">due {new Date(c.due).toLocaleDateString('en-GB')}</p>}
                </div>
                {c.urgent && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-semibold text-on-accent">Urgent</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* card detail / move */}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''} subtitle="Amargi board" width="max-w-lg">
        {open && (
          <>
            {open.labels.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {open.labels.map((l) => <span key={l} className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">{l}</span>)}
              </div>
            )}
            {open.due && <p className="text-[12.5px] text-text-2">Due {new Date(open.due).toLocaleDateString('en-GB')}</p>}
            <div className="mt-4 text-[11px] font-bold tracking-[0.07em] text-muted">MOVE CARD</div>
            <div className="mt-2 flex items-center gap-2">
              <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className="flex-1 rounded-[10px] border border-border bg-bg px-3 py-2 text-[13px] text-text outline-none focus:border-accent">
                {LISTS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <button type="button" onClick={() => requestMove(open)} className="rounded-[10px] bg-accent px-3.5 py-2 text-[12.5px] font-semibold text-on-accent hover:bg-accent-dim">Request move</button>
            </div>
            <div className="mt-4 flex justify-end gap-2.5">
              {open.url && <a href={open.url} target="_blank" rel="noreferrer" className="rounded-[10px] border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-text-2 hover:bg-hover">Open in Trello</a>}
              <button type="button" onClick={() => setOpen(null)} className="rounded-[10px] border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-text-2 hover:bg-hover">Close</button>
            </div>
          </>
        )}
      </Modal>

      {/* new card */}
      <Modal open={creating} onClose={() => setCreating(false)} title="New card" subtitle="Held in Approvals before it’s created" width="max-w-lg">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-muted">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" className="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-text outline-none focus:border-accent" />
          </label>
          <div className="flex gap-3">
            <label className="flex-1">
              <span className="mb-1 block text-[11.5px] font-semibold text-muted">List</span>
              <select value={list} onChange={(e) => setList(e.target.value)} className="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-text outline-none focus:border-accent">
                {LISTS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <label className="flex-1">
              <span className="mb-1 block text-[11.5px] font-semibold text-muted">Due (optional)</span>
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-text outline-none focus:border-accent" />
            </label>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2.5">
          <button type="button" onClick={() => setCreating(false)} className="rounded-[10px] border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-text-2 hover:bg-hover">Cancel</button>
          <button type="button" onClick={createCard} disabled={title.trim().length === 0} className="rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent-dim disabled:opacity-40">Create card</button>
        </div>
      </Modal>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-sm text-text-2">{children}</div>;
}
