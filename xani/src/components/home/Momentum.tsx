'use client';

import { useCallback, useEffect, useState } from 'react';
import { recentDays, streakDays, todayWins, type Win } from '@/lib/momentum';

/**
 * Momentum (P1.1) — small, real wins made visible to feed the ADHD reward loop, with a
 * streak that survives an off day. Never punishes a gap; celebrates showing up. Renders
 * only once there's something to celebrate, so it's never an empty guilt-box.
 */

export function Momentum({ tz, now }: { tz: string; now: Date }) {
  const [days, setDays] = useState<{ key: string; label: string; win: boolean }[]>([]);
  const [streak, setStreak] = useState(0);
  const [wins, setWins] = useState<Win[]>([]);

  const refresh = useCallback(() => {
    setDays(recentDays(tz, now));
    setStreak(streakDays(tz, now));
    setWins(todayWins(tz, now));
  }, [tz, now]);

  useEffect(() => {
    refresh();
    window.addEventListener('xani:momentum-changed', refresh);
    window.addEventListener('xani:loops-changed', refresh);
    return () => {
      window.removeEventListener('xani:momentum-changed', refresh);
      window.removeEventListener('xani:loops-changed', refresh);
    };
  }, [refresh]);

  if (wins.length === 0 && streak === 0) return null; // nothing to celebrate yet — stay silent

  return (
    <section className="mt-10">
      <div className="mb-4 px-1">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted">Momentum</h2>
      </div>
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex gap-1.5">
          {days.map((d) => (
            <div
              key={d.key}
              className={`grid h-8 flex-1 place-items-center rounded-lg text-[11px] font-semibold ${
                d.win ? 'bg-[color-mix(in_srgb,var(--accent)_16%,var(--surface))] text-accent' : 'bg-surface-2 text-muted'
              }`}
              title={d.key}
            >
              {d.label}
            </div>
          ))}
        </div>

        {wins.length > 0 && (
          <div className="mt-4 space-y-2">
            {wins.slice(0, 5).map((w) => (
              <div key={w.id} className="flex items-center gap-2.5 text-[13px] text-text-2">
                <span className="grid h-4 w-4 flex-none place-items-center rounded-[5px] bg-accent text-[10px] text-on-accent">✓</span>
                <span className="truncate">{w.label}</span>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-[12.5px] text-accent">
          {streak > 1
            ? `🔥 ${streak}-day streak. An off day won’t break it — just come back.`
            : wins.length > 0
              ? '🌱 You showed up today. That counts.'
              : 'Every small thing you close builds the streak.'}
        </p>
      </div>
    </section>
  );
}
