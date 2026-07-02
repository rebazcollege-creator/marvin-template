'use client';

import type { ReactNode } from 'react';

/**
 * SourceBadge — a small, recognizable platform logo (Slack / Gmail / Trello / Calendar /
 * Buffer / captured) so the eye can tell WHERE something came from at a glance. ADHD-
 * friendly: a colour + shape lands instantly; a line of tiny grey text does not.
 */

type Brand = { bg: string; fg: string; glyph: ReactNode; name: string };

const G = (d: ReactNode) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);

const BRAND: Record<string, Brand> = {
  email: { bg: '#EA4335', fg: '#fff', name: 'Gmail', glyph: G(<><path d="M3 6h18v12H3z" /><path d="m3 7 9 6 9-6" /></>) },
  gmail: { bg: '#EA4335', fg: '#fff', name: 'Gmail', glyph: G(<><path d="M3 6h18v12H3z" /><path d="m3 7 9 6 9-6" /></>) },
  slack: { bg: '#4A154B', fg: '#fff', name: 'Slack', glyph: G(<><path d="M9 4v9a2 2 0 1 1-2-2h9a2 2 0 1 1-2 2V4a2 2 0 1 1 2 2H7a2 2 0 1 1 2-2z" /></>) },
  trello: { bg: '#0079BF', fg: '#fff', name: 'Trello', glyph: G(<><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="7" y="7" width="3.5" height="9" /><rect x="13.5" y="7" width="3.5" height="5" /></>) },
  calendar: { bg: '#4285F4', fg: '#fff', name: 'Calendar', glyph: G(<><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></>) },
  buffer: { bg: '#2C4BFF', fg: '#fff', name: 'Buffer', glyph: G(<><path d="M12 3 21 8l-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>) },
  manual: { bg: 'var(--accent)', fg: 'var(--on-accent)', name: 'Captured', glyph: G(<><path d="M12 3v18M3 12h18" /></>) },
  urgent: { bg: '#C0392B', fg: '#fff', name: 'Urgent', glyph: G(<><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17h.01" /></>) },
};

export function SourceBadge({
  source,
  label,
  urgent,
}: {
  source: string;
  label?: string;
  urgent?: boolean;
}) {
  const b = BRAND[urgent ? 'urgent' : source] ?? BRAND.manual!;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="grid h-[22px] w-[22px] place-items-center rounded-[7px] shadow-sm"
        style={{ background: b.bg, color: b.fg }}
        aria-label={b.name}
        title={b.name}
      >
        {b.glyph}
      </span>
      <span className="text-[12.5px] font-semibold text-text-2">{label ?? b.name}</span>
    </span>
  );
}
