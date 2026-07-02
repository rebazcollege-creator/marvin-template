'use client';

import { useEffect, useState } from 'react';
import { ensureStorageReady } from '@/lib/storage';
import { AUTONOMY_DEFS, getAutonomy, setAutonomy, type Level } from '@/lib/autonomy';
import { listApprovals, saveApprovals, decideApproval, type ApprovalItem, type ApprovalKind } from '@/lib/approvals';
import { actMarvin } from '@/lib/marvin-client';
import { addVoiceSampleByKey } from '@/lib/voice';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

const LEVELS: { id: Level; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'ask', label: 'Ask' },
  { id: 'never', label: 'Never' },
];

const KIND_TINT: Record<ApprovalKind, { tint: string; edge: string; label: string }> = {
  email: { tint: 'var(--accent-soft)', edge: '#C0613A', label: 'Email' },
  social: { tint: '#F8EFDF', edge: '#D89A4E', label: 'Post' },
  calendar: { tint: '#E8EEE5', edge: '#6E8B6A', label: 'Calendar' },
  files: { tint: '#ECE7F1', edge: '#7A6E9C', label: 'Files' },
  slack: { tint: '#ECE7F1', edge: '#7A6E9C', label: 'Slack' },
  task: { tint: 'var(--accent-soft)', edge: '#C0613A', label: 'Task' },
};

export default function ApprovalsPage() {
  const [levels, setLevels] = useState<Record<string, Level>>({});
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState<ApprovalItem | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    ensureStorageReady().then(() => {
      setLevels(getAutonomy());
      setItems(listApprovals());
      setReady(true);
    });
  }, []);

  const persist = (next: ApprovalItem[]) => {
    setItems(next);
    saveApprovals(next);
  };
  const decide = (id: string, status: 'approved' | 'rejected') => {
    decideApproval(id, status);
    setItems(listApprovals());
  };

  const approve = async (item: ApprovalItem) => {
    // No executable payload → this item can't actually be sent/created yet. Say so
    // honestly and mark it reviewed; never imply it went out.
    if (!item.payload) {
      decide(item.id, 'approved');
      setResult(`Marked as reviewed — but this one isn’t wired to send yet, so nothing was sent.`);
      return;
    }
    setResult(`Running “${item.title}”…`);
    const r = await actMarvin(item.payload);
    if (r.ok) {
      decide(item.id, 'approved');
      setResult(`Done — ${item.title}.${r.url ? ' Opened in the app.' : ''}`);
    } else if (r.offline) {
      // Runtime unreachable → nothing was sent. Keep the item PENDING so it can be
      // retried; do NOT mark it approved (there is no queue that re-runs it later).
      setResult('Couldn’t reach the runtime, so nothing was sent. It’s still waiting for you — start the runtime (npm run sidecar) and approve again.');
    } else {
      setResult(`Couldn’t run: ${r.error ?? r.note ?? 'not connected'}. Left in the queue.`);
    }
  };
  const saveEdit = (id: string) => {
    const item = items.find((i) => i.id === id);
    // Draft-edit learning: a meaningful rewrite of an email/Slack draft is real Rebaz
    // writing — store it as a fresh voice sample so future drafts sound more like him.
    if (item?.voiceKey && draft.trim() && draft.trim() !== item.preview.trim()) {
      addVoiceSampleByKey(item.voiceKey, draft.trim());
      setResult('Learned your edit — future drafts will sound more like you.');
    }
    persist(items.map((i) => (i.id === id ? { ...i, preview: draft } : i)));
    setEditing(null);
  };

  const setLevel = (id: string, level: Level) => {
    const next = { ...levels, [id]: level };
    setLevels(next);
    setAutonomy(next);
  };

  const pending = items.filter((i) => i.status === 'pending');
  const autoCount = Object.values(levels).filter((l) => l === 'auto').length;
  const askCount = Object.values(levels).filter((l) => l === 'ask').length;
  const neverCount = Object.values(levels).filter((l) => l === 'never').length;

  return (
    <div className="mx-auto max-w-[720px] px-8 pb-16 pt-7">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-text">Approvals</h1>
        <p className="mt-1 text-[13px] text-muted">
          The trust gate. Outward actions wait here for your nod, gated by the autonomy you set below.
        </p>
      </header>

      {result && (
        <div className="mb-4 flex items-center gap-2 rounded-[11px] border border-border bg-surface px-4 py-2.5 text-[12.5px] text-text-2">
          <span className="h-1.5 w-1.5 rounded-full bg-green" /> {result}
          <button type="button" onClick={() => setResult(null)} className="ml-auto text-muted hover:text-text">✕</button>
        </div>
      )}

      {/* queue */}
      {!ready ? (
        <div className="mb-9 space-y-2.5">{[0, 1].map((i) => <div key={i} className="xsk h-28 rounded-2xl" />)}</div>
      ) : pending.length === 0 ? (
        <div className="mb-9 rounded-[16px] border border-dashed border-border bg-surface px-6 py-12 text-center">
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-green-soft text-green-ink">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7" /></svg>
          </div>
          <p className="text-sm font-semibold text-text">You’re all caught up</p>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] text-text-2">
            Nothing is waiting on you. When MARVIN prepares something you’ve set to “Ask” — or you route an
            action here — it appears with a preview and a one-tap approve.
          </p>
        </div>
      ) : (
        <div className="mb-9 space-y-2.5">
          <div className="text-[11px] font-bold tracking-[0.08em] text-muted">WAITING ON YOU ({pending.length})</div>
          {pending.map((it) => {
            const k = KIND_TINT[it.kind];
            const isEditing = editing === it.id;
            return (
              <div key={it.id} className="rounded-[14px] border border-border bg-surface p-[18px]">
                <div className="flex items-start gap-3">
                  <span className="rounded-[7px] px-2 py-1 text-[10.5px] font-semibold" style={{ background: k.tint, color: k.edge }}>{k.label}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold text-text">{it.title}</div>
                    <div className="text-[11.5px] text-muted">{it.source}</div>
                  </div>
                </div>
                {isEditing ? (
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="mt-3 min-h-24 w-full resize-y rounded-[11px] border border-border bg-bg px-3.5 py-3 text-[12.5px] leading-relaxed text-text outline-none focus:border-accent"
                  />
                ) : (
                  <div className="mt-3 whitespace-pre-wrap rounded-[11px] border border-border bg-bg px-3.5 py-3 text-[12.5px] leading-relaxed text-text-2">{it.preview}</div>
                )}
                <div className="mt-3 flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <button type="button" onClick={() => saveEdit(it.id)} className="rounded-[9px] bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-on-accent hover:bg-accent-dim">Save</button>
                      <button type="button" onClick={() => setEditing(null)} className="rounded-[9px] border border-border bg-bg px-3.5 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-hover">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => setConfirming(it)} className="rounded-[9px] bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-on-accent hover:bg-accent-dim">{it.actionLabel}</button>
                      <button type="button" onClick={() => { setEditing(it.id); setDraft(it.preview); }} className="rounded-[9px] border border-border bg-bg px-3.5 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-hover">Edit</button>
                      <button type="button" onClick={() => decide(it.id, 'rejected')} className="ml-auto rounded-[9px] px-3 py-1.5 text-[12.5px] font-semibold text-muted hover:text-accent">Reject</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* autonomy */}
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11px] font-bold tracking-[0.08em] text-muted">AUTONOMY BY CATEGORY</div>
        {ready && (
          <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 5 6v5c0 4 3 7 7 8 4-1 7-4 7-8V6z" /></svg>
            {autoCount} auto · {askCount} ask · {neverCount} never
          </div>
        )}
      </div>
      <div className="overflow-hidden rounded-[16px] border border-border bg-surface">
        {AUTONOMY_DEFS.map((d, i) => {
          const cur = levels[d.id] ?? 'ask';
          return (
            <div key={d.id} className={`flex items-center justify-between gap-4 px-5 py-4 ${i > 0 ? 'border-t border-border' : ''}`}>
              <div>
                <div className="text-sm font-medium text-text">{d.label}</div>
                <div className="text-[12px] text-muted">{d.sub}</div>
              </div>
              <div className="flex shrink-0 rounded-[10px] border border-border bg-bg p-0.5">
                {LEVELS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    aria-pressed={cur === l.id}
                    onClick={() => setLevel(d.id, l.id)}
                    className={`rounded-lg px-3 py-1 text-[12px] font-semibold transition ${
                      cur === l.id
                        ? l.id === 'never'
                          ? 'bg-text text-bg'
                          : l.id === 'auto'
                            ? 'bg-green text-white'
                            : 'bg-accent text-on-accent'
                        : 'text-text-2 hover:text-text'
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] text-muted">
        These gates back the runtime’s action guard. Locked rules (e.g. confirm before every send, nothing on days off) always apply on top and can’t be loosened here.
      </p>

      <ConfirmModal
        open={!!confirming}
        title={confirming ? confirming.actionLabel : ''}
        body={confirming ? 'Approve this action? It’s recorded as approved now and runs through MARVIN’s runtime when it’s on — gated by your autonomy settings.' : ''}
        detail={confirming?.preview}
        okLabel={confirming?.actionLabel ?? 'Approve'}
        onConfirm={() => { if (confirming) void approve(confirming); }}
        onClose={() => setConfirming(null)}
      />
    </div>
  );
}
