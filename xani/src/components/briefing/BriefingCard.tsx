'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSettings, isDayOff, type XaniSettings } from '@/lib/settings';

/**
 * Morning briefing card.
 *
 * Per the build brief: on load the homepage pre-fetches all data sources in
 * parallel and passes a combined payload to MARVIN for synthesis. Until those
 * connectors are wired (Phase 4+), this renders the empty-state shell only.
 *
 * Rules honoured here:
 *  - Never show fake content — empty states only.
 *  - Skip the briefing entirely on the user's configured days off.
 *  - Day off list and timezone come from user settings, not hardcoded values.
 */

const ROWS = [
  { label: 'Emails across accounts', href: '/inbox' },
  { label: 'Trello cards awaiting action', href: '/trello' },
  { label: 'Buffer drafts / scheduled', href: '/buffer' },
  { label: 'Slack mentions', href: '/slack' },
  { label: 'Calendar events today', href: '/calendar' },
];

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

  // Settings live in localStorage; read on mount to avoid SSR/client mismatch.
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

  const now = new Date();
  const dayOff = isDayOff(now, settings);

  return (
    <section className="rounded-2xl border border-line bg-paper-card p-8 shadow-sm">
      <header className="flex items-baseline justify-between">
        <h1 className="text-3xl text-ink">Good morning, {settings.profile.name}.</h1>
        <span className="text-sm text-ink-soft">
          {todayLabel(now, settings.profile.timezone)}
        </span>
      </header>

      {dayOff ? (
        <p className="mt-8 text-ink-soft">
          Day off. MARVIN is quiet today — no briefing, no alerts.
        </p>
      ) : (
        <>
          <ul className="mt-8 divide-y divide-line">
            {ROWS.map((row) => (
              <li key={row.href}>
                <Link
                  href={row.href}
                  className="flex items-center justify-between py-3 text-sm transition-colors hover:text-terracotta"
                >
                  <span className="text-ink-soft">{row.label}</span>
                  <span className="text-ink-soft">—</span>
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-6 border-t border-line pt-5 text-sm text-ink-soft">
            <span className="font-medium text-terracotta">MARVIN:</span>{' '}
            Connectors not yet wired — once Gmail, Trello, Buffer, Slack and
            Calendar are authorised, your most urgent item appears here.
          </p>
        </>
      )}
    </section>
  );
}
