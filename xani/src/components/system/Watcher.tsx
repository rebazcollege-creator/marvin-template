'use client';

import { useEffect, useState } from 'react';
import { ensureStorageReady } from '@/lib/storage';
import { runWatch } from '@/lib/watcher';
import { canOfferNotify, requestNotifyPermission, setNotifyPref } from '@/lib/notify';

/**
 * Mounted once (in the root layout). One job now:
 *  - Poll Slack + inbox in the background and fire OS notifications for new important
 *    items — so Xanî pings you instead of you checking the apps.
 * Renders only a one-time "turn on notifications" prompt, otherwise nothing.
 *
 * (The old live "(N) Xanî" tab-title counter was removed: ADHD Rule 4 forbids a running
 * count staring at you on open, and it's invisible in the desktop window anyway.)
 */
export function Watcher() {
  const [offer, setOffer] = useState(false);

  // Background poll: seed on mount, then every 60s and whenever the window regains focus.
  useEffect(() => {
    ensureStorageReady().then(() => { void runWatch(); });
    const tick = () => { if (document.visibilityState !== 'hidden') void runWatch(); };
    const iv = window.setInterval(tick, 60_000);
    window.addEventListener('focus', tick);
    return () => { window.clearInterval(iv); window.removeEventListener('focus', tick); };
  }, []);

  // Offer to enable notifications once (only if we've never asked).
  useEffect(() => {
    ensureStorageReady().then(() => setOffer(canOfferNotify()));
  }, []);

  if (!offer) return null;
  return (
    <div className="fixed bottom-5 left-1/2 z-[95] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-lg">
      <span className="text-[13.5px] text-text">🔔 Get pinged when something needs you — so you don’t have to check.</span>
      <button
        type="button"
        onClick={async () => { await requestNotifyPermission(); setOffer(false); }}
        className="rounded-xl bg-accent px-3.5 py-1.5 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim"
      >
        Enable
      </button>
      <button
        type="button"
        onClick={() => { setNotifyPref(false); setOffer(false); }}
        className="rounded-xl px-2.5 py-1.5 text-[13px] font-medium text-muted transition hover:text-text-2"
      >
        Not now
      </button>
    </div>
  );
}
