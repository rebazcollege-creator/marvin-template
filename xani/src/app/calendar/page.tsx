'use client';

import { useState } from 'react';
import { fetchCalendar, PATHS } from '@/lib/marvin-data';
import { useLiveData } from '@/lib/use-live-data';
import { RefreshButton } from '@/components/ui/RefreshButton';
import type { CalendarData } from '@/lib/marvin-protocol';
import { Modal } from '@/components/ui/Modal';
import { enqueueApproval } from '@/lib/approvals';

type Ev = CalendarData['events'][number];

function timeOf(e: Ev): string {
  if (e.allDay) return 'All day';
  if (!e.start) return '';
  const s = new Date(e.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const end = e.end ? new Date(e.end).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
  return end ? `${s} – ${end}` : s;
}

export default function CalendarPage() {
  const { data, state, refresh, refreshing } = useLiveData<CalendarData>(PATHS.calendar, fetchCalendar);
  const [open, setOpen] = useState<Ev | null>(null);
  const [focus, setFocus] = useState(false);
  const [queued, setQueued] = useState(false);
  const [fLabel, setFLabel] = useState('Deep work');
  const [fStart, setFStart] = useState('13:00');
  const [fDur, setFDur] = useState('2');

  const badge = state === 'loading' ? 'Loading…' : state === 'offline' ? 'Sidecar offline' : data?.connected ? 'Connected' : 'Not connected';
  const events = data?.events ?? [];

  const protectFocus = () => {
    const [h, m] = fStart.split(':').map((n) => Number(n));
    const start = new Date();
    start.setHours(h ?? 13, m ?? 0, 0, 0);
    const end = new Date(start.getTime() + (Number(fDur) || 2) * 3600_000);
    enqueueApproval({
      kind: 'calendar',
      title: `Protect focus: ${fLabel}`,
      source: 'Calendar · focus block',
      preview: `Hold ${fStart} for ${fDur}h as “${fLabel}”.\nDecline tentative invites that clash; reshuffle flexible tasks around it.`,
      actionLabel: 'Hold focus block',
      payload: { kind: 'calendar', title: `Focus: ${fLabel}`, start: start.toISOString(), end: end.toISOString() },
    });
    setFocus(false);
    setQueued(true);
  };

  const declineEvent = (e: Ev) => {
    enqueueApproval({
      kind: 'calendar',
      title: `Decline: ${e.title}`,
      source: 'Calendar',
      preview: `Decline “${e.title}” (${timeOf(e)}) with a brief note.`,
      actionLabel: 'Decline event',
    });
    setOpen(null);
    setQueued(true);
  };

  return (
    <div className="mx-auto max-w-3xl px-8 pb-16 pt-7">
      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text">Calendar</h1>
          <p className="mt-1 text-[13px] text-muted">Today · Europe/Berlin</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11.5px] text-muted">{badge}</span>
          <RefreshButton onClick={refresh} refreshing={refreshing} />
          <button type="button" onClick={() => setFocus(true)} className="rounded-[10px] bg-accent px-3.5 py-2 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">Protect focus</button>
        </div>
      </div>

      {queued && (
        <div className="mb-4 flex items-center gap-2 rounded-[11px] border border-border bg-surface px-4 py-2.5 text-[12.5px] text-text-2">
          <span className="h-1.5 w-1.5 rounded-full bg-green" /> Sent to Approvals.
          <a href="/approvals" className="ml-auto font-semibold text-accent hover:underline">Review</a>
        </div>
      )}

      {state === 'loading' && <div className="xsk h-24 rounded-2xl" />}
      {state === 'offline' && <Note>MARVIN’s runtime isn’t reachable. Start it with <code className="rounded bg-bg px-1">npm run sidecar</code>. You can still protect a focus block — it waits in Approvals.</Note>}
      {state === 'loaded' && data && !data.connected && <Note>Google Calendar isn’t connected. Add it on Connections (or set the GOOGLE_CALENDAR_* keys) to see your day. You can still protect a focus block — it waits in Approvals. Changing events always needs your confirmation.</Note>}
      {state === 'loaded' && data?.connected && data.error && <Note>Couldn’t read your calendar just now ({data.error}). This isn’t an empty day — try Refresh in a moment.</Note>}
      {state === 'loaded' && data?.connected && !data.error && events.length === 0 && <Note>Nothing on the calendar today.</Note>}

      {state === 'loaded' && data?.connected && events.length > 0 && (
        <ul className="space-y-2.5">
          {events.map((e, i) => (
            <li key={i}>
              <button type="button" onClick={() => setOpen(e)} className="flex w-full items-center justify-between rounded-[14px] border border-border bg-surface p-4 text-left transition hover:bg-hover">
                <span className="text-[13.5px] font-medium text-text">{e.title}</span>
                <span className="text-[11.5px] text-muted">{timeOf(e)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* event detail */}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ''} subtitle={open ? timeOf(open) : undefined} width="max-w-md">
        {open && (
          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={() => declineEvent(open)} className="rounded-[10px] border border-border bg-bg px-4 py-2 text-[13px] font-semibold text-accent hover:bg-accent-soft">Decline…</button>
            <button type="button" onClick={() => setOpen(null)} className="rounded-[10px] border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-text-2 hover:bg-hover">Close</button>
          </div>
        )}
      </Modal>

      {/* protect focus */}
      <Modal open={focus} onClose={() => setFocus(false)} title="Protect focus" subtitle="Held in Approvals before it touches your calendar" width="max-w-lg">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-muted">Label</span>
            <input value={fLabel} onChange={(e) => setFLabel(e.target.value)} className="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-text outline-none focus:border-accent" />
          </label>
          <div className="flex gap-3">
            <label className="flex-1">
              <span className="mb-1 block text-[11.5px] font-semibold text-muted">Start</span>
              <input type="time" value={fStart} onChange={(e) => setFStart(e.target.value)} className="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-text outline-none focus:border-accent" />
            </label>
            <label className="flex-1">
              <span className="mb-1 block text-[11.5px] font-semibold text-muted">Hours</span>
              <input type="number" min="1" max="8" value={fDur} onChange={(e) => setFDur(e.target.value)} className="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-text outline-none focus:border-accent" />
            </label>
          </div>
          <p className="rounded-[11px] border border-border bg-bg px-3.5 py-2.5 text-[11.5px] leading-relaxed text-muted">
            MARVIN will hold this block, decline tentative invites that clash, and reshuffle flexible tasks around it — after you approve.
          </p>
        </div>
        <div className="mt-4 flex justify-end gap-2.5">
          <button type="button" onClick={() => setFocus(false)} className="rounded-[10px] border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-text-2 hover:bg-hover">Cancel</button>
          <button type="button" onClick={protectFocus} className="rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent-dim">Protect block</button>
        </div>
      </Modal>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-sm text-text-2">{children}</div>;
}
