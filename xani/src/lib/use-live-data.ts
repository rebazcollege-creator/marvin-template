'use client';

import { useCallback, useEffect, useState } from 'react';
import { invalidate, peekData } from '@/lib/marvin-data';

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
  // Start null/loading on BOTH server and client — reading the cache (localStorage) during the
  // initial render makes the client's first paint differ from the server's and throws a hydration
  // mismatch. The cache is seeded in the effect below, which runs immediately after hydration.
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<LiveDataState>('loading');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let alive = true;
    const cached = peekData<T>(path); // instant paint from last-known data, post-hydration
    if (cached) { setData(cached); setState('loaded'); }
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

  // Auto-refresh: when the tab regains focus/visibility, silently revalidate so the
  // view is current when you look at it (throttled so quick tab-switches don't hammer).
  useEffect(() => {
    let last = Date.now();
    let alive = true;
    const revalidate = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - last < 15_000) return;
      last = now;
      invalidate(path);
      fetcher().then((d) => {
        if (!alive || !d) return;
        setData(d);
        setState('loaded');
      });
    };
    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', revalidate);
    return () => {
      alive = false;
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', revalidate);
    };
  }, [path, fetcher]);

  /** Manual refresh: bust the cache for this path and re-fetch, keeping current data on screen. */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    invalidate(path);
    const d = await fetcher();
    if (d) {
      setData(d);
      setState('loaded');
    } else {
      setState((s) => (s === 'loaded' ? 'loaded' : 'offline'));
    }
    setRefreshing(false);
  }, [path, fetcher]);

  return { data, state, setData, refresh, refreshing };
}
