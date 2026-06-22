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
  setAdjustmentStatus,
  updateMemory,
  type MemoryCategory,
  type MemoryEntry,
  type SelfAdjustment,
} from '@/lib/memory';

/**
 * Memory — what MARVIN has learned, what it wants to remember, and the changes
 * it wants to make to itself.
 *
 * Three review surfaces, all human-in-the-loop:
 *  - Self-adjustments: MARVIN reasoning about its own behaviour (approve/reject).
 *  - Proposed memories: the write-gate queue. Anything inferred or derived from
 *    untrusted content (email/Slack/web) lands here, never auto-trusted.
 *  - Active memory: the curated store (pin, edit importance, forget).
 */

const CATEGORIES: MemoryCategory[] = [
  'rule',
  'preference',
  'fact',
  'workflow',
  'correction',
  'episode',
  'other',
];

export default function MemoryPage() {
  const [memories, setMemories] = useState<MemoryEntry[] | null>(null);
  const [proposed, setProposed] = useState<MemoryEntry[]>([]);
  const [adjustments, setAdjustments] = useState<SelfAdjustment[]>([]);
  const [draft, setDraft] = useState('');
  const [draftCat, setDraftCat] = useState<MemoryCategory>('preference');

  const refresh = () => {
    setMemories(getMemories());
    setProposed(getProposedMemories());
    setAdjustments(getAdjustments());
  };

  useEffect(() => {
    refresh();
  }, []);

  if (!memories) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <div className="h-8 w-40 animate-pulse rounded bg-line" />
      </div>
    );
  }

  const handleAdd = () => {
    if (!draft.trim()) return;
    // Manual entry is fully trusted and becomes active immediately.
    ingestMemory({ category: draftCat, content: draft.trim(), source: 'manual' });
    setDraft('');
    refresh();
  };

  const pending = adjustments.filter((a) => a.status === 'pending');

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-3xl text-ink">Memory</h1>
      <p className="mt-1 text-sm text-ink-soft">
        What MARVIN knows about you, and how it carries that forward.
      </p>

      {/* Pending self-adjustments — MARVIN reasoning about itself */}
      {pending.length > 0 && (
        <section className="mt-8 rounded-2xl border border-amber bg-paper-card p-6">
          <h2 className="text-xl text-ink">MARVIN wants to adjust itself</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Review each proposal. Nothing changes until you approve it. Locked
            safety rules can never be changed this way.
          </p>
          <div className="mt-4 space-y-4">
            {pending.map((a) => (
              <div key={a.id} className="rounded-xl border border-line p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-terracotta">
                  {a.target}
                </p>
                <p className="mt-1 text-sm text-ink">{a.rationale}</p>
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-paper p-3 text-xs text-ink-soft">
                  {a.proposed}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAdjustmentStatus(a.id, 'approved');
                      refresh();
                    }}
                    className="rounded-lg bg-terracotta px-4 py-1.5 text-sm font-medium text-paper hover:bg-terracotta-dim"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdjustmentStatus(a.id, 'rejected');
                      refresh();
                    }}
                    className="rounded-lg border border-line px-4 py-1.5 text-sm text-ink-soft hover:text-ink"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Proposed memories — the write-gate queue */}
      {proposed.length > 0 && (
        <section className="mt-8 rounded-2xl border border-line bg-paper-card p-6">
          <h2 className="text-xl text-ink">Proposed memories</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Inferred, or derived from email/Slack/web content — untrusted until
            you approve. Approving marks it trusted.
          </p>
          <ul className="mt-4 space-y-3">
            {proposed.map((m) => (
              <li key={m.id} className="rounded-xl border border-line p-4">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                  {m.category} · via {m.source} · trust {m.trust}
                </span>
                <p className="mt-1 text-sm text-ink">{m.content}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      approveMemory(m.id);
                      refresh();
                    }}
                    className="rounded-lg bg-terracotta px-4 py-1.5 text-sm font-medium text-paper hover:bg-terracotta-dim"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      rejectMemory(m.id);
                      refresh();
                    }}
                    className="rounded-lg border border-line px-4 py-1.5 text-sm text-ink-soft hover:text-ink"
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Add a memory manually */}
      <section className="mt-8 rounded-2xl border border-line bg-paper-card p-6">
        <h2 className="text-xl text-ink">Add a memory</h2>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">
              Category
            </span>
            <select
              value={draftCat}
              onChange={(e) => setDraftCat(e.target.value as MemoryCategory)}
              className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-terracotta"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="New memory content"
            placeholder="e.g. Always refer to the country as 'Iraq', never 'Iraqi Kurdistan'."
            className="min-h-20 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-terracotta"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!draft.trim()}
            className="rounded-lg bg-terracotta px-4 py-2 text-sm font-medium text-paper hover:bg-terracotta-dim disabled:opacity-40"
          >
            Remember this
          </button>
        </div>
      </section>

      {/* Active memory list */}
      <section className="mt-8">
        <h2 className="text-xl text-ink">Learned ({memories.length})</h2>
        {memories.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-line bg-paper-card p-8 text-sm text-ink-soft">
            Nothing learned yet. As you work with MARVIN it will propose durable
            preferences, facts and corrections here — and you can add your own
            above.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {memories.map((m) => (
              <li
                key={m.id}
                className="rounded-xl border border-line bg-paper-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                      {m.tier} · {m.category} · trust {m.trust}
                    </span>
                    <p className="mt-1 text-sm text-ink">{m.content}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      aria-pressed={m.pinned}
                      onClick={() => {
                        updateMemory(m.id, { pinned: !m.pinned });
                        refresh();
                      }}
                      className={`rounded-md px-2 py-1 text-xs ${
                        m.pinned
                          ? 'bg-terracotta text-paper'
                          : 'border border-line text-ink-soft hover:text-ink'
                      }`}
                    >
                      {m.pinned ? 'Pinned' : 'Pin'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        removeMemory(m.id);
                        refresh();
                      }}
                      className="rounded-md border border-line px-2 py-1 text-xs text-ink-soft hover:text-terracotta"
                    >
                      Forget
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
