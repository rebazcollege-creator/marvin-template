'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getSettings, isDayOff, weekdayInTimezone, type XaniSettings } from '@/lib/settings';
import { ensureStorageReady } from '@/lib/storage';
import { fetchBriefingData } from '@/lib/marvin-data';
import type { BriefingData } from '@/lib/marvin-protocol';

/**
 * Morning briefing card.
 *
 * Editorial, not exhaustive: grouped by what needs action, scannable at a
 * glance. Counts come live from the sidecar (which owns the integration tokens)
 * when connected; otherwise each row shows an honest em-dash — never a fake
 * number. Skips entirely on the user's configured days off.
 */

type RowKey = 'calendar' | 'inbox' | 'slack' | 'trello' | 'buffer';
type Row = { label: string; href: string; key: RowKey };

const GROUPS: { heading: string; rows: Row[] }[] = [
  { heading: 'Locked today', rows: [{ label: 'Calendar events', href: '/calendar', key: 'calendar' }] },
  {
    heading: 'Needs a response',
    rows: [
      { label: 'Emails across accounts', href: '/inbox', key: 'inbox' },
      { label: 'Slack mentions', href: '/slack', key: 'slack' },
    ],
  },
  {
    heading: 'In motion',
    rows: [
      { label: 'Trello cards awaiting action', href: '/trello', key: 'trello' },
      { label: 'Buffer drafts / scheduled', href: '/buffer', key: 'buffer' },
    ],
  },
];

function rowValue(key: RowKey, data: BriefingData | null): string {
  if (!data) return '—';
  switch (key) {
    case 'calendar':
      return data.connected.calendar ? String(data.calendar.length) : '—';
    case 'inbox':
      return data.connected.gmail
        ? String(data.gmail.reduce((sum, a) => sum + a.unread, 0))
        : '—';
    case 'slack':
      return data.connected.slack ? String(data.slack.length) : '—';
    case 'trello':
      return data.connected.trello ? String(data.trello.length) : '—';
    case 'buffer':
      return data.buffer ? `${data.buffer.drafts} / ${data.buffer.scheduled}` : '—';
  }
}

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

export function BriefingCard() {
  const [settings, setSettings] = useState<XaniSettings | null>(null);
  const [data, setData] = useState<BriefingData | null>(null);
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    ensureStorageReady().then(() => setSettings(getSettings()));
    fetchBriefingData().then(setData);
  }, []);

  if (!settings) {
    return (
      <section className="rounded-2xl border border-line bg-paper-card p-8 shadow-sm">
        <div className="h-8 w-56 animate-pulse rounded bg-line" />
      </section>
    );
  }

  const tz = settings.profile.timezone;
  const dayOff = isDayOff(now, settings);
  const hour = weekdayInTimezone(now, tz) >= 0 ? hourInTimezone(now, tz) : now.getHours();

  return (
    <section className="rounded-2xl border border-line bg-paper-card p-8 shadow-sm">
      <header className="flex items-baseline justify-between">
        <h1 className="text-3xl text-ink">
          {greeting(hour)}, {settings.profile.name}.
        </h1>
        <span className="text-sm text-ink-soft">{todayLabel(now, tz)}</span>
      </header>

      {dayOff ? (
        <p className="mt-8 text-ink-soft">
          Day off. MARVIN is quiet today — no briefing, no alerts.
        </p>
      ) : (
        <>
          <div className="mt-8 space-y-6">
            {GROUPS.map((group) => (
              <div key={group.heading}>
                <p className="text-xs font-medium uppercase tracking-wide text-ink-soft">
                  {group.heading}
                </p>
                <ul className="mt-1 divide-y divide-line">
                  {group.rows.map((row) => (
                    <li key={row.href}>
                      <Link
                        href={row.href}
                        className="flex items-center justify-between py-2.5 text-sm transition-colors hover:text-terracotta"
                      >
                        <span className="text-ink-soft">{row.label}</span>
                        <span className="tabular-nums text-ink">{rowValue(row.key, data)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="mt-6 border-t border-line pt-5 text-sm text-ink-soft">
            <span className="font-medium text-terracotta">MARVIN:</span>{' '}
            {data
              ? 'Counts are live where an integration is connected; an em-dash means that source needs credentials.'
              : "Start the sidecar (npm run sidecar) to populate live counts — until then this is the briefing shell."}
          </p>
        </>
      )}
    </section>
  );
}
