'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ensureStorageReady } from '@/lib/storage';
import { addRoutine, listRoutines, removeRoutine, type Routine } from '@/lib/routines';
import { captureLoop, setLoopBreakdown } from '@/lib/open-loops';
import { breakdownTask } from '@/lib/marvin-client';
import { estLabel } from '@/lib/tone';

/**
 * Routines (P2) — save the recurring multi-step things once, run them anytime. Starting a
 * routine drops one Open Loop with its steps pre-filled, so it shows up on Home ready to go.
 */
export default function RoutinesPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<{ step: string; estMins: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = () => setRoutines(listRoutines());
  useEffect(() => { ensureStorageReady().then(() => { reload(); setReady(true); }); }, []);
  const say = (s: string) => { setFlash(s); window.setTimeout(() => setFlash(null), 2600); };

  const autofill = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const r = await breakdownTask(name.trim(), 3);
    setBusy(false);
    if (r.ok && r.steps?.length) setSteps(r.steps);
    else say('Couldn’t auto-fill — add steps by hand.');
  };

  const create = () => {
    if (!name.trim() || steps.length === 0) return;
    addRoutine(name.trim(), steps);
    setName(''); setSteps([]);
    reload();
    say('Routine saved.');
  };

  const start = (r: Routine) => {
    const loop = captureLoop({ source: 'manual', task: r.name });
    setLoopBreakdown(loop.id, r.steps.map((s) => ({ ...s, done: false })));
    say('Started — it’s on your Home, ready to go.');
    window.setTimeout(() => router.push('/'), 700);
  };

  return (
    <div className="mx-auto max-w-[720px] px-8 pb-16 pt-7">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-text">Routines</h1>
        <p className="mt-1 text-[13px] text-muted">
          Save the multi-step things you do again and again — so you never have to figure out the
          steps twice. Start one and it lands on your Home, broken down and ready.
        </p>
      </header>

      {!ready ? (
        <div className="space-y-2.5">{[0, 1].map((i) => <div key={i} className="xsk h-24 rounded-2xl" />)}</div>
      ) : (
        <>
          {/* new routine */}
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted">New routine</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Publish an Amargi video"
                className="min-w-[240px] flex-1 rounded-xl border border-border-2 bg-bg px-3.5 py-2.5 text-[14px] text-text outline-none focus:border-accent"
              />
              <button type="button" onClick={() => void autofill()} disabled={busy || !name.trim()} className="rounded-xl border border-border-2 bg-surface-2 px-3.5 py-2.5 text-[13px] font-semibold text-text-2 transition hover:bg-hover disabled:opacity-50">
                {busy ? 'Thinking…' : '✨ Auto-fill steps'}
              </button>
            </div>

            {steps.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-[10px] border border-border bg-bg px-3 py-2 text-[13px] text-text-2">
                    <span className="flex-1">{s.step}</span>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">{estLabel(s.estMins)}</span>
                    <button type="button" onClick={() => setSteps((c) => c.filter((_, idx) => idx !== i))} className="text-muted hover:text-text-2">✕</button>
                  </div>
                ))}
                <button type="button" onClick={create} className="mt-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">Save routine</button>
              </div>
            )}
          </div>

          {/* saved routines */}
          <div className="mt-6 space-y-3">
            {routines.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center text-[13px] text-text-2">
                No routines yet. Name one above and let Xanî fill in the steps.
              </p>
            )}
            {routines.map((r) => {
              const total = r.steps.reduce((a, s) => a + s.estMins, 0);
              return (
                <div key={r.id} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-display text-[17px] font-semibold text-text">{r.name}</div>
                      <div className="text-[12px] text-muted">{r.steps.length} steps · {estLabel(total)}</div>
                    </div>
                    <div className="flex flex-none gap-2">
                      <button type="button" onClick={() => start(r)} className="rounded-xl bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim">▶ Start</button>
                      <button type="button" onClick={() => { removeRoutine(r.id); reload(); }} className="rounded-xl px-2.5 py-2 text-[13px] text-muted transition hover:text-text-2">Delete</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {flash && (
        <div className="fixed bottom-6 left-1/2 z-[90] -translate-x-1/2 rounded-xl bg-ink px-4 py-3 text-[13.5px] font-semibold text-[#f5f2ea] shadow-lg">{flash}</div>
      )}
    </div>
  );
}
