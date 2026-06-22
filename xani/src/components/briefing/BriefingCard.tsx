'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getSettings, isDayOff, weekdayInTimezone, type XaniSettings } from '@/lib/settings';

/**
 * Morning briefing card.
 *
 * The research consensus: a briefing must be EDITORIAL, not exhaustive —
 * scannable in under ~90 seconds, grouped by what the user must act on. On load
 * the homepage will pre-fetch all sources in parallel and hand a combined
 * payload to MARVIN for synthesis; until connectors are wired this is the
 * empty-state shell, grouped the way the live briefing will be.
 *
 * Rules: never fake content (empty states only); skip entirely on days off;
 * day-off list, timezone and greeting all come from user settings.
 */

const GROUPS: { heading: string; rows: { label: string; href: string }[] }[] = [
  {
    heading: 'Locked today',
    rows: [{ label: 'Calendar events', href: '/calendar' }],
  },
  {
    heading: 'Needs a response',
    rows: [
      { label: 'Emails across accounts', href: '/inbox' },
      { label: 'Slack mentions', href: '/slack' },
    ],
  },
  {
    heading: 'In motion',
    rows: [
      { label: 'Trello cards awaiting action', href: '/trello' },
      { label: 'Buffer drafts / scheduled', href: '/buffer' },
    ],
  },
];

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function hourInTimezone(date: Date, timezone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(date),
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
  // Fix "now" once on mount so the greeting/date don't recompute each render.
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    setSettings(getSettings());
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
  const hour =
    weekdayInTimezone(now, tz) >= 0 ? hourInTimezone(now, tz) : now.getHours();

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
                        <span className="text-ink-soft">—</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="mt-6 border-t border-line pt-5 text-sm text-ink-soft">
            <span className="font-medium text-terracotta">MARVIN:</span>{' '}
            Connectors not yet wired — once Gmail, Trello, Buffer, Slack and
            Calendar are authorised, the one thing most worth your attention
            appears here.
          </p>
        </>
      )}
    </section>
  );
}
