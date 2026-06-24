'use client';

import { useEffect, useState } from 'react';
import { peekData } from '@/lib/marvin-data';

/**
 * Stale-while-revalidate hook for sidecar data. Seeds from the in-memory cache so a
 * revisited screen paints last-known data instantly, then revalidates in the
 * background. Keeps showing cached data if the runtime goes briefly offline.
 *
 *   const { data, state } = useLiveData(PATHS.inbox, fetchInbox);
 *
 * Pass a STABLE fetcher (the module-level fetch* functions are stable).
 */
export type LiveDataState = 'loading' | 'loaded' | 'offline';

export function useLiveData<T>(path: string, fetcher: () => Promise<T | null>) {
  const [data, setData] = useState<T | null>(() => peekData<T>(path));
  const [state, setState] = useState<LiveDataState>(() => (peekData<T>(path) ? 'loaded' : 'loading'));

  useEffect(() => {
    let alive = true;
    fetcher().then((d) => {
      if (!alive) return;
      if (d) {
        setData(d);
        setState('loaded');
      } else {
        // transient failure: keep cached data if we have it, else show offline
        setState((s) => (s === 'loaded' ? 'loaded' : 'offline'));
      }
    });
    return () => {
      alive = false;
    };
  }, [path, fetcher]);

  return { data, state, setData };
}
