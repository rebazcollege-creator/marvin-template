'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchInbox, fetchCalendar, fetchDrive, fetchSlack, fetchTrello, fetchBuffer } from '@/lib/marvin-data';

/**
 * Live embedded preview of a connected integration — pulls real data from the
 * sidecar and shows a compact summary + a few rows. Auto-refreshes on an interval,
 * when the tab regains focus, and on demand (refresh button). Honest states:
 * runtime offline, not connected, empty, live.
 */

const REFRESH_MS = 20_000;

type Live = { connected: boolean; summary: string; rows: string[] } | null;

async function loadLive(id: string): Promise<Live | 'offline'> {
  switch (id) {
    case 'gmail': {
      const d = await fetchInbox();
      if (!d) return 'offline';
      return { connected: d.connected, summary: `${d.messages.length} unread`, rows: d.messages.slice(0, 3).map((m) => `${m.subject || '(no subject)'} — ${m.account}`) };
    }
    case 'gcal': {
      const d = await fetchCalendar();
      if (!d) return 'offline';
      return { connected: d.connected, summary: `${d.events.length} today`, rows: d.events.slice(0, 3).map((e) => e.title) };
    }
    case 'drive': {
      const d = await fetchDrive();
      if (!d) return 'offline';
      return { connected: d.connected, summary: `${d.files.length} files`, rows: d.files.slice(0, 3).map((f) => f.name) };
    }
    case 'slack': {
      const d = await fetchSlack();
      if (!d) return 'offline';
      return { connected: d.connected, summary: `${d.messages.length} recent`, rows: d.messages.slice(0, 3).map((m) => `#${m.channel}: ${m.text}`) };
    }
    case 'trello': {
      const d = await fetchTrello();
      if (!d) return 'offline';
      return { connected: d.connected, summary: `${d.cards.length} cards`, rows: d.cards.slice(0, 3).map((c) => c.name) };
    }
    case 'buffer': {
      const d = await fetchBuffer();
      if (!d) return 'offline';
      return { connected: d.connected, summary: `${d.drafts} drafts · ${d.scheduled} scheduled`, rows: d.byPlatform.slice(0, 3).map((p) => `${p.platform}: ${p.count}`) };
    }
    default:
      return null;
  }
}

export function LivePreview({ id }: { id: string }) {
  const [state, setState] = useState<'loading' | 'offline' | 'ready' | 'none'>('loading');
  const [live, setLive] = useState<Live>(null);
  const [busy, setBusy] = useState(false);
  const aliveRef = useRef(true);
  const reqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++reqRef.current;
    setBusy(true);
    const r = await loadLive(id);
    if (!aliveRef.current || seq !== reqRef.current) return; // ignore stale/unmounted
    if (r === 'offline') setState('offline');
    else if (r === null) setState('none');
    else {
      setLive(r);
      setState('ready');
    }
    setBusy(false);
  }, [id]);

  useEffect(() => {
    aliveRef.current = true;
    void load();
    if (id === 'notion' || id === 'github' || id === 'linear' || id === 'hubspot' || id === 'zoom' || id === 'whatsapp') {
      return () => {
        aliveRef.current = false;
      };
    }
    const interval = window.setInterval(() => void load(), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      aliveRef.current = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [id, load]);

  const box = 'rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[11.5px]';

  if (state === 'loading') return <div className={`${box} text-muted`}><span className="inline-block h-3 w-24 animate-pulse rounded bg-border align-middle" /></div>;
  if (state === 'none') return <div className={`${box} text-muted`}>No live preview yet — connected for actions.</div>;
  if (state === 'offline') return <div className={`${box} text-muted`}>Runtime offline — start it with <code className="text-text-2">npm run dev:all</code>.</div>;
  if (live && !live.connected) return <div className={`${box} text-muted`}>Add credentials above to see live data here.</div>;

  return (
    <div className={box}>
      <div className="mb-1 flex items-center gap-1.5 font-semibold text-text">
        <span className="h-1.5 w-1.5 rounded-full bg-green" />
        Live · {live?.summary}
        <button
          type="button"
          onClick={() => void load()}
          aria-label="Refresh"
          className={`ml-auto text-muted transition hover:text-accent ${busy ? 'animate-spin' : ''}`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" /></svg>
        </button>
      </div>
      {live && live.rows.length > 0 ? (
        <ul className="space-y-0.5 text-text-2">
          {live.rows.map((r, i) => (
            <li key={i} className="truncate">{r}</li>
          ))}
        </ul>
      ) : (
        <span className="text-text-2">Nothing to show right now.</span>
      )}
    </div>
  );
}
