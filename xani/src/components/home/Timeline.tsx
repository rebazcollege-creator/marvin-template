'use client';

import { useMemo } from 'react';

/**
 * Today, as blocks (ADHD design report §4, P0.5) — makes time visible for time-blindness.
 * Not a to-do list; a *shape* for the day with an unmistakable "now" line, so "later"
 * stops being invisible. Real calendar data only — renders nothing when there's none.
 */

type Ev = { title: string; start: string; end?: string; allDay?: boolean };

function clock(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function Timeline({ events, tz, now }: { events: Ev[]; tz: string; now: Date }) {
  const rows = useMemo(() => {
    const t = now.getTime();
    // Today's timed events, chronological. Keep ones that haven't fully ended.
    return events
      .filter((e) => !e.allDay && e.start && Date.parse(e.end || e.start) >= t - 30 * 60000)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
      .slice(0, 8);
  }, [events, now]);

  if (rows.length === 0) return null;

  const t = now.getTime();
  // Where does the "now" marker fall relative to the sorted events?
  const nowIdx = rows.findIndex((e) => Date.parse(e.start) > t);
  const insertAt = nowIdx === -1 ? rows.length : nowIdx;

  const NowRow = (
    <div key="now" className="grid grid-cols-[52px_1fr] items-center gap-3">
      <span className="text-[11.5px] font-semibold text-accent">now</span>
      <div className="flex items-center gap-2 py-0.5">
        <span className="h-2 w-2 rounded-full bg-accent" />
        <span className="h-px flex-1 bg-accent/40" />
        <span className="text-[11px] font-medium text-accent">{clock(now.toISOString(), tz)}</span>
      </div>
    </div>
  );

  return (
    <section className="mt-10">
      <div className="mb-4 px-1">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted">Today, as blocks</h2>
      </div>
      <div className="space-y-1.5 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        {rows.slice(0, insertAt).map((e, i) => (
          <BlockRow key={`a${i}`} e={e} tz={tz} />
        ))}
        {NowRow}
        {rows.slice(insertAt).map((e, i) => (
          <BlockRow key={`b${i}`} e={e} tz={tz} />
        ))}
      </div>
    </section>
  );
}

function BlockRow({ e, tz }: { e: Ev; tz: string }) {
  const mins = Math.max(0, Math.round((Date.parse(e.end || e.start) - Date.parse(e.start)) / 60000));
  return (
    <div className="grid grid-cols-[52px_1fr] items-stretch gap-3">
      <span className="pt-2 text-[11.5px] tabular-nums text-muted">{clock(e.start, tz)}</span>
      <div className="rounded-[10px] border border-border-2 bg-surface-2 px-3 py-2">
        <span className="text-[13px] font-semibold text-text">{e.title}</span>
        {mins > 0 && <span className="ml-2 text-[11px] text-muted">{mins < 60 ? `${mins}m` : `${Math.round(mins / 60)}h`}</span>}
      </div>
    </div>
  );
}
