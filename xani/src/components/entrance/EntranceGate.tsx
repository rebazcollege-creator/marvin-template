'use client';

import { useState } from 'react';
import { EntranceJourney } from './EntranceJourney';

/**
 * Plays the entrance journey over the app on every full load / refresh, then reveals it.
 * The app (children) mounts UNDERNEATH from the first paint, so its data fetches run during
 * the journey and Home is already warm when the overlay dissolves — the wait becomes the
 * experience. Route changes within the app don't replay it (the gate lives in the layout, so
 * `done` persists); only a real page load/refresh remounts and replays it.
 *
 * `?nointro` in the URL skips it (handy while developing).
 */
export function EntranceGate({ children }: { children: React.ReactNode }) {
  const [done, setDone] = useState(false);
  const [play] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !new URLSearchParams(window.location.search).has('nointro');
  });

  return (
    <>
      {children}
      {play && !done && <EntranceJourney onDone={() => setDone(true)} />}
    </>
  );
}
