'use client';

import { useEffect, useState } from 'react';
import { fetchInbox, fetchCalendar, fetchDrive, fetchSlack, fetchTrello, fetchBuffer } from '@/lib/marvin-data';

/**
 * Live embedded preview of a connected integration — pulls real data from the
 * sidecar and shows a compact summary + a few rows, right in the Connections card.
 * Honest states: runtime offline, not connected (credentials missing), empty, data.
 * Integrations without a data endpoint yet show a quiet "no live preview" note.
 */

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

  useEffect(() => {
    let alive = true;
    loadLive(id).then((r) => {
      if (!alive) return;
      if (r === 'offline') setState('offline');
      else if (r === null) setState('none');
      else {
        setLive(r);
        setState('ready');
      }
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const box = 'rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[11.5px]';

  if (state === 'loading') return <div className={`${box} text-muted`}><span className="inline-block h-3 w-24 animate-pulse rounded bg-border align-middle" /></div>;
  if (state === 'none') return <div className={`${box} text-muted`}>No live preview yet — connected for actions.</div>;
  if (state === 'offline') return <div className={`${box} text-muted`}>Runtime offline — start it with <code className="text-text-2">npm run dev:all</code>.</div>;
  if (live && !live.connected) return <div className={`${box} text-muted`}>Add credentials above to see live data here.</div>;
  if (live && live.rows.length === 0) return <div className={`${box} text-text-2`}><span className="font-semibold text-text">{live.summary}</span> · nothing to show.</div>;

  return (
    <div className={box}>
      <div className="mb-1 flex items-center gap-1.5 font-semibold text-text">
        <span className="h-1.5 w-1.5 rounded-full bg-green" />
        Live · {live?.summary}
      </div>
      <ul className="space-y-0.5 text-text-2">
        {live?.rows.map((r, i) => (
          <li key={i} className="truncate">{r}</li>
        ))}
      </ul>
    </div>
  );
}
