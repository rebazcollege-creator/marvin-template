'use client';

import { useState } from 'react';

/**
 * Activity = everything MARVIN did, watched, and is still holding. Two tabs:
 * the agent Feed and Open loops. There's no backend feed yet, so both show honest
 * empty states with the real structure in place — never fabricated history.
 */

type Tab = 'feed' | 'loops';

export default function ActivityPage() {
  const [tab, setTab] = useState<Tab>('feed');

  return (
    <div className="flex h-full flex-col">
      <div className="flex-none px-8 pt-6">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <h1 className="font-display text-2xl font-semibold text-text">Activity</h1>
            <p className="mt-1 text-[13px] text-muted">
              Everything MARVIN did, watched, and is still holding for you.
            </p>
          </div>
          <div className="flex gap-1 rounded-[11px] border border-border bg-surface p-[3px]">
            {(
              [
                { id: 'feed', label: 'Feed' },
                { id: 'loops', label: 'Open loops' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-4 py-1.5 text-[13px] font-semibold transition ${
                  tab === t.id ? 'bg-accent text-on-accent' : 'text-text-2 hover:text-text'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-12 pt-6">
        <div className="max-w-[680px]">
          {tab === 'feed' ? (
            <EmptyState
              title="No activity yet"
              body="When MARVIN works in the background — triaging mail, drafting replies, watching channels — each step lands here as a timeline, newest first, grouped by day."
            />
          ) : (
            <>
              <p className="mb-5 text-[12.5px] leading-relaxed text-text-2">
                Open loops are promises and unanswered threads MARVIN is tracking on your behalf. They stay
                here until they’re closed.
              </p>
              <EmptyState
                title="No open loops"
                body="Commitments you make and threads awaiting a reply will surface here, each with a nudge and a “Mark done”, so nothing quietly slips."
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[16px] border border-dashed border-border bg-surface px-6 py-12 text-center">
      <p className="text-sm font-semibold text-text">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] text-text-2">{body}</p>
    </div>
  );
}
