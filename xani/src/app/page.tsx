'use client';

import { useEffect, useMemo, useState } from 'react';
import { Orb } from '@/components/home/Orb';
import { MarvinChat } from '@/components/marvin/MarvinChat';
import { BriefingCard } from '@/components/briefing/BriefingCard';
import { getSettings, isDayOff, weekdayInTimezone, type XaniSettings } from '@/lib/settings';
import { ensureStorageReady } from '@/lib/storage';

/**
 * Calm home — the voice orb + ask bar, exactly as in the design. The greeting,
 * timezone and day-off logic are reused from settings; the morning brief (live
 * counts via the sidecar) tucks underneath so nothing from the old home is lost.
 */

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function hourInTimezone(date: Date, timezone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(date),
  );
}

function todayLabel(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export default function HomePage() {
  const [settings, setSettings] = useState<XaniSettings | null>(null);
  const [showBrief, setShowBrief] = useState(false);
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    ensureStorageReady().then(() => setSettings(getSettings()));
  }, []);

  const tz = settings?.profile.timezone ?? 'UTC';
  const name = settings?.profile.name ?? '';
  const dayOff = settings ? isDayOff(now, settings) : false;
  const hour =
    settings && weekdayInTimezone(now, tz) >= 0 ? hourInTimezone(now, tz) : now.getHours();

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center px-6 py-10">
      <div className="flex w-full flex-col items-center text-center">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-text">
          {greeting(hour)}
          {name ? `, ${name}` : ''}.
        </h1>
        <p className="mt-1.5 text-[13px] text-muted">{todayLabel(now, tz)}</p>

        <Orb onClick={() => window.dispatchEvent(new CustomEvent('xani:ask-focus'))} />

        <p className="-mt-1 flex items-center gap-2 text-[13px] text-muted">
          <span
            className="h-[7px] w-[7px] rounded-full bg-[#E89A86]"
            style={{ animation: 'orbCap 2s ease-in-out infinite' }}
          />
          {dayOff ? 'Day off — MARVIN is resting' : 'Ready when you are'}
        </p>
      </div>

      <div className="mt-7 w-full max-w-[600px]">
        <MarvinChat />
      </div>

      {!dayOff && (
        <div className="mt-10 w-full max-w-[600px]">
          <button
            type="button"
            onClick={() => setShowBrief((v) => !v)}
            className="mx-auto block text-xs text-text-2 underline-offset-2 hover:text-accent hover:underline"
          >
            {showBrief ? 'Hide your morning brief' : 'Show your morning brief'}
          </button>
          {showBrief && (
            <div className="mt-3">
              <BriefingCard hideHeader />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
