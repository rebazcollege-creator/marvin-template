'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getSettings, isDayOff, weekdayInTimezone, type XaniSettings } from '@/lib/settings';
import { ensureStorageReady } from '@/lib/storage';
import { fetchBriefingData, peekData, PATHS } from '@/lib/marvin-data';
import { fetchInboxTriage } from '@/lib/marvin-client';
import type { BriefingData, TriagedEmail } from '@/lib/marvin-protocol';
import { activeLoops, captureLoop, completeLoop, snoozeLoop, type OpenLoop } from '@/lib/open-loops';
import { syncOpenLoops } from '@/lib/loops-monitor';
import { FocusSession } from '@/components/home/FocusSession';

/**
 * Home — the ADHD command surface (foundations.md). Optimised for Rebaz's top
 * three: working memory (Open Loops), time blindness (a visible next-event
 * countdown), and overwhelm (one thing at a time). Warm, no-guilt, calm.
 * Real data + honest empty states only.
 */

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
function hourInTimezone(date: Date, tz: string): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(date));
}
function todayLabel(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}
/** Minutes from now until an ISO time (negative = past). */
function minsUntil(iso: string, now: Date): number {
  return Math.round((Date.parse(iso) - now.getTime()) / 60000);
}
function humanMins(m: number): string {
  if (m < 0) return 'now';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}
function clockAt(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

const SOURCE: Record<string, { label: string; cls: string }> = {
  slack: { label: 'Slack', cls: 'text-slack' },
  trello: { label: 'Trello', cls: 'text-trello' },
  email: { label: 'Email', cls: 'text-amber' },
  manual: { label: 'Captured', cls: 'text-accent' },
};

function LoopCard({ loop, now, onDone, onSnooze }: { loop: OpenLoop; now: Date; onDone: () => void; onSnooze: () => void }) {
  const src = SOURCE[loop.source] ?? SOURCE.manual;
  const due = loop.dueAt ? minsUntil(loop.dueAt, now) : null;
  return (
    <div className="mb-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className={`text-[11px] font-bold uppercase tracking-[0.05em] ${src.cls}`}>
          {loop.channel ?? src.label}
        </span>
        {loop.from && <span className="text-[13px] text-text-2">{loop.from}</span>}
        {due !== null && (
          <span className="ml-auto text-[12px] font-medium text-text-2">
            {due < 0 ? 'overdue' : `due in ${humanMins(due)}`}
          </span>
        )}
      </div>
      <p className="mt-2.5 font-display text-[19px] leading-snug text-text">{loop.task}</p>
      {loop.saidOk && (
        <span className="mt-3 inline-flex items-center gap-2 rounded-[9px] bg-gold-soft px-3 py-1.5 text-[12px] font-semibold text-[#8a6d34]">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />You said “ok”
        </span>
      )}
      <div className="mt-4 flex flex-wrap gap-2.5">
        <button type="button" onClick={onDone} className="rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">✓ Done</button>
        <button type="button" onClick={onSnooze} className="rounded-xl border border-border-2 bg-surface-2 px-4 py-2.5 text-[13px] font-semibold text-text-2 transition hover:bg-hover">Snooze</button>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [settings, setSettings] = useState<XaniSettings | null>(null);
  const [loops, setLoops] = useState<OpenLoop[]>([]);
  // Start null on BOTH server and client (no localStorage read during render) to avoid
  // a hydration mismatch; the cached value is hydrated in the effect below.
  const [data, setData] = useState<BriefingData | null>(null);
  const [capture, setCapture] = useState('');
  const [focus, setFocus] = useState<{ task: string; loopId?: string } | null>(null);
  const [inboxActs, setInboxActs] = useState<TriagedEmail[] | null>(null);
  const [inboxKnow, setInboxKnow] = useState(0);
  const [inboxFiled, setInboxFiled] = useState(0);
  const [inboxErr, setInboxErr] = useState<string | null>(null);
  const [inboxLoading, setInboxLoading] = useState(true);
  const now = useMemo(() => new Date(), []);

  const reloadLoops = useCallback(() => setLoops(activeLoops()), []);

  useEffect(() => {
    ensureStorageReady().then(() => {
      setSettings(getSettings());
      reloadLoops();
      const cached = peekData<BriefingData>(PATHS.briefing);
      if (cached) setData(cached);
      void syncOpenLoops().then(reloadLoops); // pull live Trello commitments into Open Loops
    });
    fetchBriefingData().then((d) => d && setData(d));
    fetchInboxTriage().then((t) => {
      setInboxLoading(false);
      if (!t) {
        setInboxErr('runtime unreachable — is it running? (npm run dev:all)');
        return;
      }
      if (t.error) setInboxErr(t.error);
      setInboxActs(t.triaged.filter((m) => m.verdict === 'act'));
      setInboxKnow(t.triaged.filter((m) => m.verdict === 'know').length);
      setInboxFiled(t.triaged.filter((m) => m.verdict === 'ignore').length);
    });
    window.addEventListener('xani:loops-changed', reloadLoops);
    return () => window.removeEventListener('xani:loops-changed', reloadLoops);
  }, [reloadLoops]);

  const tz = settings?.profile.timezone ?? 'Europe/Berlin';
  const name = settings?.profile.name ?? '';
  const dayOff = settings ? isDayOff(now, settings) : false;
  const hour = settings && weekdayInTimezone(now, tz) >= 0 ? hourInTimezone(now, tz) : now.getHours();

  // time-visibility: the next upcoming calendar event
  const nextEvent = useMemo(() => {
    if (!data?.connected.calendar) return null;
    const upcoming = data.calendar
      .map((e) => ({ ...e, mins: minsUntil(e.start, now) }))
      .filter((e) => e.mins >= -5)
      .sort((a, b) => a.mins - b.mins);
    return upcoming[0] ?? null;
  }, [data, now]);

  const oneThing = loops[0] ?? null;
  const rest = loops.slice(1);

  const onCapture = () => {
    const t = capture.trim();
    if (!t) return;
    captureLoop({ source: 'manual', task: t });
    setCapture('');
  };

  const trackEmail = (m: TriagedEmail) => {
    captureLoop({ source: 'email', channel: `Email · ${m.account}`, from: m.from, task: m.subject });
    setInboxActs((cur) => (cur ? cur.filter((x) => x.id !== m.id) : cur));
  };
  const dismissEmail = (m: TriagedEmail) => setInboxActs((cur) => (cur ? cur.filter((x) => x.id !== m.id) : cur));

  return (
    <div className="mx-auto max-w-2xl px-8 pb-24 pt-10">
      {/* greeting + time */}
      <h1 className="font-display text-4xl font-semibold tracking-tight text-text">
        {greeting(hour)}
        {name ? `, ${name}` : ''}.
      </h1>
      <p className="mt-2 text-[15px] text-text-2">
        {settings ? todayLabel(now, tz) : ' '}
        {nextEvent && (
          <> · <span className="font-medium text-text">{nextEvent.title}</span> in {humanMins(nextEvent.mins)} ({clockAt(nextEvent.start, tz)})</>
        )}
      </p>

      {dayOff ? (
        <section className="mt-10 rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
          <p className="font-display text-2xl text-text">Day off.</p>
          <p className="mt-2 text-[14px] text-text-2">MARVIN is quiet today. Nothing needs you — rest.</p>
        </section>
      ) : (
        <>
          {/* one thing */}
          {oneThing ? (
            <section className="mt-9 rounded-2xl border border-border p-6 shadow-sm"
              style={{ borderLeftWidth: 4, borderLeftColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 6%, var(--surface))' }}>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-accent">Right now — one thing</div>
              <p className="mt-2 font-display text-[24px] font-semibold leading-snug text-text">{oneThing.task}</p>
              <p className="mt-1.5 text-[13.5px] text-text-2">
                {oneThing.channel ?? SOURCE[oneThing.source].label}
                {oneThing.from ? ` · ${oneThing.from}` : ''}
                {oneThing.dueAt ? ` · due in ${humanMins(minsUntil(oneThing.dueAt, now))}` : ''}
              </p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <button type="button" onClick={() => setFocus({ task: oneThing.task, loopId: oneThing.id })} className="rounded-xl bg-accent px-5 py-2.5 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">▶ Focus with me</button>
                <button type="button" onClick={() => completeLoop(oneThing.id)} className="rounded-xl border border-border-2 bg-surface-2 px-4 py-2.5 text-[13px] font-semibold text-text-2 transition hover:bg-hover">✓ Done</button>
                <button type="button" onClick={() => snoozeLoop(oneThing.id, new Date(now.getTime() + 3 * 3600_000).toISOString())} className="rounded-xl px-3 py-2.5 text-[13px] font-medium text-muted transition hover:text-text-2">Later</button>
              </div>
            </section>
          ) : (
            <section className="mt-9 rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
              <p className="font-display text-2xl text-text">You’re clear.</p>
              <p className="mt-2 text-[14px] text-text-2">Nothing you said yes to is open. Start a focus block, capture a thought, or just breathe.</p>
              <button type="button" onClick={() => setFocus({ task: 'Focus time' })} className="mt-5 rounded-xl bg-accent px-5 py-2.5 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">▶ Start a focus session</button>
            </section>
          )}

          {/* capture — brain-dump, never lose it */}
          <div className="mt-5 flex items-center gap-2.5 rounded-2xl border border-border-2 bg-surface p-1.5 pl-5 shadow-sm focus-within:border-accent">
            <input
              value={capture}
              onChange={(e) => setCapture(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onCapture(); }}
              placeholder="Brain-dump anything — I’ll hold it so you don’t have to."
              className="flex-1 bg-transparent py-3 text-[14.5px] text-text outline-none placeholder:text-muted"
            />
            <button type="button" onClick={onCapture} className="rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">Hold it</button>
          </div>

          {/* from your inbox — MARVIN triage (always shows its state) */}
          <section className="mt-10">
            <div className="mb-4 flex items-baseline gap-3 px-1">
              <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted">From your inbox — needs you</h2>
              {inboxActs && (
                <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-text-2">{inboxActs.length}</span>
              )}
            </div>

            {inboxLoading && <p className="px-1 text-[13.5px] text-muted">Reading your inbox…</p>}
            {!inboxLoading && inboxErr && <p className="px-1 text-[13.5px] text-muted">Couldn’t read your inbox: {inboxErr}</p>}
            {!inboxLoading && !inboxErr && inboxActs && inboxActs.length === 0 && (
              <p className="px-1 text-[13.5px] text-text-2">
                Nothing in your inbox needs you right now.
                {(inboxKnow > 0 || inboxFiled > 0) && ` ${inboxKnow} good to know · ${inboxFiled} filed as noise.`}
              </p>
            )}

            {inboxActs?.map((m) => (
              <div key={m.id} className="mb-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-amber">Email · {m.account}</span>
                  <span className="text-[13px] text-text-2">{m.from}</span>
                </div>
                <p className="mt-2 font-display text-[18px] leading-snug text-text">{m.subject}</p>
                {m.reason && <p className="mt-1 text-[12.5px] text-muted">{m.reason}</p>}
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <button type="button" onClick={() => trackEmail(m)} className="rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">+ Track it</button>
                  <button type="button" onClick={() => dismissEmail(m)} className="rounded-xl border border-border-2 bg-surface-2 px-4 py-2.5 text-[13px] font-semibold text-text-2 transition hover:bg-hover">Not for me</button>
                </div>
              </div>
            ))}

            {!inboxLoading && !inboxErr && inboxActs && inboxActs.length > 0 && (inboxKnow > 0 || inboxFiled > 0) && (
              <p className="mt-4 px-1 text-[12.5px] text-muted">{inboxKnow} good to know · {inboxFiled} filed away as noise.</p>
            )}
          </section>

          {/* the rest of the open loops */}
          {rest.length > 0 && (
            <section className="mt-10">
              <div className="mb-4 flex items-baseline gap-3 px-1">
                <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted">Open loops</h2>
                <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-text-2">{rest.length}</span>
              </div>
              {rest.map((l) => (
                <LoopCard
                  key={l.id}
                  loop={l}
                  now={now}
                  onDone={() => completeLoop(l.id)}
                  onSnooze={() => snoozeLoop(l.id, new Date(now.getTime() + 3 * 3600_000).toISOString())}
                />
              ))}
            </section>
          )}

          {/* honest note about auto-capture */}
          <p className="mt-10 border-t border-border pt-5 text-[12.5px] text-muted">
            {data?.connected.slack || data?.connected.trello
              ? 'Xanî is watching Slack & Trello — new commitments land here automatically.'
              : (
                <>Connect Slack &amp; Trello in <Link href="/connections" className="font-medium text-accent hover:underline">Connections</Link> and every “ok” you give lands here on its own.</>
              )}
          </p>
        </>
      )}
      {focus && (
        <FocusSession
          task={focus.task}
          onComplete={focus.loopId ? () => completeLoop(focus.loopId!) : undefined}
          onClose={() => setFocus(null)}
        />
      )}
    </div>
  );
}
