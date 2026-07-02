'use client';

import { useEffect, useState } from 'react';
import {
  approveMemory,
  getAdjustments,
  getMemories,
  getProposedMemories,
  ingestMemory,
  rejectMemory,
  removeMemory,
  runMemoryMaintenance,
  setAdjustmentStatus,
  updateMemory,
  type MemoryCategory,
  type MemoryEntry,
  type SelfAdjustment,
} from '@/lib/memory';
import { ensureStorageReady } from '@/lib/storage';
import { Modal } from '@/components/ui/Modal';
import { logActivity } from '@/lib/activity';
import { learningTrend, MIN_DECISIONS, type LearningTrend } from '@/lib/learning-metrics';

/**
 * Memory — what MARVIN has learned, what it wants to remember, and the changes it
 * wants to make to itself. All human-in-the-loop. Add/edit happen in calm modals;
 * every existing handler (write-gate ingest, approve/reject, self-adjustments,
 * pin/forget, maintenance) is preserved.
 */

const CATEGORIES: MemoryCategory[] = ['rule', 'preference', 'fact', 'workflow', 'correction', 'episode', 'other'];

type Editing = { id?: string; category: MemoryCategory; content: string };

export default function MemoryPage() {
  const [memories, setMemories] = useState<MemoryEntry[] | null>(null);
  const [proposed, setProposed] = useState<MemoryEntry[]>([]);
  const [adjustments, setAdjustments] = useState<SelfAdjustment[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [trend, setTrend] = useState<LearningTrend | null>(null);

  const refresh = () => {
    setMemories(getMemories());
    setProposed(getProposedMemories());
    setAdjustments(getAdjustments());
    setTrend(learningTrend());
  };

  useEffect(() => {
    ensureStorageReady().then(() => {
      runMemoryMaintenance();
      refresh();
    });
  }, []);

  if (!memories) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <div className="h-8 w-40 animate-pulse rounded bg-border" />
      </div>
    );
  }

  const save = () => {
    if (!editing || !editing.content.trim()) return;
    if (editing.id) {
      updateMemory(editing.id, { content: editing.content.trim(), category: editing.category });
    } else {
      ingestMemory({ category: editing.category, content: editing.content.trim(), source: 'manual' });
      logActivity({ kind: 'memory', title: `Remembered: ${editing.content.trim().slice(0, 60)}`, detail: editing.category });
    }
    setEditing(null);
    refresh();
  };

  const pending = adjustments.filter((a) => a.status === 'pending');

  return (
    <div className="mx-auto max-w-3xl px-8 pb-16 pt-7">
      <h1 className="font-display text-2xl font-semibold text-text">Memory</h1>
      <p className="mt-1 text-[13px] text-muted">What MARVIN knows about you, and how it carries that forward.</p>

      {/* Is it getting sharper? Honest weekly wrong-call rate, not a vanity counter:
          the rate can only fall through real accuracy, and the decision count shows
          whether a falling rate means "smarter" or just "unused". */}
      {trend && (
        <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Is MARVIN getting sharper?</div>
          {trend.thisWeek.decisions === 0 && trend.lastWeek.decisions === 0 ? (
            <p className="mt-2 text-[13px] text-text-2">
              No data yet. Every “Track it” or “Not for me” you tap on Home teaches MARVIN — and shows up here as an honest weekly score.
            </p>
          ) : (
            <>
              <p className="mt-2 text-[13.5px] text-text">
                This week: <span className="font-semibold">{trend.thisWeek.decisions}</span> calls reviewed,{' '}
                <span className="font-semibold">{trend.thisWeek.corrections}</span> wrong
                {trend.rateThisWeek !== null && <> ({Math.round(trend.rateThisWeek * 100)}% wrong-call rate)</>}
                {trend.rateLastWeek !== null && <> · last week {Math.round(trend.rateLastWeek * 100)}%</>}
              </p>
              <p className="mt-1 text-[12.5px] text-text-2">
                {trend.improving === true && '↓ Getting sharper — it needed fewer corrections than last week.'}
                {trend.improving === false && '↑ Rougher week — keep correcting it; every tap teaches it.'}
                {trend.improving === null && `Not enough decisions yet for a fair trend (needs ${MIN_DECISIONS}+ per week).`}
              </p>
            </>
          )}
        </section>
      )}

      {/* Self-adjustments */}
      {pending.length > 0 && (
        <section className="mt-7 rounded-2xl border border-accent/40 bg-surface p-6">
          <h2 className="font-display text-lg font-semibold text-text">MARVIN wants to adjust itself</h2>
          <p className="mt-1 text-[13px] text-text-2">Review each proposal. Nothing changes until you approve it. Locked safety rules can never be changed this way.</p>
          <div className="mt-4 space-y-3">
            {pending.map((a) => (
              <div key={a.id} className="rounded-xl border border-border p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-accent">{a.target}</p>
                <p className="mt-1 text-[13.5px] text-text">{a.rationale}</p>
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-bg p-3 text-[12px] text-text-2">{a.proposed}</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => { setAdjustmentStatus(a.id, 'approved'); refresh(); }} className="rounded-lg bg-accent px-4 py-1.5 text-[13px] font-semibold text-on-accent hover:bg-accent-dim">Approve</button>
                  <button type="button" onClick={() => { setAdjustmentStatus(a.id, 'rejected'); refresh(); }} className="rounded-lg border border-border px-4 py-1.5 text-[13px] text-text-2 hover:text-text">Reject</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Proposed memories */}
      {proposed.length > 0 && (
        <section className="mt-7 rounded-2xl border border-border bg-surface p-6">
          <h2 className="font-display text-lg font-semibold text-text">Proposed memories</h2>
          <p className="mt-1 text-[13px] text-text-2">Inferred, or derived from email/Slack/web content — untrusted until you approve. Approving marks it trusted.</p>
          <ul className="mt-4 space-y-3">
            {proposed.map((m) => (
              <li key={m.id} className="rounded-xl border border-border p-4">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{m.category} · via {m.source} · trust {m.trust}</span>
                <p className="mt-1 text-[13.5px] text-text">{m.content}</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => { approveMemory(m.id); refresh(); }} className="rounded-lg bg-accent px-4 py-1.5 text-[13px] font-semibold text-on-accent hover:bg-accent-dim">Approve</button>
                  <button type="button" onClick={() => { rejectMemory(m.id); refresh(); }} className="rounded-lg border border-border px-4 py-1.5 text-[13px] text-text-2 hover:text-text">Reject</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Active memory */}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-text">Learned ({memories.length})</h2>
        <button type="button" onClick={() => setEditing({ category: 'preference', content: '' })} className="rounded-[10px] bg-accent px-3.5 py-2 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">Add memory</button>
      </div>

      {memories.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-border bg-surface p-8 text-sm text-text-2">
          Nothing learned yet. As you work with MARVIN it will propose durable preferences, facts and corrections here — and you can add your own with “Add memory”.
        </p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {memories.map((m) => (
            <li key={m.id} className="rounded-[14px] border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{m.tier} · {m.category} · trust {m.trust}</span>
                  <p className="mt-1 text-[13.5px] text-text">{m.content}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button type="button" onClick={() => setEditing({ id: m.id, category: m.category, content: m.content })} className="rounded-md border border-border px-2 py-1 text-[11.5px] text-text-2 hover:text-text">Edit</button>
                  <button type="button" aria-pressed={m.pinned} onClick={() => { updateMemory(m.id, { pinned: !m.pinned }); refresh(); }} className={`rounded-md px-2 py-1 text-[11.5px] ${m.pinned ? 'bg-accent text-on-accent' : 'border border-border text-text-2 hover:text-text'}`}>{m.pinned ? 'Pinned' : 'Pin'}</button>
                  <button type="button" onClick={() => { removeMemory(m.id); refresh(); }} className="rounded-md border border-border px-2 py-1 text-[11.5px] text-text-2 hover:text-accent">Forget</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* add / edit modal */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit memory' : 'Add a memory'} subtitle={editing?.id ? 'Update what MARVIN remembers' : 'Manual entries are trusted and active immediately'} width="max-w-lg">
        {editing && (
          <>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-semibold text-muted">Category</span>
                <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value as MemoryCategory })} className="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-text outline-none focus:border-accent">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[11.5px] font-semibold text-muted">Memory</span>
                <textarea value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} placeholder="e.g. Always refer to the country as 'Iraq', never 'Iraqi Kurdistan'." className="min-h-24 w-full resize-y rounded-[10px] border border-border bg-bg px-3 py-3 text-[13.5px] leading-relaxed text-text outline-none focus:border-accent" />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2.5">
              <button type="button" onClick={() => setEditing(null)} className="rounded-[10px] border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-text-2 hover:bg-hover">Cancel</button>
              <button type="button" onClick={save} disabled={!editing.content.trim()} className="rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent-dim disabled:opacity-40">{editing.id ? 'Save' : 'Remember this'}</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
