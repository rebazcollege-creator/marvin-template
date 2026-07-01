'use client';

import { useState } from 'react';
import { breakdownTask, type TaskStep } from '@/lib/marvin-client';
import { setLoopBreakdown, toggleLoopStep } from '@/lib/open-loops';
import { estLabel } from '@/lib/tone';

/**
 * Break it down (ADHD design report §4, P0.2) — the "Magic ToDo" pattern. Turns a wall
 * of a task into tiny, concrete steps with time estimates and an adjustable granularity
 * ("spiciness") dial. Only the FIRST step is emphasised — that's the one that beats
 * task-initiation paralysis. Steps persist onto the loop; ticking one is a real win.
 */

const SPICE = [1, 2, 3, 4, 5] as const;

export function BreakItDown({
  task,
  loopId,
  initialSteps,
  onStartFirst,
}: {
  task: string;
  loopId?: string;
  initialSteps?: { step: string; estMins: number; done?: boolean }[];
  onStartFirst?: (stepText: string) => void;
}) {
  const [level, setLevel] = useState(2);
  const [steps, setSteps] = useState<{ step: string; estMins: number; done?: boolean }[]>(initialSteps ?? []);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (lvl: number) => {
    setLoading(true);
    setErr(null);
    const r = await breakdownTask(task, lvl);
    setLoading(false);
    if (!r.ok || !r.steps?.length) { setErr(r.error ?? 'Could not break that down.'); return; }
    const next = r.steps.map((s: TaskStep) => ({ ...s, done: false }));
    setSteps(next);
    if (loopId) setLoopBreakdown(loopId, next);
  };

  const toggle = (i: number) => {
    setSteps((cur) => cur.map((s, idx) => (idx === i ? { ...s, done: !s.done } : s)));
    if (loopId) toggleLoopStep(loopId, i);
  };

  const total = steps.reduce((a, s) => a + s.estMins, 0);
  const firstOpen = steps.findIndex((s) => !s.done);

  if (steps.length === 0) {
    return (
      <div className="mt-3">
        <button
          type="button"
          onClick={() => void run(level)}
          disabled={loading}
          className="rounded-xl border border-border-2 bg-surface-2 px-4 py-2.5 text-[13px] font-semibold text-text-2 transition hover:bg-hover disabled:opacity-60"
        >
          {loading ? 'Breaking it down…' : '🧩 Break it down'}
        </button>
        {err && <p className="mt-2 text-[12.5px] text-muted">{err}</p>}
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface-2 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
          First steps {total > 0 && <span className="ml-1 font-medium normal-case tracking-normal text-text-2">· {estLabel(total)} total</span>}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          tinier
          <span className="flex gap-1">
            {SPICE.map((n) => (
              <button
                key={n}
                type="button"
                title={`Granularity ${n}/5`}
                onClick={() => { setLevel(n); void run(n); }}
                className={`h-4 w-4 rounded-[5px] border transition ${
                  n <= level ? 'border-transparent bg-amber' : 'border-border-2 bg-surface'
                }`}
              />
            ))}
          </span>
          finer
        </span>
      </div>

      {steps.map((s, i) => {
        const isNext = i === firstOpen;
        return (
          <div
            key={i}
            className={`mt-2 flex items-center gap-2.5 rounded-[10px] border px-3 py-2 ${
              isNext ? 'border-accent/40 bg-[color-mix(in_srgb,var(--accent)_6%,var(--surface))]' : 'border-border bg-surface'
            }`}
          >
            <button
              type="button"
              onClick={() => toggle(i)}
              aria-label={s.done ? 'mark not done' : 'mark done'}
              className={`grid h-[19px] w-[19px] flex-none place-items-center rounded-[6px] border text-[11px] ${
                s.done ? 'border-accent bg-accent text-on-accent' : 'border-border-2 bg-surface text-transparent'
              }`}
            >
              ✓
            </button>
            <span className={`flex-1 text-[13.5px] ${s.done ? 'text-muted line-through' : isNext ? 'font-semibold text-text' : 'text-text-2'}`}>
              {s.step}
            </span>
            <span className="flex-none rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">{estLabel(s.estMins)}</span>
          </div>
        );
      })}

      {firstOpen >= 0 && onStartFirst && (
        <button
          type="button"
          onClick={() => onStartFirst(steps[firstOpen].step)}
          className="mt-3 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim"
        >
          ▶ Do the first one with me
        </button>
      )}
      {firstOpen < 0 && (
        <p className="mt-3 text-[12.5px] font-semibold text-accent">All steps done — that’s the whole thing. 🎉</p>
      )}
    </div>
  );
}
