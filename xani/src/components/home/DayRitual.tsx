'use client';

import { useEffect, useState } from 'react';
import { readJson, writeJson } from '@/lib/storage';
import { todayWins } from '@/lib/momentum';
import { captureLoop } from '@/lib/open-loops';
import { logActivity } from '@/lib/activity';

/**
 * Day ritual (P2) — a gentle bookend, never a chore. In the morning it asks for ONE
 * intention (an implementation-intention, the best-evidenced ADHD start strategy). In the
 * evening it reflects your wins and lets you jot a closing line. Skippable, once per phase
 * per day — if you dismiss it, it stays gone until tomorrow.
 */

type Phase = 'morning' | 'evening';

function localDate(now: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function hourIn(now: Date, tz: string): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(now));
}

const KEY = 'xani.ritual.dismissed.v1';

export function DayRitual({ tz, now, name }: { tz: string; now: Date; name: string }) {
  const [text, setText] = useState('');
  const [gone, setGone] = useState(true);

  const h = hourIn(now, tz);
  const phase: Phase | null = h < 11 ? 'morning' : h >= 18 ? 'evening' : null;
  const tag = phase ? `${localDate(now, tz)}:${phase}` : '';

  useEffect(() => {
    if (!phase) { setGone(true); return; }
    const dismissed = readJson<string[]>(KEY, []);
    setGone(dismissed.includes(tag));
  }, [phase, tag]);

  if (!phase || gone) return null;

  const dismiss = () => {
    const dismissed = readJson<string[]>(KEY, []);
    writeJson<string[]>(KEY, [...dismissed, tag].slice(-30));
    setGone(true);
  };

  const wins = todayWins(tz, now);

  const submitMorning = () => {
    const t = text.trim();
    if (t) captureLoop({ source: 'manual', task: t }); // becomes today's intention on Home
    logActivity({ kind: 'note', title: 'Morning intention', detail: t.slice(0, 80) });
    dismiss();
  };
  const submitEvening = () => {
    const t = text.trim();
    if (t) logActivity({ kind: 'note', title: 'End-of-day note', detail: t.slice(0, 120) });
    dismiss();
  };

  return (
    <section className="mt-6 rounded-2xl border border-border bg-[color-mix(in_srgb,var(--accent)_5%,var(--surface))] p-5 shadow-sm">
      {phase === 'morning' ? (
        <>
          <p className="font-display text-[18px] font-semibold text-text">Morning{name ? `, ${name}` : ''}. One good thing today?</p>
          <p className="mt-1 text-[13px] text-text-2">Name the single win that would make today feel good. I’ll set it as your one thing.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitMorning(); }}
              placeholder="e.g. send the fundraising post"
              className="min-w-[220px] flex-1 rounded-xl border border-border-2 bg-bg px-3.5 py-2.5 text-[14px] text-text outline-none focus:border-accent"
            />
            <button type="button" onClick={submitMorning} className="rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">Set it</button>
            <button type="button" onClick={dismiss} className="rounded-xl px-3 py-2.5 text-[13px] font-medium text-muted transition hover:text-text-2">Skip</button>
          </div>
        </>
      ) : (
        <>
          <p className="font-display text-[18px] font-semibold text-text">
            {wins.length > 0 ? `${wins.length} win${wins.length === 1 ? '' : 's'} today. 🎉` : 'Winding down.'}
          </p>
          <p className="mt-1 text-[13px] text-text-2">
            {wins.length > 0 ? 'That counts — whatever else waited can wait.' : 'A quiet day is allowed. Tomorrow’s a fresh page.'} Anything to note before you stop?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitEvening(); }}
              placeholder="a thought to leave here…"
              className="min-w-[220px] flex-1 rounded-xl border border-border-2 bg-bg px-3.5 py-2.5 text-[14px] text-text outline-none focus:border-accent"
            />
            <button type="button" onClick={submitEvening} className="rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">Save & rest</button>
            <button type="button" onClick={dismiss} className="rounded-xl px-3 py-2.5 text-[13px] font-medium text-muted transition hover:text-text-2">Skip</button>
          </div>
        </>
      )}
    </section>
  );
}
