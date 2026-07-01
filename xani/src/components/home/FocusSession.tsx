'use client';

import { useEffect, useRef, useState } from 'react';
import { logActivity } from '@/lib/activity';
import { recordWin } from '@/lib/momentum';
import { setFocusActive } from '@/lib/nudge-policy';

/**
 * Focus Session — the body-double for task initiation (foundations.md §2, §9).
 *
 * The ADHD "wall of awful" is about starting, not doing. This is a calm, single-
 * task companion: one thing, a timer, notifications held, MARVIN present. Warm and
 * no-guilt — ending early is fine, and finishing feels good. Pure client, no deps.
 */

const PRESETS = [25, 15, 45, 5] as const;

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function FocusSession({
  task,
  onComplete,
  onClose,
}: {
  task: string;
  onComplete?: () => void;
  onClose: () => void;
}) {
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [minutes, setMinutes] = useState<number>(25);
  const [left, setLeft] = useState<number>(25 * 60);
  const [running, setRunning] = useState<boolean>(false);
  const [done, setDone] = useState<boolean>(false);
  const startedAt = useRef<number | null>(null);

  // countdown
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          window.clearInterval(id);
          setRunning(false);
          setDone(true);
          logActivity({ kind: 'note', title: 'Focus session complete', detail: task.slice(0, 80) });
          recordWin(`Focused: ${task.slice(0, 80)}`, 'focus');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, task]);

  // esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Silence nudges while a focus session is open — never break deep work.
  useEffect(() => {
    setFocusActive(true);
    return () => setFocusActive(false);
  }, []);

  const total = minutes * 60;
  const progress = total > 0 ? 1 - left / total : 0;

  const start = () => {
    if (!startedAt.current) startedAt.current = Date.now();
    setRunning(true);
  };
  const pickPreset = (m: number) => {
    setMinutes(m);
    setLeft(m * 60);
    setDone(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur-md">
      {/* the ring */}
      {!done ? (
        <>
          <div
            className="grid h-52 w-52 place-items-center rounded-full"
            style={{ background: `conic-gradient(var(--accent) ${progress * 360}deg, var(--border-2) 0deg)` }}
          >
            <div className="grid h-[188px] w-[188px] place-items-center rounded-full bg-surface">
              <div className="text-center">
                <div className="font-mono text-[46px] font-medium tracking-tight text-text">{fmt(left)}</div>
                <div className="mt-1 text-[12px] font-medium uppercase tracking-[0.14em] text-muted">
                  {running ? 'focusing' : 'ready'}
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-md px-6 text-center">
            <p className="font-display text-[22px] font-semibold leading-snug text-text">{task}</p>
            <p className="mt-2 text-[14px] text-text-2">
              {running
                ? 'Go do the thing — I’ll keep time here. Come back when it rings. Just this one.'
                : 'One thing, one timer. Starting is the whole win.'}
            </p>
          </div>

          {/* presets (only before running) */}
          {!running && (
            <div className="flex gap-2">
              {PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => pickPreset(m)}
                  className={`rounded-xl border px-3.5 py-2 text-[13px] font-semibold transition ${
                    minutes === m
                      ? 'border-transparent bg-accent text-on-accent'
                      : 'border-border-2 bg-surface text-text-2 hover:bg-hover'
                  }`}
                >
                  {m} min
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            {!running ? (
              <button type="button" onClick={start} className="rounded-2xl bg-accent px-8 py-3.5 text-[15px] font-semibold text-on-accent shadow-sm transition hover:bg-accent-dim">
                Focus with me
              </button>
            ) : (
              <button type="button" onClick={() => setRunning(false)} className="rounded-2xl border border-border-2 bg-surface px-6 py-3.5 text-[15px] font-semibold text-text-2 transition hover:bg-hover">
                Pause
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-2xl px-5 py-3.5 text-[14px] font-medium text-muted transition hover:text-text-2">
              Leave
            </button>
          </div>
          {!reduce && running && (
            <div className="pointer-events-none absolute inset-0 -z-10" style={{ background: 'radial-gradient(600px 400px at 50% 40%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 70%)' }} />
          )}
        </>
      ) : (
        // gentle completion — no guilt whether it was 5 min or 45
        <div className="max-w-md px-6 text-center">
          <div className="text-[48px]">🌿</div>
          <p className="mt-3 font-display text-[26px] font-semibold text-text">That’s a real win.</p>
          <p className="mt-2 text-[14.5px] text-text-2">You showed up and did the hard part — starting. Whatever you got done counts.</p>
          <div className="mt-6 flex items-center justify-center gap-3">
            {onComplete && (
              <button type="button" onClick={() => { onComplete(); onClose(); }} className="rounded-2xl bg-accent px-6 py-3 text-[14px] font-semibold text-on-accent transition hover:bg-accent-dim">
                Mark it done
              </button>
            )}
            <button type="button" onClick={() => pickPreset(minutes)} className="rounded-2xl border border-border-2 bg-surface px-5 py-3 text-[14px] font-semibold text-text-2 transition hover:bg-hover">
              Another round
            </button>
            <button type="button" onClick={onClose} className="rounded-2xl px-4 py-3 text-[13.5px] font-medium text-muted transition hover:text-text-2">
              Done for now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
