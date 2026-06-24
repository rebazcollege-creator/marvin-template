'use client';

import { useEffect, useState } from 'react';
import { ensureStorageReady } from '@/lib/storage';
import { listActivity, type ActivityEvent, type ActivityKind } from '@/lib/activity';
import { listApprovals, type ApprovalItem } from '@/lib/approvals';

/**
 * Activity = a real record of what MARVIN/you did, plus what's still open.
 *  - Feed: the activity log (actions prepared, approvals decided, automations
 *    created/run, notes, connections) grouped Today / Earlier.
 *  - Open loops: items still pending in Approvals — the things waiting on you.
 * Both are populated from real events; nothing is fabricated.
 */

type Tab = 'feed' | 'loops';

const KIND_TINT: Record<ActivityKind, { tint: string; edge: string }> = {
  approval: { tint: 'var(--accent-soft)', edge: '#C0613A' },
  approved: { tint: '#E8EEE5', edge: '#6E8B6A' },
  rejected: { tint: 'var(--hover)', edge: 'var(--text-2)' },
  automation: { tint: '#F8EFDF', edge: '#D89A4E' },
  note: { tint: '#ECE7F1', edge: '#7A6E9C' },
  connection: { tint: '#E8EEE5', edge: '#6E8B6A' },
  memory: { tint: '#ECE7F1', edge: '#7A6E9C' },
};

function KindGlyph({ kind }: { kind: ActivityKind }) {
  const p = { width: 11, height: 11, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (kind === 'approved') return (<svg {...p}><path d="m5 12.5 4.5 4.5L19 7" /></svg>);
  if (kind === 'rejected') return (<svg {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>);
  if (kind === 'automation') return (<svg {...p}><path d="M13 3 5 13h6l-1 8 8-10h-6z" /></svg>);
  if (kind === 'connection') return (<svg {...p}><path d="M8 12h8M9 8l-3 4 3 4M15 8l3 4-3 4" /></svg>);
  if (kind === 'memory') return (<svg {...p}><circle cx="12" cy="12" r="7" /></svg>);
  return (<svg {...p}><circle cx="12" cy="12" r="3" /></svg>);
}

function relTime(iso: string): string {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '';
  const mins = Math.round((Date.now() - d) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function ActivityPage() {
  const [tab, setTab] = useState<Tab>('feed');
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [pending, setPending] = useState<ApprovalItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const read = () =>
      ensureStorageReady().then(() => {
        setEvents(listActivity());
        setPending(listApprovals().filter((a) => a.status === 'pending'));
        setReady(true);
      });
    read();
    window.addEventListener('xani:activity', read);
    window.addEventListener('xani:approvals-changed', read);
    return () => {
      window.removeEventListener('xani:activity', read);
      window.removeEventListener('xani:approvals-changed', read);
    };
  }, []);

  const today = new Date().toDateString();
  const todayEvents = events.filter((e) => new Date(e.at).toDateString() === today);
  const earlierEvents = events.filter((e) => new Date(e.at).toDateString() !== today);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-none px-8 pt-6">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <h1 className="font-display text-2xl font-semibold text-text">Activity</h1>
            <p className="mt-1 text-[13px] text-muted">Everything MARVIN did, watched, and is still holding for you.</p>
          </div>
          <div className="flex gap-1 rounded-[11px] border border-border bg-surface p-[3px]">
            {([{ id: 'feed', label: 'Feed' }, { id: 'loops', label: `Open loops${pending.length ? ` (${pending.length})` : ''}` }] as const).map((t) => (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`rounded-lg px-4 py-1.5 text-[13px] font-semibold transition ${tab === t.id ? 'bg-accent text-on-accent' : 'text-text-2 hover:text-text'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-12 pt-6">
        <div className="max-w-[680px]">
          {tab === 'feed' ? (
            !ready ? (
              <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="xsk h-12 rounded-xl" />)}</div>
            ) : events.length === 0 ? (
              <Empty title="No activity yet" body="As you (and MARVIN) work — preparing actions, approving them, creating automations — each step lands here, newest first." />
            ) : (
              <>
                {todayEvents.length > 0 && <Group label="TODAY" events={todayEvents} />}
                {earlierEvents.length > 0 && <Group label="EARLIER" events={earlierEvents} />}
              </>
            )
          ) : (
            <>
              <p className="mb-5 text-[12.5px] leading-relaxed text-text-2">
                Open loops are things waiting on you — actions MARVIN has prepared and held in Approvals. They stay here until you decide.
              </p>
              {!ready ? (
                <div className="space-y-2.5">{[0, 1].map((i) => <div key={i} className="xsk h-20 rounded-2xl" />)}</div>
              ) : pending.length === 0 ? (
                <Empty title="No open loops" body="Nothing is waiting on you. When MARVIN prepares an action that needs your nod, it appears here and in Approvals." />
              ) : (
                <div className="space-y-2.5">
                  {pending.map((p) => (
                    <div key={p.id} className="rounded-[14px] border border-border bg-surface p-4">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-semibold text-text">{p.title}</div>
                          <div className="text-[11.5px] text-muted">{p.source} · {relTime(p.createdAt)}</div>
                        </div>
                        <a href="/approvals" className="shrink-0 rounded-[9px] border border-border bg-bg px-3 py-1.5 text-[12px] font-semibold text-accent hover:bg-accent-soft">Review</a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Group({ label, events }: { label: string; events: ActivityEvent[] }) {
  return (
    <div className="mb-7">
      <div className="mb-2.5 text-[11px] font-bold tracking-[0.08em] text-muted">{label}</div>
      <div className="relative pl-6">
        <div className="absolute bottom-1 left-[9px] top-1 w-px bg-border" />
        {events.map((e) => {
          const k = KIND_TINT[e.kind];
          return (
            <div key={e.id} className="relative pb-4">
              <span className="absolute -left-[22px] top-0.5 grid h-[19px] w-[19px] place-items-center rounded-full border-2 border-bg" style={{ background: k.tint, color: k.edge }}>
                <KindGlyph kind={e.kind} />
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-[13.5px] font-semibold text-text">{e.title}</span>
                <span className="whitespace-nowrap text-[11.5px] text-muted">{relTime(e.at)}</span>
              </div>
              {e.detail && <div className="mt-0.5 text-[12.5px] leading-snug text-text-2">{e.detail}</div>}
              {e.tag && <span className="mt-1.5 inline-block rounded-[7px] bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">{e.tag}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[16px] border border-dashed border-border bg-surface px-6 py-12 text-center">
      <p className="text-sm font-semibold text-text">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] text-text-2">{body}</p>
    </div>
  );
}
