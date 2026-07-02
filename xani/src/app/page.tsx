'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { getSettings, isDayOff, weekdayInTimezone, type XaniSettings } from '@/lib/settings';
import { ensureStorageReady } from '@/lib/storage';
import { fetchBriefingData, fetchMessageBody, peekData, PATHS } from '@/lib/marvin-data';
import { fetchInboxTriage, fetchSlackTriage, requestDraft, sortDump, summarizeItem } from '@/lib/marvin-client';
import { enqueueApproval } from '@/lib/approvals';
import type { BriefingData, TriagedEmail, TriagedSlack } from '@/lib/marvin-protocol';
import { activeLoops, captureLoop, completeLoop, snoozeLoop, refineLoop, type OpenLoop } from '@/lib/open-loops';
import { syncOpenLoops } from '@/lib/loops-monitor';
import { recordTriageCorrection, triageLearnings, learnedCount } from '@/lib/triage-learning';
import { understandingFacts } from '@/lib/understanding';
import { voicePromptFor, voiceKeyFor } from '@/lib/voice';
import { FocusSession } from '@/components/home/FocusSession';
import { Timeline } from '@/components/home/Timeline';
import { Momentum } from '@/components/home/Momentum';
import { MicButton } from '@/components/home/MicButton';
import { SourceBadge } from '@/components/home/SourceBadge';
import { DayRitual } from '@/components/home/DayRitual';
import { dueLabel, estLabel, timeAgo, slackTsMs } from '@/lib/tone';

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

/** A small "to you / to the team" chip — so it's instantly clear whether something is aimed
 *  at Rebaz or just went to a list. "you" reads as important; a broadcast reads as quieter. */
function Aud({ a }: { a?: 'you' | 'team' | 'group' }) {
  if (!a) return null;
  const label = a === 'you' ? 'to you' : a === 'group' ? 'to your group' : 'to the team';
  const strong = a === 'you';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${strong ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'}`}>
      {label}
    </span>
  );
}

/** Inline "see full message" expander — reveals the whole email/thread under a card. */
function SeeMore({ open, body, onToggle }: { open: boolean; body?: string; onToggle: () => void }) {
  return (
    <div className="mt-3">
      <button type="button" onClick={onToggle} className="text-[12.5px] font-semibold text-accent hover:underline">
        {open ? 'Hide full message' : 'See full message'}
      </button>
      {open && (
        <div className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-bg px-3.5 py-3 text-[13px] leading-relaxed text-text-2">
          {body === undefined || body === '…' ? 'Loading…' : body}
        </div>
      )}
    </div>
  );
}

function LoopCard({ loop, now, onDone, onSnooze, onDraft }: { loop: OpenLoop; now: Date; onDone: () => void; onSnooze: () => void; onDraft?: () => void }) {
  const src = SOURCE[loop.source] ?? SOURCE.manual;
  const due = dueLabel(loop.dueAt, now);
  return (
    <div className="mb-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2.5">
        <SourceBadge source={loop.source} label={loop.channel ?? src.label} />
        {loop.from && <span className="text-[13px] text-text-2">{loop.from}</span>}
        {(due || loop.estMins) && (
          <span className="ml-auto text-[12px] font-medium text-muted">
            {[loop.estMins ? estLabel(loop.estMins) : null, due].filter(Boolean).join(' · ')}
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
        {(loop.email || loop.slack) && onDraft && (
          <button type="button" onClick={onDraft} className="rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">✍️ Draft reply</button>
        )}
        <button type="button" onClick={onDone} className="rounded-xl border border-border-2 bg-surface-2 px-4 py-2.5 text-[13px] font-semibold text-text-2 transition hover:bg-hover">✓ Done</button>
        <button type="button" onClick={onSnooze} className="rounded-xl px-3 py-2.5 text-[13px] font-medium text-muted transition hover:text-text-2">Snooze</button>
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
  const [slackActs, setSlackActs] = useState<TriagedSlack[] | null>(null);
  const [slackKnow, setSlackKnow] = useState(0);
  const [slackFiled, setSlackFiled] = useState(0);
  const [slackErr, setSlackErr] = useState<string | null>(null);
  const [slackLoading, setSlackLoading] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const [learned, setLearned] = useState(0);
  const [overwhelmed, setOverwhelmed] = useState(false);
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const bodyCache = useRef<Record<string, string>>({});
  const triedHeadline = useRef<Set<string>>(new Set());
  const now = useMemo(() => new Date(), []);

  // Expand / collapse the full message under a card; fetches the body once, then caches it.
  const toggleExpand = async (key: string, fetcher: () => Promise<string>) => {
    setOpenKeys((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
    if (bodyCache.current[key] === undefined) {
      bodyCache.current[key] = '…';
      const body = await fetcher().catch(() => '');
      bodyCache.current[key] = body || '(couldn’t load the full message)';
      setOpenKeys((s) => new Set(s));
    }
  };

  const flashMsg = (s: string) => {
    setFlash(s);
    window.setTimeout(() => setFlash(null), 2800);
  };

  const reloadLoops = useCallback(() => setLoops(activeLoops()), []);

  useEffect(() => {
    ensureStorageReady().then(() => {
      setSettings(getSettings());
      reloadLoops();
      setLearned(learnedCount());
      // Triage reads BOTH his corrections and everything he's taught me in Train (understanding),
      // so headlines/verdicts use what I actually know about his world instead of guessing.
      const learnings = [...triageLearnings(), ...understandingFacts()];
      const cached = peekData<BriefingData>(PATHS.briefing);
      if (cached) setData(cached);
      void syncOpenLoops().then(reloadLoops); // pull live Trello commitments into Open Loops
      // Triage reads Rebaz's corrections so it gets sharper each time (self-development.md).
      fetchInboxTriage(learnings).then((t) => {
        setInboxLoading(false);
        if (!t) { setInboxErr('runtime unreachable — is it running? (npm run dev:all)'); return; }
        if (t.error) setInboxErr(t.error);
        setInboxActs(t.triaged.filter((m) => m.verdict === 'act'));
        setInboxKnow(t.triaged.filter((m) => m.verdict === 'know').length);
        setInboxFiled(t.triaged.filter((m) => m.verdict === 'ignore').length);
      });
      fetchSlackTriage(learnings).then((t) => {
        setSlackLoading(false);
        if (!t) { setSlackErr('runtime unreachable — is it running? (npm run dev:all)'); return; }
        if (t.error) setSlackErr(t.error);
        if (!t.connected) { setSlackActs([]); return; }
        setSlackActs(t.triaged.filter((m) => m.verdict === 'act'));
        setSlackKnow(t.triaged.filter((m) => m.verdict === 'know').length);
        setSlackFiled(t.triaged.filter((m) => m.verdict === 'ignore').length);
      });
    });
    fetchBriefingData().then((d) => d && setData(d));
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
  // Gentle resurfacing: the loop that's been waiting longest (>3 days) comes back as an
  // invitation, not an accusation. Shown once, and excluded from the plain "Open loops" list.
  const stale = useMemo(
    () => rest.find((l) => now.getTime() - Date.parse(l.createdAt) > 3 * 86_400_000),
    [rest, now],
  );
  const restList = stale ? rest.filter((l) => l.id !== stale.id) : rest;

  // The one thing should read as MARVIN's interpretation, not the raw subject. If the top loop
  // is an email/Slack item without a headline yet, generate one (in its full context) and store it.
  useEffect(() => {
    if (!oneThing || oneThing.headline) return;
    const id = oneThing.id;
    if (triedHeadline.current.has(id)) return;
    const p = oneThing.email
      ? { kind: 'email' as const, account: oneThing.email.account, id: oneThing.email.id }
      : oneThing.slack
        ? { kind: 'slack' as const, workspace: oneThing.slack.workspace, channel: oneThing.slack.channelId }
        : null;
    if (!p) return;
    triedHeadline.current.add(id);
    void summarizeItem(p).then((r) => {
      if (r.ok && r.headline) { refineLoop(id, { headline: r.headline, task: r.headline }); reloadLoops(); }
    });
  }, [oneThing, reloadLoops]);

  const onCapture = (text?: string) => {
    const t = (text ?? capture).trim();
    if (!t) return;
    // Never lose it: hold it instantly. Then let MARVIN quietly tidy/classify it so Rebaz
    // never has to file his own dump (P1.3). Failure is harmless — the raw loop stays.
    const loop = captureLoop({ source: 'manual', task: t });
    setCapture('');
    flashMsg('Got it — holding that for you.');
    void sortDump(t).then((r) => {
      if (!r.ok) return;
      if (r.task || r.estMins) refineLoop(loop.id, { task: r.task || loop.task, estMins: r.estMins });
      if (r.kind === 'someday') snoozeLoop(loop.id, new Date(now.getTime() + 30 * 24 * 3600_000).toISOString());
      reloadLoops();
    });
  };

  const trackEmail = (m: TriagedEmail) => {
    captureLoop({
      source: 'email',
      channel: `Email · ${m.account}`,
      from: m.from,
      task: m.headline || m.subject,
      email: { account: m.account, id: m.id, from: m.from, subject: m.subject },
    });
    recordTriageCorrection({ medium: 'email', from: m.from, subject: m.subject, decision: 'act' });
    setLearned(learnedCount());
    flashMsg('Tracked — MARVIN is holding it for you.');
    setInboxActs((cur) => (cur ? cur.filter((x) => x.id !== m.id) : cur));
  };
  const dismissEmail = (m: TriagedEmail) => {
    recordTriageCorrection({ medium: 'email', from: m.from, subject: m.subject, decision: 'ignore' });
    setLearned(learnedCount());
    flashMsg('Learned — I’ll file messages like that next time.');
    setInboxActs((cur) => (cur ? cur.filter((x) => x.id !== m.id) : cur));
  };

  const trackSlack = (m: TriagedSlack) => {
    const where = m.dm ? `${m.workspaceName} · Slack DM` : `${m.workspaceName} · #${m.channel}`;
    captureLoop({
      source: 'slack',
      channel: m.emergency ? `${where} · URGENT` : where,
      from: m.from,
      task: m.headline || (m.text.length > 180 ? `${m.text.slice(0, 177)}…` : m.text),
      ref: m.id,
      slack: { workspace: m.workspace, channelId: m.channelId, channel: m.channel, from: m.from, text: m.text },
    });
    recordTriageCorrection({ medium: 'slack', from: m.from, subject: m.dm ? m.text : `#${m.channel}: ${m.text}`, decision: 'act' });
    setLearned(learnedCount());
    flashMsg('Tracked — MARVIN is holding it for you.');
    setSlackActs((cur) => (cur ? cur.filter((x) => x.id !== m.id) : cur));
  };
  const dismissSlack = (m: TriagedSlack) => {
    recordTriageCorrection({ medium: 'slack', from: m.from, subject: m.dm ? m.text : `#${m.channel}: ${m.text}`, decision: 'ignore' });
    setLearned(learnedCount());
    flashMsg('Learned — I’ll file messages like that next time.');
    setSlackActs((cur) => (cur ? cur.filter((x) => x.id !== m.id) : cur));
  };

  // the next step after tracking: MARVIN drafts the reply → Approvals (nothing sends without a tap).
  // Works for both email and Slack loops; "Prepare, I approve" — nothing leaves without Rebaz's tap.
  const draftLoopReply = async (loop: OpenLoop) => {
    if (loop.email) {
      flashMsg('MARVIN is drafting a reply…');
      const mb = await fetchMessageBody(loop.email.account, loop.email.id);
      const bodyText = mb?.text || mb?.body || loop.email.subject;
      const r = await requestDraft({ account: loop.email.account, from: loop.email.from, subject: loop.email.subject, body: bodyText, medium: 'email', voice: voicePromptFor('email', 'all') });
      if (!r.ok || !r.draft) {
        flashMsg(`Draft failed: ${r.error ?? 'unknown error'}`);
        return;
      }
      const reSubject = /^re:/i.test(loop.email.subject) ? loop.email.subject : `Re: ${loop.email.subject}`;
      enqueueApproval({
        kind: 'email',
        title: `Reply to ${loop.email.from}`,
        source: `Email · ${loop.email.account}`,
        preview: r.draft,
        actionLabel: 'Send',
        voiceKey: voiceKeyFor('email', 'all'),
        // Real threaded payload → approving actually sends into the same conversation.
        payload: { kind: 'email', to: loop.email.from, subject: reSubject, body: r.draft, account: loop.email.account, threadId: mb?.threadId, inReplyTo: mb?.messageId, references: mb?.references },
      });
      flashMsg('✍️ Draft ready in Approvals — review & send.');
      return;
    }
    if (loop.slack) {
      flashMsg('MARVIN is drafting a reply…');
      const r = await requestDraft({ account: loop.slack.workspace, from: loop.slack.from, subject: loop.slack.channel, body: loop.slack.text, medium: 'slack', voice: voicePromptFor('slack', loop.slack.workspace) });
      if (!r.ok || !r.draft) {
        flashMsg(`Draft failed: ${r.error ?? 'unknown error'}`);
        return;
      }
      const threadTs = loop.ref?.split(':')[1]; // reply in the original thread
      enqueueApproval({
        kind: 'slack',
        title: `Reply to ${loop.slack.from} (${loop.slack.channel})`,
        source: `Slack · ${loop.slack.workspace}`,
        preview: r.draft,
        actionLabel: 'Send',
        voiceKey: voiceKeyFor('slack', loop.slack.workspace),
        payload: { kind: 'slack', channel: loop.slack.channelId, text: r.draft, workspace: loop.slack.workspace, threadTs },
      });
      flashMsg('✍️ Draft ready in Approvals — review & send.');
    }
  };

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
          {/* a gentle bookend — morning intention / evening reflection (skippable) */}
          {settings && !overwhelmed && <DayRitual tz={tz} now={now} name={name} />}

          {/* one thing */}
          {oneThing ? (
            <section className="mt-9 rounded-2xl border border-border p-6 shadow-sm"
              style={{ borderLeftWidth: 4, borderLeftColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 6%, var(--surface))' }}>
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-accent">Right now — just this one</div>
                {rest.length > 0 && (
                  <button type="button" onClick={() => setOverwhelmed((v) => !v)} className="text-[11.5px] font-medium text-muted transition hover:text-text-2">
                    {overwhelmed ? 'show the rest' : 'I’m overwhelmed'}
                  </button>
                )}
              </div>
              <p className="mt-2 font-display text-[24px] font-semibold leading-snug text-text">{oneThing.headline || oneThing.task}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-text-2">
                <SourceBadge source={oneThing.source} label={oneThing.channel ?? SOURCE[oneThing.source].label} />
                {oneThing.from && <span>· {oneThing.from}</span>}
                {oneThing.estMins ? <span>· {estLabel(oneThing.estMins)}</span> : null}
                {dueLabel(oneThing.dueAt, now) ? <span>· {dueLabel(oneThing.dueAt, now)}</span> : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <button type="button" onClick={() => setFocus({ task: oneThing.task, loopId: oneThing.id })} className="rounded-xl bg-accent px-5 py-2.5 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">▶ Focus with me</button>
                {(oneThing.email || oneThing.slack) && (
                  <button type="button" onClick={() => void draftLoopReply(oneThing)} className="rounded-xl border border-border-2 bg-surface-2 px-4 py-2.5 text-[13px] font-semibold text-text-2 transition hover:bg-hover">✍️ Draft reply</button>
                )}
                <button type="button" onClick={() => completeLoop(oneThing.id)} className="rounded-xl border border-border-2 bg-surface-2 px-4 py-2.5 text-[13px] font-semibold text-text-2 transition hover:bg-hover">✓ Done</button>
                <button type="button" onClick={() => snoozeLoop(oneThing.id, new Date(now.getTime() + 3 * 3600_000).toISOString())} className="rounded-xl px-3 py-2.5 text-[13px] font-medium text-muted transition hover:text-text-2">Not now</button>
              </div>
              {(oneThing.email || oneThing.slack) && (
                <SeeMore
                  open={openKeys.has(`one:${oneThing.id}`)}
                  body={bodyCache.current[`one:${oneThing.id}`]}
                  onToggle={() => toggleExpand(`one:${oneThing.id}`, () =>
                    oneThing.email
                      ? fetchMessageBody(oneThing.email.account, oneThing.email.id).then((mb) => mb?.text || mb?.body || '')
                      : summarizeItem({ kind: 'slack', workspace: oneThing.slack!.workspace, channel: oneThing.slack!.channelId }).then((r) => r.body || ''),
                  )}
                />
              )}
              {overwhelmed && (
                <p className="mt-4 rounded-xl bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] px-4 py-3 text-[13px] text-text-2">
                  🌿 Everything else is hidden. Just this one. Breathe — you don’t have to hold the rest, I’ve got it.
                </p>
              )}
            </section>
          ) : (
            <section className="mt-9 rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
              <p className="font-display text-2xl text-text">You’re clear.</p>
              <p className="mt-2 text-[14px] text-text-2">Nothing you said yes to is open. Start a focus block, capture a thought, or just breathe.</p>
              <button type="button" onClick={() => setFocus({ task: 'Focus time' })} className="mt-5 rounded-xl bg-accent px-5 py-2.5 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">▶ Start a focus session</button>
            </section>
          )}

          {!overwhelmed && (
          <>
          {/* capture — brain-dump, never lose it */}
          <div className="mt-5 flex items-center gap-2.5 rounded-2xl border border-border-2 bg-surface p-1.5 pl-5 shadow-sm focus-within:border-accent">
            <input
              value={capture}
              onChange={(e) => setCapture(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onCapture(); }}
              placeholder="Brain-dump anything — type it or say it, I’ll hold it."
              className="flex-1 bg-transparent py-3 text-[14.5px] text-text outline-none placeholder:text-muted"
            />
            <MicButton onText={(t) => onCapture(t)} />
            <button type="button" onClick={() => onCapture()} className="rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">Hold it</button>
          </div>

          {/* today, as blocks — make time visible for time-blindness */}
          {data?.connected.calendar && <Timeline events={data.calendar} tz={tz} now={now} />}

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
                  <SourceBadge source="email" label={m.account} />
                  <Aud a={m.audience} />
                  <span className="text-[13px] text-text-2">{m.from}</span>
                  {m.receivedAt && <span className="ml-auto text-[12px] text-muted">{timeAgo(Date.parse(m.receivedAt))}</span>}
                </div>
                <p className="mt-2 font-display text-[18px] leading-snug text-text">{m.headline || m.subject}</p>
                <SeeMore
                  open={openKeys.has(`in:${m.id}`)}
                  body={bodyCache.current[`in:${m.id}`]}
                  onToggle={() => toggleExpand(`in:${m.id}`, () => fetchMessageBody(m.account, m.id).then((mb) => mb?.text || mb?.body || m.snippet || ''))}
                />
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

          {/* from Slack — MARVIN triage of DMs, @mentions & emergencies (the "I said ok and forgot" fix) */}
          <section className="mt-10">
            <div className="mb-4 flex items-baseline gap-3 px-1">
              <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted">From Slack — needs you</h2>
              {slackActs && (
                <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-text-2">{slackActs.length}</span>
              )}
            </div>

            {slackLoading && <p className="px-1 text-[13.5px] text-muted">Reading your Slack…</p>}
            {!slackLoading && slackErr && <p className="px-1 text-[13.5px] text-muted">Couldn’t read Slack: {slackErr}</p>}
            {!slackLoading && !slackErr && slackActs && slackActs.length === 0 && (
              <p className="px-1 text-[13.5px] text-text-2">
                Nothing on Slack needs you right now.
                {(slackKnow > 0 || slackFiled > 0) && ` ${slackKnow} good to know · ${slackFiled} filed as noise.`}
              </p>
            )}

            {slackActs?.map((m) => (
              <div key={m.id} className="mb-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2.5">
                  <SourceBadge source="slack" urgent={m.emergency} label={`${m.emergency ? 'URGENT · ' : ''}${m.dm ? 'DM' : `#${m.channel}`} · ${m.workspaceName}`} />
                  <Aud a={m.audience} />
                  <span className="text-[13px] text-text-2">{m.from}</span>
                  {m.ts && <span className="ml-auto text-[12px] text-muted">{timeAgo(slackTsMs(m.ts))}</span>}
                </div>
                <p className="mt-2 font-display text-[18px] leading-snug text-text">{m.headline || (m.text.length > 200 ? `${m.text.slice(0, 197)}…` : m.text)}</p>
                <SeeMore
                  open={openKeys.has(`sl:${m.id}`)}
                  body={bodyCache.current[`sl:${m.id}`]}
                  onToggle={() => toggleExpand(`sl:${m.id}`, () => summarizeItem({ kind: 'slack', workspace: m.workspace, channel: m.channelId }).then((r) => r.body || m.text))}
                />
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <button type="button" onClick={() => trackSlack(m)} className="rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">+ Track it</button>
                  <button type="button" onClick={() => dismissSlack(m)} className="rounded-xl border border-border-2 bg-surface-2 px-4 py-2.5 text-[13px] font-semibold text-text-2 transition hover:bg-hover">Not for me</button>
                </div>
              </div>
            ))}

            {!slackLoading && !slackErr && slackActs && slackActs.length > 0 && (slackKnow > 0 || slackFiled > 0) && (
              <p className="mt-4 px-1 text-[12.5px] text-muted">{slackKnow} good to know · {slackFiled} filed away as noise.</p>
            )}
          </section>

          {/* gentle resurfacing — a dropped thread returns as an invitation, never a scolding */}
          {stale && (
            <section className="mt-10">
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <div className="flex items-start gap-3.5">
                  <div className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))] text-[18px]">🌱</div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[17px] font-semibold text-text">Want to pick this back up?</p>
                    <p className="mt-1 text-[13px] text-text-2">
                      {stale.from ? `${stale.from} — ` : ''}“{stale.task.length > 120 ? `${stale.task.slice(0, 117)}…` : stale.task}”. No pressure — I kept it safe.
                    </p>
                    <div className="mt-3.5 flex flex-wrap gap-2.5">
                      <button type="button" onClick={() => setFocus({ task: stale.task, loopId: stale.id })} className="rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">Do it now</button>
                      <button type="button" onClick={() => snoozeLoop(stale.id, new Date(now.getTime() + 24 * 3600_000).toISOString())} className="rounded-xl border border-border-2 bg-surface-2 px-4 py-2.5 text-[13px] font-semibold text-text-2 transition hover:bg-hover">Tomorrow</button>
                      <button type="button" onClick={() => completeLoop(stale.id)} className="rounded-xl px-3 py-2.5 text-[13px] font-medium text-muted transition hover:text-text-2">It’s handled</button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* the rest of the open loops */}
          {restList.length > 0 && (
            <section className="mt-10">
              <div className="mb-4 flex items-baseline gap-3 px-1">
                <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted">Open loops</h2>
                <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-text-2">{restList.length}</span>
              </div>
              {restList.map((l) => (
                <LoopCard
                  key={l.id}
                  loop={l}
                  now={now}
                  onDone={() => completeLoop(l.id)}
                  onSnooze={() => snoozeLoop(l.id, new Date(now.getTime() + 3 * 3600_000).toISOString())}
                  onDraft={l.email || l.slack ? () => void draftLoopReply(l) : undefined}
                />
              ))}
            </section>
          )}

          {/* momentum — small real wins + a forgiving streak (dopamine, no guilt) */}
          <Momentum tz={tz} now={now} />

          {/* self-development: MARVIN gets sharper from every correction */}
          {learned > 0 && (
            <p className="mt-10 border-t border-border pt-5 text-[12.5px] text-text-2">
              🌱 MARVIN has learned <span className="font-semibold text-text">{learned}</span>{' '}
              {learned === 1 ? 'thing' : 'things'} from your corrections.{' '}
              <Link href="/memory" className="font-medium text-accent hover:underline">Review what it knows</Link>.
            </p>
          )}

          {/* honest note about auto-capture */}
          <p className={`${learned > 0 ? 'mt-3' : 'mt-10 border-t border-border pt-5'} text-[12.5px] text-muted`}>
            {data?.connected.slack || data?.connected.trello
              ? 'Xanî is watching Slack & Trello — new commitments land here automatically.'
              : (
                <>Connect Slack &amp; Trello in <Link href="/connections" className="font-medium text-accent hover:underline">Connections</Link> and every “ok” you give lands here on its own.</>
              )}
          </p>
          </>
          )}
        </>
      )}
      {focus && (
        <FocusSession
          task={focus.task}
          onComplete={focus.loopId ? () => completeLoop(focus.loopId!) : undefined}
          onClose={() => setFocus(null)}
        />
      )}
      {flash && (
        <div className="fixed bottom-6 left-1/2 z-[90] -translate-x-1/2 rounded-xl bg-ink px-4 py-3 text-[13.5px] font-semibold text-[#f5f2ea] shadow-lg">
          {flash}
        </div>
      )}
    </div>
  );
}
