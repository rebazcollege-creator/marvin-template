'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ensureStorageReady } from '@/lib/storage';
import { getSettings, type XaniSettings } from '@/lib/settings';
import { fetchInboxTriage, fetchSlackTriage, getBrief, getWaiting } from '@/lib/marvin-client';
import { fetchBriefingData } from '@/lib/marvin-data';
import { activeLoops } from '@/lib/open-loops';
import { triageLearnings, learnedCount } from '@/lib/triage-learning';
import { understandingFacts } from '@/lib/understanding';
import { buildTasks, markDone, dismissTask, snoozeTask, type Task } from '@/lib/today-tasks';
import type { TriagedEmail, TriagedSlack, WaitingItem, BriefingData } from '@/lib/marvin-protocol';
import type { OpenLoop } from '@/lib/open-loops';

function greeting(h: number): string {
  return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
const SRC_ICON: Record<string, string> = { email: '✉️', slack: '💬', trello: '🗂️', manual: '✦' };

function dueChip(dueAt: string | undefined, now: Date): { label: string; soon: boolean } | null {
  if (!dueAt) return null;
  const m = dueAt.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  const dm = due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const label = d === 0 ? 'due today' : d === 1 ? 'due tomorrow' : d > 1 && d <= 6 ? `due ${due.toLocaleDateString('en-GB', { weekday: 'short' })}` : d > 6 ? `due ${dm}` : d === -1 ? 'was due yesterday' : `was due ${dm}`;
  return { label, soon: d <= 1 };
}

export function TodayView() {
  const [settings, setSettings] = useState<XaniSettings | null>(null);
  const [inbox, setInbox] = useState<TriagedEmail[]>([]);
  const [slack, setSlack] = useState<TriagedSlack[]>([]);
  const [loops, setLoops] = useState<OpenLoop[]>([]);
  const [waiting, setWaiting] = useState<WaitingItem[]>([]);
  const [brief, setBrief] = useState('');
  const [cal, setCal] = useState<BriefingData['calendar']>([]);
  const [calConnected, setCalConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rev, setRev] = useState(0);
  const [learned, setLearned] = useState(0);
  const now = useMemo(() => new Date(), []);

  const refreshLoops = useCallback(() => setLoops(activeLoops()), []);

  useEffect(() => {
    ensureStorageReady().then(() => {
      const s = getSettings();
      setSettings(s);
      setLearned(learnedCount());
      refreshLoops();
      const learnings = [...triageLearnings(), ...understandingFacts()];
      void getBrief(learnings).then((b) => { if (b.ok && b.text) setBrief(b.text); });
      void getWaiting().then((w) => { if (w?.connected) setWaiting(w.items); });
      void fetchBriefingData().then((d) => { if (d) { setCal(d.calendar ?? []); setCalConnected(!!d.connected?.calendar); } });
      void Promise.all([fetchInboxTriage(learnings), fetchSlackTriage(learnings)]).then(([i, sl]) => {
        if (i?.triaged) setInbox(i.triaged.filter((m) => m.verdict === 'act'));
        if (sl?.triaged) setSlack(sl.triaged.filter((m) => m.verdict === 'act'));
        setLoading(false);
      });
    });
  }, [refreshLoops]);

  const tasks = useMemo(() => buildTasks({ inbox, slack, loops, now }), [inbox, slack, loops, now, rev]);
  const bump = () => { setRev((r) => r + 1); setLearned(learnedCount()); };

  const onDone = (t: Task) => { markDone(t); refreshLoops(); bump(); };
  const onDismiss = (t: Task) => { dismissTask(t); refreshLoops(); bump(); };
  const onLater = (t: Task, hrs: number) => { snoozeTask(t, new Date(Date.now() + hrs * 3600_000)); refreshLoops(); bump(); };

  const name = settings?.profile.name?.split(' ')[0] ?? '';
  const hour = now.getHours();
  const dateLabel = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const todayEvents = (cal ?? []).slice(0, 6);

  return (
    <div className="td-root">
      <div className="td-wrap">
        <header className="td-head">
          <div>
            <h1 className="td-hey">{greeting(hour)}{name ? `, ${name}` : ''}.</h1>
            <p className="td-sub">Here’s your day, gently organized.</p>
          </div>
          <div className="td-date">{dateLabel}</div>
          <Link href="/connections" className="td-gear" title="Connections & settings">⚙</Link>
        </header>

        {brief && (
          <section className="td-brief">
            <div className="td-brief-label">MARVIN — this morning</div>
            <div className="td-brief-body">
              {brief.split('\n').filter((l) => l.trim()).map((l, i) => <p key={i}>{l.replace(/^[-•*]\s*/, '· ')}</p>)}
            </div>
          </section>
        )}

        <div className="td-grid">
          {/* tasks */}
          <section className="td-col">
            <div className="td-h3">What needs you {tasks.length > 0 && <span className="td-count">{tasks.length}</span>}</div>
            {loading && <p className="td-muted">MARVIN is gathering your day…</p>}
            {!loading && tasks.length === 0 && (
              <div className="td-empty">
                <div className="td-empty-mark">✦</div>
                <p>Nothing needs you right now.</p>
                <p className="td-muted">MARVIN pulls tasks from your connected accounts. {learned > 0 ? `It has learned ${learned} things about your workflow.` : <>Connect your accounts in <Link href="/connections" className="td-link">Connections</Link>.</>}</p>
              </div>
            )}
            {tasks.map((t) => {
              const due = dueChip(t.dueAt, now);
              return (
                <div key={t.id} className="td-task">
                  <button type="button" className="td-check" title="Done" onClick={() => onDone(t)}>✓</button>
                  <div className="td-task-body">
                    <div className="td-task-title">{t.title}</div>
                    <div className="td-task-meta">
                      <span className="td-src">{SRC_ICON[t.source] ?? '✦'} {t.channel ?? t.source}</span>
                      {t.from && <span>· {t.from}</span>}
                      {due && <span className={`td-due${due.soon ? ' soon' : ''}`}>· {due.label}</span>}
                    </div>
                    <div className="td-task-actions">
                      <button type="button" onClick={() => onLater(t, 3)}>Later today</button>
                      <button type="button" onClick={() => onLater(t, 24)}>Tomorrow</button>
                      <button type="button" className="td-not" onClick={() => onDismiss(t)}>Not a task</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>

          {/* calendar + context */}
          <aside className="td-col td-side">
            <div className="td-card">
              <div className="td-h3">Today</div>
              {!calConnected && <p className="td-muted">Calendar not connected. <Link href="/connections" className="td-link">Connect</Link></p>}
              {calConnected && todayEvents.length === 0 && <p className="td-muted">No events today. A clear canvas.</p>}
              {todayEvents.map((e, i) => {
                const t = new Date(e.start);
                const tm = Number.isNaN(t.getTime()) ? '' : t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                return <div key={i} className="td-evt"><span className="td-tm">{tm}</span> {e.title}</div>;
              })}
            </div>

            {waiting.length > 0 && (
              <div className="td-card">
                <div className="td-h3">Waiting on a reply</div>
                {waiting.slice(0, 4).map((w) => (
                  <div key={w.threadId} className="td-wait"><span className="td-quiet">{w.quietDays}d</span> {w.to || 'someone'} — {w.subject}</div>
                ))}
              </div>
            )}

            <div className="td-breath">Take a breath.<br />You’ve got this.</div>
          </aside>
        </div>
      </div>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.td-root{min-height:100vh;background:radial-gradient(130% 100% at 50% 0%,#fbf7ee 0%,#f1ece2 55%,#e9e1d2 100%);
  color:#2c2820;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
.td-wrap{max-width:1040px;margin:0 auto;padding:44px clamp(20px,5vw,56px) 80px}
.td-head{display:flex;align-items:flex-start;gap:16px;margin-bottom:26px}
.td-hey{font-family:Georgia,serif;font-weight:500;font-size:clamp(28px,4.4vw,40px);line-height:1.05;color:#2a251c}
.td-sub{margin-top:6px;color:#6b6455;font-size:14.5px}
.td-date{margin-left:auto;color:#9a917e;font-size:13px;padding-top:8px}
.td-gear{color:#b7ad98;text-decoration:none;font-size:18px;padding:6px;border-radius:8px;line-height:1}
.td-gear:hover{color:#6b6455;background:rgba(198,163,95,.12)}

.td-brief{background:#fbf8f1;border:1px solid #e6ddcd;border-top:3px solid #c6a35f;border-radius:16px;padding:18px 20px;margin-bottom:24px}
.td-brief-label{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#a8843f}
.td-brief-body{margin-top:9px;font-size:14.5px;line-height:1.55;color:#3a3428}
.td-brief-body p{margin:2px 0}

.td-grid{display:grid;grid-template-columns:1.5fr 1fr;gap:22px;align-items:start}
@media (max-width:820px){.td-grid{grid-template-columns:1fr}}
.td-h3{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#9a917e;margin-bottom:14px;display:flex;align-items:center;gap:9px}
.td-count{background:#efe4cc;color:#a8843f;font-size:11px;padding:1px 8px;border-radius:999px;letter-spacing:0}
.td-muted{color:#9a917e;font-size:13.5px;line-height:1.5}
.td-link{color:#a8843f;font-weight:600;text-decoration:none;border-bottom:1px solid rgba(168,132,63,.3)}

.td-task{display:flex;gap:14px;background:#fbf8f1;border:1px solid #e6ddcd;border-radius:14px;padding:15px 16px;margin-bottom:11px;transition:box-shadow .2s}
.td-task:hover{box-shadow:0 8px 24px rgba(140,110,60,.09)}
.td-check{flex:none;width:24px;height:24px;border-radius:8px;border:1.5px solid #c6a35f;background:#fff;color:transparent;cursor:pointer;font-size:13px;font-weight:700;display:grid;place-items:center;transition:all .15s}
.td-check:hover{background:#c6a35f;color:#fff}
.td-task-body{min-width:0;flex:1}
.td-task-title{font-size:15.5px;font-weight:600;color:#2a251c;line-height:1.35}
.td-task-meta{margin-top:5px;display:flex;flex-wrap:wrap;gap:6px;font-size:12.5px;color:#8a8170}
.td-src{color:#7a6f5b}
.td-due{color:#8a8170}
.td-due.soon{color:#a8843f;font-weight:600}
.td-task-actions{margin-top:11px;display:flex;gap:8px}
.td-task-actions button{font-size:12.5px;color:#7a6f5b;background:#f4efe4;border:1px solid #e6ddcd;border-radius:9px;padding:6px 11px;cursor:pointer;transition:all .15s}
.td-task-actions button:hover{background:#efe7d6;color:#2a251c}
.td-task-actions .td-not:hover{color:#9a5b3b;border-color:#e0c7bb}

.td-empty{text-align:center;padding:40px 20px;background:#fbf8f1;border:1px solid #e6ddcd;border-radius:16px}
.td-empty-mark{font-size:26px;color:#c6a35f;margin-bottom:10px}
.td-empty p{margin:4px 0;font-size:14.5px}

.td-side{display:flex;flex-direction:column;gap:16px}
.td-card{background:#fbf8f1;border:1px solid #e6ddcd;border-radius:16px;padding:18px 20px}
.td-evt{display:flex;gap:12px;padding:9px 0;font-size:13.5px;color:#2a251c}
.td-evt+.td-evt{border-top:1px solid #eee4d3}
.td-tm{color:#a8843f;font-weight:600;width:48px;flex:none;font-variant-numeric:tabular-nums}
.td-wait{display:flex;gap:11px;padding:8px 0;font-size:13px;color:#3a3428}
.td-wait+.td-wait{border-top:1px solid #eee4d3}
.td-quiet{color:#a8843f;font-weight:600;font-size:12px;width:34px;flex:none}
.td-breath{background:radial-gradient(120% 120% at 30% 20%,#f2e6cf,#efe7d6);border-radius:16px;padding:22px;color:#7a6435;font-family:Georgia,serif;font-size:16px;line-height:1.4;text-align:center}

a:focus-visible,button:focus-visible{outline:2px solid #c6a35f;outline-offset:2px;border-radius:8px}
`;
