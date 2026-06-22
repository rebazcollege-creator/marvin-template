'use client';

import { useEffect, useState } from 'react';

/**
 * Generic data-view shell for the integration screens. Fetches from the sidecar
 * on mount and renders one of four honest states: loading, sidecar offline,
 * integration not connected, connected-but-empty, or the rows. No mock data.
 *
 * These are functional (plain) views — the visual design is yours to restyle;
 * they bind to the data shapes in marvin-protocol.ts.
 */
export function DataView<T extends { connected: boolean }>(props: {
  title: string;
  subtitle?: string;
  fetcher: () => Promise<T | null>;
  isEmpty: (data: T) => boolean;
  render: (data: T) => React.ReactNode;
  notConnectedNote: string;
  emptyNote: string;
}) {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<'loading' | 'loaded' | 'offline'>('loading');

  useEffect(() => {
    props.fetcher().then((d) => {
      if (d === null) setState('offline');
      else {
        setData(d);
        setState('loaded');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const badge =
    state === 'loading'
      ? 'Loading…'
      : state === 'offline'
        ? 'Sidecar offline'
        : data?.connected
          ? 'Connected'
          : 'Not connected';

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-3xl text-ink">{props.title}</h1>
          {props.subtitle ? <p className="mt-1 text-sm text-ink-soft">{props.subtitle}</p> : null}
        </div>
        <span className="text-xs text-ink-soft">{badge}</span>
      </div>

      <div className="mt-8">
        {state === 'loading' && <div className="h-24 animate-pulse rounded-2xl bg-line/60" />}

        {state === 'offline' && (
          <div className="rounded-2xl border border-dashed border-line bg-paper-card p-8 text-sm text-ink-soft">
            MARVIN&apos;s runtime isn&apos;t reachable. Start it with{' '}
            <code className="rounded bg-paper px-1">npm run sidecar</code>.
          </div>
        )}

        {state === 'loaded' && data && !data.connected && (
          <div className="rounded-2xl border border-dashed border-line bg-paper-card p-8 text-sm text-ink-soft">
            {props.notConnectedNote}
          </div>
        )}

        {state === 'loaded' && data && data.connected && props.isEmpty(data) && (
          <div className="rounded-2xl border border-dashed border-line bg-paper-card p-8 text-sm text-ink-soft">
            {props.emptyNote}
          </div>
        )}

        {state === 'loaded' && data && data.connected && !props.isEmpty(data) && (
          <ul className="space-y-3">{props.render(data)}</ul>
        )}
      </div>
    </div>
  );
}
