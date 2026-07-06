'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { getSettings, isDayOff, weekdayInTimezone, type XaniSettings } from '@/lib/settings';
import { ensureStorageReady, readJson, writeJson } from '@/lib/storage';
import { fetchBriefingData, fetchInbox, fetchMessageBody, fetchSlack, peekData, PATHS } from '@/lib/marvin-data';
import { fetchInboxTriage, fetchSlackTriage, getBrief, getWaiting, requestDraft, sortDump, summarizeItem } from '@/lib/marvin-client';
import { enqueueApproval } from '@/lib/approvals';
import type { BriefingData, InboxData, SlackData, TriagedEmail, TriagedSlack, WaitingItem } from '@/lib/marvin-protocol';
import { activeLoops, attachLoopRef, captureLoop, completeLoop, snoozeLoop, refineLoop, type OpenLoop } from '@/lib/open-loops';
import { syncOpenLoops } from '@/lib/loops-monitor';
import { recordTriageCorrection, triageLearnings, learnedCount } from '@/lib/triage-learning';
import { understandingFacts } from '@/lib/understanding';
import { recordTriageOutcome } from '@/lib/learning-metrics';
import { voicePromptFor, voiceKeyFor } from '@/lib/voice';
import { FocusSession } from '@/components/home/FocusSession';
import { Timeline } from '@/components/home/Timeline';
import { Momentum } from '@/components/home/Momentum';
import { MicButton } from '@/components/home/MicButton';
import { SourceBadge } from '@/components/home/SourceBadge';
import { DayRitual } from '@/components/home/DayRitual';
import { dueLabel, estLabel, timeAgo, slackTsMs, whenExact } from '@/lib/tone';

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

// Persisted triage so Home paints last-session results INSTANTLY on open, then
// revalidates — never a blank "Reading your inbox…" wait that brings nothing.
const INBOX_TRIAGE_KEY = 'xani.triage.inbox.v1';
const SLACK_TRIAGE_KEY = 'xani.triage.slack.v1';
type InboxTriageCache = { acts: TriagedEmail[]; know: number; filed: number };
type SlackTriageCache = { acts: TriagedSlack[]; know: number; filed: number };

const SOURCE: Record<OpenLoop['source'], { label: string; cls: string }> = {
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

/** A hard calendar deadline the triage model pulled out of the message ("by Friday",
 *  "COB Thursday"). Calm but clear — today/tomorrow/overdue get the accent, the rest
 *  stays quiet. Distinct from dueLabel (which paces the "one thing" by time-of-day). */
function DueChip({ dueAt, now }: { dueAt?: string; now: Date }) {
  if (!dueAt) return null;
  const m = dueAt.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  const dm = () => due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const label =
    days === 0 ? 'due today'
    : days === 1 ? 'due tomorrow'
    : days > 1 && days <= 6 ? `due ${due.toLocaleDateString('en-GB', { weekday: 'short' })}`
    : days > 6 ? `due ${dm()}`
    : days === -1 ? 'was due yesterday'
    : `was due ${dm()}`;
  const soon = days <= 1; // today, tomorrow, or already passed
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${soon ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'}`} title={dueAt}>
      {label}
    </span>
  );
}

/** A timestamp that shows BOTH the relative age and the exact send date, so a "13h ago" can
 *  always be checked against the real date in Slack/Gmail — nothing can quietly look new. */
function Stamp({ ms, tz }: { ms: number; tz?: string }) {
  if (!ms || Number.isNaN(ms)) return null;
  const exact = whenExact(ms, tz);
  return (
    <span className="ml-auto shrink-0 text-right text-[12px] text-muted" title={exact}>
      {timeAgo(ms)} <span className="opacity-60">· {exact}</span>
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

function LoopCard({ loop, now, tz, expanded, body, onExpand, onDone, onSnooze, onDraft }: {
  loop: OpenLoop; now: Date; tz?: string;
  expanded: boolean; body?: string; onExpand: () => void;
  onDone: () => void; onSnooze: () => void; onDraft?: () => void;
}) {
  const src = SOURCE[loop.source] ?? SOURCE.manual;
  const due = dueLabel(loop.dueAt, now);
  const when = loop.at ?? loop.createdAt;
  return (
    <div className="mb-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2.5">
        <SourceBadge source={loop.source} label={loop.channel ?? src.label} />
        {loop.audience && <Aud a={loop.audience} />}
        {loop.from && <span className="text-[13px] text-text-2">{loop.from}</span>}
        {when && <Stamp ms={Date.parse(when)} tz={tz} />}
      </div>
      <p className="mt-2.5 font-display text-[18px] leading-snug text-text">{loop.headline || loop.task}</p>
      {(loop.estMins || due) && (
        <p className="mt-1.5 text-[12px] font-medium text-muted">{[loop.estMins ? estLabel(loop.estMins) : null, due].filter(Boolean).join(' · ')}</p>
      )}
      {loop.saidOk && (
        <span className="mt-3 inline-flex items-center gap-2 rounded-[9px] bg-gold-soft px-3 py-1.5 text-[12px] font-semibold text-[#8a6d34]">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />You said “ok”
        </span>
      )}
      {(loop.email || loop.slack) && <SeeMore open={expanded} body={body} onToggle={onExpand} />}
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

/** Best-effort re-link of an orphaned loop (captured before source-refs existed) back to a
 *  live message, so it can show an interpreted headline + a "See full message". By sender first,
 *  then subject/text, so we never mis-attach a manual note to a random email. */
function emailAddr(s: string): string {
  const m = s.match(/<([^>]+)>/);
  return (m?.[1] ?? s).trim().toLowerCase();
}
function matchEmail(loop: OpenLoop, msgs: InboxData['messages']): InboxData['messages'][number] | undefined {
  const subj = (loop.headline ? '' : loop.task).trim().toLowerCase();
  if (!subj) return undefined;
  const from = loop.from ? emailAddr(loop.from) : '';
  const eq = (s: string) => s.trim().toLowerCase();
  return (
    msgs.find((m) => eq(m.subject) === subj && (!from || emailAddr(m.from) === from)) ??
    msgs.find((m) => eq(m.subject) === subj) ??
    // Same sender, subject contained either way — catches a stored subject that got truncated.
    (from ? msgs.find((m) => emailAddr(m.from) === from && (eq(m.subject).includes(subj) || subj.includes(eq(m.subject)))) : undefined)
  );
}
function matchSlack(loop: OpenLoop, msgs: SlackData['messages']): SlackData['messages'][number] | undefined {
  const text = (loop.headline ? '' : loop.task).replace(/…$/, '').trim().toLowerCase();
  if (!text) return undefined;
  const head = text.slice(0, 40);
  const from = (loop.from || '').trim().toLowerCase();
  return (
    msgs.find((m) => m.user.trim().toLowerCase() === from && m.text.trim().toLowerCase().startsWith(head)) ??
    msgs.find((m) => m.text.trim().toLowerCase().startsWith(head))
  );
}

/** A headline the summariser produces when it was handed an empty body — never show these as if
 *  they were a real interpretation; regenerate, or fall back to the message's actual subject. */
const BAD_HEADLINE = /no (email )?content|missing content|incomplete|nothing to (analyz|summari)|could ?n'?t (read|load|find)|^no message|empty (message|email)|content (provided|after header)/i;

/** Cheap HTML→text for the reading pane. Notification emails (Trello, GitHub, calendar) ship
 *  HTML only with no text/plain part; without this the "See full message" pane came up empty. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ')
    .trim();
}
/** Best plain-text of a fetched email body: server text, then stripped HTML, then a fallback. */
function emailBodyText(mb: { text?: string; body?: string; html?: string } | null, fallback = ''): string {
  if (!mb) return fallback;
  const t = (mb.text || mb.body || '').trim();
  if (t) return t;
  if (mb.html) { const s = stripHtml(mb.html); if (s) return s; }
  return fallback;
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
  const [inboxStale, setInboxStale] = useState(false); // showing last-known because we couldn't verify
  const [slackActs, setSlackActs] = useState<TriagedSlack[] | null>(null);
  const [slackKnow, setSlackKnow] = useState(0);
  const [slackFiled, setSlackFiled] = useState(0);
  const [slackErr, setSlackErr] = useState<string | null>(null);
  const [slackLoading, setSlackLoading] = useState(true);
  const [slackStale, setSlackStale] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [learned, setLearned] = useState(0);
  const [overwhelmed, setOverwhelmed] = useState(false);
  const [brief, setBrief] = useState('');
  const [waiting, setWaiting] = useState<WaitingItem[]>([]);
  const [showAllWaiting, setShowAllWaiting] = useState(false);
  // ADHD Rule 1 — a primary surface shows at most 3 items; the rest are one tap away,
  // so a busy morning is a short calm list, not an endless scroll.
  const HOME_CAP = 3;
  const [showAllInbox, setShowAllInbox] = useState(false);
  const [showAllSlack, setShowAllSlack] = useState(false);
  const [showAllLoops, setShowAllLoops] = useState(false);
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set());
  const bodyCache = useRef<Record<string, string>>({});
  const triedHeadline = useRef<Set<string>>(new Set());
  const recovering = useRef(false);
  // Resident tray app — the window stays open for hours, so the clock must tick or
  // "meeting in 45 min" stays 45 min forever (the exact time-blindness this fights).
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

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

      // MARVIN speaks first: one plain-language brief of what actually needs him today,
      // synthesised server-side from inbox/slack "act" items + calendar + urgent Trello.
      // SWR — instant if today's is cached, regenerates in the background otherwise.
      void getBrief(learnings).then((b) => { if (b.ok && b.text) setBrief(b.text); });

      // Silence detection: emails he sent that went quiet and still want a reply.
      void getWaiting().then((w) => { if (w?.connected) setWaiting(w.items); });
      void syncOpenLoops().then(reloadLoops); // pull live Trello commitments into Open Loops

      // Seed triage from the last session so Home is populated on open; then revalidate.
      const ci = readJson<InboxTriageCache | null>(INBOX_TRIAGE_KEY, null);
      if (ci) { setInboxActs(ci.acts); setInboxKnow(ci.know); setInboxFiled(ci.filed); setInboxLoading(false); }
      const cs = readJson<SlackTriageCache | null>(SLACK_TRIAGE_KEY, null);
      if (cs) { setSlackActs(cs.acts); setSlackKnow(cs.know); setSlackFiled(cs.filed); setSlackLoading(false); }

      // Triage reads Rebaz's corrections so it gets sharper each time (self-development.md).
      fetchInboxTriage(learnings).then((t) => {
        setInboxLoading(false);
        // Couldn't verify (runtime down / disconnected / transient error). With NO cache, say
        // so plainly. WITH a cache, mark it STALE — never present last-known as a confident
        // "nothing needs you" (that's a false all-clear the render now suppresses).
        if (!t) { if (ci) setInboxStale(true); else setInboxErr('runtime unreachable — is it running? (npm run dev:all)'); return; }
        if (t.connected === false) { if (ci) setInboxStale(true); else { setInboxErr(t.error ?? 'No Gmail connected to the runtime — open Connections and reconnect (the Claude app’s Gmail is separate).'); setInboxActs([]); } return; }
        if (t.error && t.triaged.length === 0) { if (ci) setInboxStale(true); else setInboxErr(t.error); return; }
        const acts = t.triaged.filter((m) => m.verdict === 'act');
        const know = t.triaged.filter((m) => m.verdict === 'know').length;
        const filed = t.triaged.filter((m) => m.verdict === 'ignore').length;
        setInboxActs(acts); setInboxKnow(know); setInboxFiled(filed); setInboxErr(null); setInboxStale(false);
        writeJson(INBOX_TRIAGE_KEY, { acts, know, filed });
      });
      fetchSlackTriage(learnings).then((t) => {
        setSlackLoading(false);
        if (!t) { if (cs) setSlackStale(true); else setSlackErr('runtime unreachable — is it running? (npm run dev:all)'); return; }
        if (t.connected === false) { if (cs) setSlackStale(true); else { setSlackErr(t.error ?? 'No Slack connected to the runtime — open Connections and reconnect.'); setSlackActs([]); } return; }
        if (t.error && t.triaged.length === 0) { if (cs) setSlackStale(true); else setSlackErr(t.error); return; }
        const acts = t.triaged.filter((m) => m.verdict === 'act');
        const know = t.triaged.filter((m) => m.verdict === 'know').length;
        const filed = t.triaged.filter((m) => m.verdict === 'ignore').length;
        setSlackActs(acts); setSlackKnow(know); setSlackFiled(filed); setSlackErr(null); setSlackStale(false);
        writeJson(SLACK_TRIAGE_KEY, { acts, know, filed });
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

  // Every email/Slack loop should read as MARVIN's interpretation, not a raw subject — and have a
  // "See full message". Old loops captured before source-refs existed are orphaned (no link back to
  // the message), so we first re-link them to the live inbox/Slack by sender+subject, then backfill
  // the headline in full context. Each loop is processed once (triedHeadline guard).
  useEffect(() => {
    if (recovering.current) return; // our own writes re-fire this effect — don't re-enter mid-batch
    // FIRST: wipe any previously-stored garbage headline immediately, unconditionally — so it
    // vanishes on load even for a message we can no longer re-fetch (e.g. a Trello do-not-reply
    // notification). The card falls back to its real subject; a good headline is regenerated below.
    const garbage = loops.filter((l) => l.headline && BAD_HEADLINE.test(l.headline));
    if (garbage.length > 0) {
      garbage.forEach((l) => attachLoopRef(l.id, { headline: undefined }));
      reloadLoops();
      return; // re-runs with clean loops; recovery picks up from there
    }
    const targets = loops.filter(
      (l) => (l.source === 'email' || l.source === 'slack')
        && !l.headline // missing interpretation → generate
        && !triedHeadline.current.has(l.id),
    );
    if (targets.length === 0) return;
    recovering.current = true;
    void (async () => {
      try {
        const needEmailRecovery = targets.some((l) => l.source === 'email' && !l.email);
        const needSlackRecovery = targets.some((l) => l.source === 'slack' && !l.slack);
        const [inbox, slack] = await Promise.all([
          needEmailRecovery ? fetchInbox() : Promise.resolve(null),
          needSlackRecovery ? fetchSlack() : Promise.resolve(null),
        ]);
        for (const l of targets) {
          triedHeadline.current.add(l.id);
          // 1. Re-link orphaned loops back to the real message.
          let email = l.email;
          let slk = l.slack;
          if (!email && l.source === 'email' && inbox?.messages) {
            const m = matchEmail(l, inbox.messages);
            if (m) {
              email = { account: m.account, id: m.id, from: m.from, subject: m.subject };
              attachLoopRef(l.id, { email, at: l.at ?? m.receivedAt });
            }
          }
          if (!slk && l.source === 'slack' && slack?.messages) {
            const m = matchSlack(l, slack.messages);
            if (m) {
              slk = { workspace: m.workspace, channelId: m.channelId, channel: m.channel, from: m.user, text: m.text };
              attachLoopRef(l.id, { slack: slk, ref: `${m.channelId}:${m.ts}`, at: l.at ?? new Date(slackTsMs(m.ts)).toISOString() });
            }
          }
          // 2. Backfill the interpreted headline (needs a live ref to read the message).
          const p = email
            ? { kind: 'email' as const, account: email.account, id: email.id }
            : slk
              ? { kind: 'slack' as const, workspace: slk.workspace, channel: slk.channelId }
              : null;
          if (!p) continue;
          const r = await summarizeItem(p);
          // Only store a real interpretation — never a degenerate "no content" line.
          if (r.ok && r.headline && !BAD_HEADLINE.test(r.headline)) refineLoop(l.id, { headline: r.headline });
        }
      } finally {
        recovering.current = false;
        reloadLoops();
      }
    })();
  }, [loops, reloadLoops]);

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
      headline: m.headline,
      at: m.receivedAt,
      dueAt: m.dueAt,
      audience: m.audience,
      email: { account: m.account, id: m.id, from: m.from, subject: m.subject },
    });
    recordTriageCorrection({ medium: 'email', from: m.from, subject: m.subject, decision: 'act' });
    recordTriageOutcome('confirmed'); // Xanî surfaced it, Rebaz agreed — a hit
    setLearned(learnedCount());
    flashMsg('Tracked — MARVIN is holding it for you.');
    setInboxActs((cur) => (cur ? cur.filter((x) => x.id !== m.id) : cur));
  };
  const dismissEmail = (m: TriagedEmail) => {
    recordTriageCorrection({ medium: 'email', from: m.from, subject: m.subject, decision: 'ignore' });
    recordTriageOutcome('corrected'); // Xanî surfaced it, Rebaz said no — a wrong call
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
      headline: m.headline,
      at: m.ts ? new Date(slackTsMs(m.ts)).toISOString() : undefined,
      dueAt: m.dueAt,
      audience: m.audience,
      ref: m.id,
      slack: { workspace: m.workspace, channelId: m.channelId, channel: m.channel, from: m.from, text: m.text },
    });
    recordTriageCorrection({ medium: 'slack', from: m.from, subject: m.dm ? m.text : `#${m.channel}: ${m.text}`, decision: 'act' });
    recordTriageOutcome('confirmed');
    setLearned(learnedCount());
    flashMsg('Tracked — MARVIN is holding it for you.');
    setSlackActs((cur) => (cur ? cur.filter((x) => x.id !== m.id) : cur));
  };
  const dismissSlack = (m: TriagedSlack) => {
    recordTriageCorrection({ medium: 'slack', from: m.from, subject: m.dm ? m.text : `#${m.channel}: ${m.text}`, decision: 'ignore' });
    recordTriageOutcome('corrected');
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
      // Reply to the real reply-to address; the sidecar extracts the bare address and
      // refuses to send if there isn't one.
      const to = mb?.replyTo || loop.email.from;
      enqueueApproval({
        kind: 'email',
        title: `Reply to ${loop.email.from}`,
        source: `Email · ${loop.email.account}`,
        preview: r.draft,
        actionLabel: 'Send',
        voiceKey: voiceKeyFor('email', 'all'),
        // Real threaded payload → approving actually sends into the same conversation.
        payload: { kind: 'email', to, subject: reSubject, body: r.draft, account: loop.email.account, threadId: mb?.threadId, inReplyTo: mb?.messageId, references: mb?.references },
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

  // Draft a gentle follow-up on a thread that went quiet. Routes through Approvals —
  // nothing sends without Rebaz's nod. Threaded by threadId so it lands in the same convo.
  const draftNudge = async (item: WaitingItem) => {
    flashMsg('MARVIN is drafting a nudge…');
    const who = item.to || 'them';
    const context =
      `I emailed ${who} ${item.quietDays} day${item.quietDays === 1 ? '' : 's'} ago and haven't heard back. ` +
      `Subject: "${item.subject}". My message was: ${item.snippet}. ` +
      `Write a short, warm follow-up chasing a reply — no guilt-tripping, just a gentle nudge.`;
    const r = await requestDraft({ account: item.account, from: who, subject: item.subject, body: context, medium: 'email', voice: voicePromptFor('email', 'all') });
    if (!r.ok || !r.draft) { flashMsg(`Draft failed: ${r.error ?? 'unknown error'}`); return; }
    const reSubject = /^re:/i.test(item.subject) ? item.subject : `Re: ${item.subject}`;
    enqueueApproval({
      kind: 'email',
      title: `Nudge ${who}`,
      source: `Email · ${item.account}`,
      preview: r.draft,
      actionLabel: 'Send',
      voiceKey: voiceKeyFor('email', 'all'),
      payload: { kind: 'email', to: item.to, subject: reSubject, body: r.draft, account: item.account, threadId: item.threadId },
    });
    flashMsg('✍️ Nudge ready in Approvals — review & send.');
  };
  // Let it go — hide this one for the session (he's decided it doesn't need chasing).
  const dismissWaiting = (item: WaitingItem) => {
    setWaiting((cur) => cur.filter((w) => w.threadId !== item.threadId));
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
          {/* MARVIN speaks first — the morning brief, in his own words */}
          {brief && (
            <section className="mt-8 rounded-2xl border border-border bg-surface p-6 shadow-sm"
              style={{ borderTopWidth: 3, borderTopColor: 'var(--accent)' }}>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-accent">MARVIN — this morning</div>
              <div className="mt-3 space-y-1.5 text-[14.5px] leading-relaxed text-text">
                {brief.split('\n').filter((l) => l.trim()).map((line, i) => (
                  <p key={i}>{line.replace(/^[-•*]\s*/, '· ')}</p>
                ))}
              </div>
            </section>
          )}

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
                      ? fetchMessageBody(oneThing.email.account, oneThing.email.id).then((mb) => emailBodyText(mb))
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
            {!inboxLoading && !inboxErr && inboxStale && (
              <p className="px-1 text-[13.5px] text-muted">Couldn’t refresh just now — showing last known. Not a confirmed all-clear.</p>
            )}
            {!inboxLoading && !inboxErr && !inboxStale && inboxActs && inboxActs.length === 0 && (
              <p className="px-1 text-[13.5px] text-text-2">
                Nothing in your inbox needs you right now.
                {(inboxKnow > 0 || inboxFiled > 0) && ` ${inboxKnow} good to know · ${inboxFiled} filed as noise.`}
              </p>
            )}

            {(showAllInbox ? inboxActs : inboxActs?.slice(0, HOME_CAP))?.map((m) => (
              <div key={m.id} className="mb-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2.5">
                  <SourceBadge source="email" label={m.account} />
                  <Aud a={m.audience} />
                  <DueChip dueAt={m.dueAt} now={now} />
                  <span className="text-[13px] text-text-2">{m.from}</span>
                  {m.receivedAt && <Stamp ms={Date.parse(m.receivedAt)} tz={tz} />}
                </div>
                <p className="mt-2 font-display text-[18px] leading-snug text-text">{m.headline || m.subject}</p>
                <SeeMore
                  open={openKeys.has(`in:${m.id}`)}
                  body={bodyCache.current[`in:${m.id}`]}
                  onToggle={() => toggleExpand(`in:${m.id}`, () => fetchMessageBody(m.account, m.id).then((mb) => emailBodyText(mb, m.snippet)))}
                />
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <button type="button" onClick={() => trackEmail(m)} className="rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">+ Track it</button>
                  <button type="button" onClick={() => dismissEmail(m)} className="rounded-xl border border-border-2 bg-surface-2 px-4 py-2.5 text-[13px] font-semibold text-text-2 transition hover:bg-hover">Not for me</button>
                </div>
              </div>
            ))}

            {inboxActs && inboxActs.length > HOME_CAP && (
              <button type="button" onClick={() => setShowAllInbox((v) => !v)} className="px-1 text-[12.5px] font-semibold text-accent transition hover:underline">
                {showAllInbox ? 'Show less' : `Show ${inboxActs.length - HOME_CAP} more`}
              </button>
            )}

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
            {!slackLoading && !slackErr && slackStale && (
              <p className="px-1 text-[13.5px] text-muted">Couldn’t refresh just now — showing last known. Not a confirmed all-clear.</p>
            )}
            {!slackLoading && !slackErr && !slackStale && slackActs && slackActs.length === 0 && (
              <p className="px-1 text-[13.5px] text-text-2">
                Nothing on Slack needs you right now.
                {(slackKnow > 0 || slackFiled > 0) && ` ${slackKnow} good to know · ${slackFiled} filed as noise.`}
              </p>
            )}

            {(showAllSlack ? slackActs : slackActs?.slice(0, HOME_CAP))?.map((m) => (
              <div key={m.id} className="mb-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2.5">
                  <SourceBadge source="slack" urgent={m.emergency} label={`${m.emergency ? 'URGENT · ' : ''}${m.dm ? 'DM' : `#${m.channel}`} · ${m.workspaceName}`} />
                  <Aud a={m.audience} />
                  <DueChip dueAt={m.dueAt} now={now} />
                  <span className="text-[13px] text-text-2">{m.from}</span>
                  {m.ts && <Stamp ms={slackTsMs(m.ts)} tz={tz} />}
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

            {slackActs && slackActs.length > HOME_CAP && (
              <button type="button" onClick={() => setShowAllSlack((v) => !v)} className="px-1 text-[12.5px] font-semibold text-accent transition hover:underline">
                {showAllSlack ? 'Show less' : `Show ${slackActs.length - HOME_CAP} more`}
              </button>
            )}

            {!slackLoading && !slackErr && slackActs && slackActs.length > 0 && (slackKnow > 0 || slackFiled > 0) && (
              <p className="mt-4 px-1 text-[12.5px] text-muted">{slackKnow} good to know · {slackFiled} filed away as noise.</p>
            )}
          </section>

          {/* waiting on a reply — emails he sent that went quiet and still want an answer */}
          {waiting.length > 0 && (
            <section className="mt-10">
              <div className="mb-4 flex items-baseline gap-3 px-1">
                <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted">Still waiting on a reply</h2>
                <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-text-2">{waiting.length}</span>
              </div>
              {(showAllWaiting ? waiting : waiting.slice(0, HOME_CAP)).map((w) => (
                <div key={w.threadId} className="mb-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <SourceBadge source="email" label={w.account} />
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">quiet {w.quietDays}d</span>
                    {w.to && <span className="text-[13px] text-text-2">to {w.to}</span>}
                  </div>
                  <p className="mt-2 font-display text-[18px] leading-snug text-text">{w.subject}</p>
                  {w.snippet && <p className="mt-1.5 text-[13px] leading-relaxed text-text-2">“{w.snippet.length > 160 ? `${w.snippet.slice(0, 157)}…` : w.snippet}”</p>}
                  <div className="mt-4 flex flex-wrap gap-2.5">
                    <button type="button" onClick={() => void draftNudge(w)} className="rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">✍️ Draft a nudge</button>
                    <button type="button" onClick={() => dismissWaiting(w)} className="rounded-xl border border-border-2 bg-surface-2 px-4 py-2.5 text-[13px] font-semibold text-text-2 transition hover:bg-hover">Let it go</button>
                  </div>
                </div>
              ))}
              {waiting.length > HOME_CAP && (
                <button type="button" onClick={() => setShowAllWaiting((v) => !v)} className="px-1 text-[12.5px] font-semibold text-accent transition hover:underline">
                  {showAllWaiting ? 'Show less' : `Show ${waiting.length - HOME_CAP} more`}
                </button>
              )}
            </section>
          )}

          {/* gentle resurfacing — a dropped thread returns as an invitation, never a scolding */}
          {stale && (
            <section className="mt-10">
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                <div className="flex items-start gap-3.5">
                  <div className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))] text-[18px]">🌱</div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[17px] font-semibold text-text">Want to pick this back up?</p>
                    <p className="mt-1 text-[13px] text-text-2">
                      {stale.from ? `${stale.from} — ` : ''}“{(() => { const t = stale.headline || stale.task; return t.length > 120 ? `${t.slice(0, 117)}…` : t; })()}”. No pressure — I kept it safe.
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
              {(showAllLoops ? restList : restList.slice(0, HOME_CAP)).map((l) => {
                const key = `loop:${l.id}`;
                return (
                  <LoopCard
                    key={l.id}
                    loop={l}
                    now={now}
                    tz={tz}
                    expanded={openKeys.has(key)}
                    body={bodyCache.current[key]}
                    onExpand={() => toggleExpand(key, () =>
                      l.email
                        ? fetchMessageBody(l.email.account, l.email.id).then((mb) => emailBodyText(mb))
                        : l.slack
                          ? summarizeItem({ kind: 'slack', workspace: l.slack.workspace, channel: l.slack.channelId }).then((r) => r.body || l.slack!.text)
                          : Promise.resolve(''),
                    )}
                    onDone={() => completeLoop(l.id)}
                    onSnooze={() => snoozeLoop(l.id, new Date(now.getTime() + 3 * 3600_000).toISOString())}
                    onDraft={l.email || l.slack ? () => void draftLoopReply(l) : undefined}
                  />
                );
              })}
              {restList.length > HOME_CAP && (
                <button type="button" onClick={() => setShowAllLoops((v) => !v)} className="px-1 text-[12.5px] font-semibold text-accent transition hover:underline">
                  {showAllLoops ? 'Show less' : `Show ${restList.length - HOME_CAP} more`}
                </button>
              )}
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
