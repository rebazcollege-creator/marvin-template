'use client';

import { useEffect, useState } from 'react';
import { ensureStorageReady } from '@/lib/storage';
import { AUTONOMY_DEFS, getAutonomy, setAutonomy, type Level } from '@/lib/autonomy';

const LEVELS: { id: Level; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'ask', label: 'Ask' },
  { id: 'never', label: 'Never' },
];

export default function ApprovalsPage() {
  const [levels, setLevels] = useState<Record<string, Level>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureStorageReady().then(() => {
      setLevels(getAutonomy());
      setReady(true);
    });
  }, []);

  const set = (id: string, level: Level) => {
    const next = { ...levels, [id]: level };
    setLevels(next);
    setAutonomy(next);
  };

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

      {/* queue */}
      <div className="mb-9 rounded-[16px] border border-dashed border-border bg-surface px-6 py-12 text-center">
        <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-green-soft text-green-ink">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12.5 4.5 4.5L19 7" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-text">You’re all caught up</p>
        <p className="mx-auto mt-1.5 max-w-md text-[13px] text-text-2">
          Nothing is waiting on you. When MARVIN wants to do something you’ve set to “Ask”, it’ll appear here
          with a preview and a one-tap approve.
        </p>
      </div>

      {/* autonomy */}
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11px] font-bold tracking-[0.08em] text-muted">AUTONOMY BY CATEGORY</div>
        {ready && (
          <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3 5 6v5c0 4 3 7 7 8 4-1 7-4 7-8V6z" />
            </svg>
            {autoCount} auto · {askCount} ask · {neverCount} never
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-[16px] border border-border bg-surface">
        {AUTONOMY_DEFS.map((d, i) => {
          const cur = levels[d.id] ?? 'ask';
          return (
            <div
              key={d.id}
              className={`flex items-center justify-between gap-4 px-5 py-4 ${i > 0 ? 'border-t border-border' : ''}`}
            >
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
                    onClick={() => set(d.id, l.id)}
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
        These gates back the runtime’s action guard. Locked rules (e.g. LeadStories monitor-only) always apply on
        top and can’t be loosened here.
      </p>
    </div>
  );
}
