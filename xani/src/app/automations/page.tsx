'use client';

import { useEffect, useState } from 'react';
import { ensureStorageReady } from '@/lib/storage';
import { Modal } from '@/components/ui/Modal';
import { logActivity } from '@/lib/activity';
import {
  listAutomations,
  saveAutomations,
  fromText,
  fromTemplate,
  AUTO_TEMPLATES,
  APP_GLYPHS,
  CATEGORIES,
  type Automation,
  type AutoCategory,
  type AppTouch,
} from '@/lib/automations';

const EXAMPLES = [
  'Every weekday at 8am, brief me on what needs my attention',
  'When an investor emails, flag it and draft a reply',
  'Every Friday, summarise what shipped this week',
  'After each meeting, turn decisions into Trello cards',
];

const CAT_TINT: Record<AutoCategory, { tint: string; edge: string }> = {
  Brief: { tint: '#E8EEE5', edge: '#6E8B6A' },
  Inbox: { tint: 'var(--accent-soft)', edge: '#C0613A' },
  Calendar: { tint: '#ECE7F1', edge: '#7A6E9C' },
  Social: { tint: '#F8EFDF', edge: '#D89A4E' },
  'Fact-check': { tint: 'var(--accent-soft)', edge: '#C0613A' },
};

function GlyphIcon({ name }: { name: string }) {
  const p = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'inbox': case 'Inbox': return (<svg {...p}><path d="M4 13h4l2 3h4l2-3h4" /><path d="M4 13 6 5h12l2 8v6H4z" /></svg>);
    case 'brief': case 'Brief': return (<svg {...p}><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M8 9h8M8 13h8M8 17h5" /></svg>);
    case 'phone': return (<svg {...p}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>);
    case 'check': return (<svg {...p}><path d="M5 12.5 10 17l9-10" /></svg>);
    case 'Calendar': return (<svg {...p}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></svg>);
    case 'Social': return (<svg {...p}><path d="M12 3 21 8l-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></svg>);
    case 'Fact-check': return (<svg {...p}><circle cx="11" cy="11" r="6" /><path d="m20 20-4-4" /></svg>);
    default: return (<svg {...p}><path d="M13 3 5 13h6l-1 8 8-10h-6z" /></svg>);
  }
}

function TouchSquares({ touches }: { touches: AppTouch[] }) {
  return (
    <span className="flex gap-1">
      {touches.map((t) => {
        const g = APP_GLYPHS[t];
        return (
          <span
            key={t}
            title={g.label}
            className="grid h-[18px] w-[18px] place-items-center rounded-[5px] text-[9.5px] font-bold"
            style={{ background: g.tint, color: g.edge }}
          >
            {g.glyph}
          </span>
        );
      })}
    </span>
  );
}

export default function AutomationsPage() {
  const [items, setItems] = useState<Automation[]>([]);
  const [ready, setReady] = useState(false);
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<AutoCategory | 'All'>('All');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Automation | null>(null);
  const [eName, setEName] = useState('');
  const [eTrigger, setETrigger] = useState('');
  const [eAuto, setEAuto] = useState<'auto' | 'ask'>('ask');

  useEffect(() => {
    ensureStorageReady().then(() => {
      setItems(listAutomations());
      setReady(true);
    });
  }, []);

  const persist = (next: Automation[]) => {
    setItems(next);
    saveAutomations(next);
  };

  const create = () => {
    if (text.trim().length <= 3) return;
    const a = fromText(text);
    persist([a, ...items]);
    setOpen((o) => ({ ...o, [a.id]: true }));
    setText('');
    logActivity({ kind: 'automation', title: `Created automation: ${a.name}`, detail: a.trigger });
  };

  const addTemplate = (id: string) => {
    const t = AUTO_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    const a = fromTemplate(t);
    persist([a, ...items]);
    logActivity({ kind: 'automation', title: `Added automation: ${a.name}`, detail: a.trigger });
  };

  const remove = (id: string) => persist(items.filter((a) => a.id !== id));

  const startEdit = (a: Automation) => {
    setEditing(a);
    setEName(a.name);
    setETrigger(a.trigger);
    setEAuto(a.autonomy);
  };
  const saveEdit = () => {
    if (!editing) return;
    persist(items.map((a) => (a.id === editing.id ? { ...a, name: eName.trim() || a.name, trigger: eTrigger.trim() || a.trigger, autonomy: eAuto } : a)));
    setEditing(null);
  };
  const filtered = filter === 'All' ? items : items.filter((a) => a.category === filter);

  return (
    <div className="mx-auto max-w-[780px] px-8 pb-16 pt-7">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-semibold text-text">Automations</h1>
        <p className="mt-1 text-[13px] text-muted">
          Standing instructions for Xanî — written down now, run automatically later.
        </p>
      </header>

      {/* Honesty gate: no fake dashboards. Nothing here executes until the engine exists. */}
      <div className="mb-5 rounded-[13px] border border-border bg-surface px-4 py-3.5 text-[13px] leading-relaxed text-text-2">
        <span className="font-semibold text-text">The automation engine isn’t switched on yet.</span>{' '}
        Anything you save here is a plan, not a running task — Xanî will not act on it, brief you, or
        watch anything on its own until the engine ships. Saving your automations now means they start
        working the day it does.
      </div>

      {/* composer */}
      <div
        className="mb-3.5 rounded-2xl border border-border p-[18px]"
        style={{ background: 'linear-gradient(180deg,var(--accent-soft),var(--surface))' }}
      >
        <div className="mb-3 flex items-center gap-2.5">
          <span className="grid h-[26px] w-[26px] place-items-center rounded-lg bg-accent text-sm text-white">✦</span>
          <div className="text-[13.5px] font-semibold text-text">Describe what Xanî should do</div>
        </div>
        <div className="flex items-end gap-2.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            placeholder="e.g. every weekday at 8am, brief me on what needs my attention"
            className="flex-1 rounded-[11px] border border-border bg-bg px-3.5 py-2.5 text-[13.5px] text-text outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={create}
            disabled={text.trim().length <= 3}
            className="shrink-0 rounded-[11px] bg-accent px-[18px] py-2.5 text-[13.5px] font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Create
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setText(e)}
              className="rounded-full border border-border bg-bg px-3 py-1 text-[11.5px] text-text-2 transition hover:border-accent hover:text-accent"
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* templates */}
      <div className="mb-2.5 mt-6 text-[11px] font-bold tracking-[0.08em] text-muted">START FROM A TEMPLATE</div>
      <div className="mb-6 grid grid-cols-2 gap-2.5">
        {AUTO_TEMPLATES.map((t) => (
          <div key={t.id} className="flex flex-col gap-2.5 rounded-[13px] border border-border bg-surface p-[15px]">
            <div className="flex items-center gap-2.5">
              <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px]" style={{ background: t.tint, color: t.edge }}>
                <GlyphIcon name={t.glyph} />
              </span>
              <div className="text-[13px] font-semibold leading-tight text-text">{t.name}</div>
            </div>
            <div className="flex-1 text-[11.5px] leading-relaxed text-text-2">{t.desc}</div>
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-semibold text-muted">{t.trigger}</span>
              <button
                type="button"
                onClick={() => addTemplate(t.id)}
                className="rounded-[9px] border border-border bg-bg px-3 py-1 text-xs font-semibold text-accent transition hover:border-accent hover:bg-accent-soft"
              >
                Use
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* filters */}
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[11px] font-bold tracking-[0.08em] text-muted">YOUR AUTOMATIONS</div>
        <div className="flex flex-wrap gap-1.5">
          {(['All', ...CATEGORIES] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-[11.5px] font-semibold transition ${
                filter === f
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-border bg-surface text-text-2 hover:bg-hover'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* list */}
      {!ready ? (
        <div className="space-y-2.5">
          {[0, 1].map((i) => (
            <div key={i} className="xsk h-[78px] rounded-[14px]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-border bg-surface px-6 py-10 text-center">
          <p className="text-sm font-semibold text-text">No automations yet</p>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] text-text-2">
            Describe one above, or start from a template. MARVIN runs them once the automation engine is
            switched on — until then they wait here, ready.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-border bg-surface px-6 py-8 text-center text-[13px] text-text-2">
          Nothing in {filter}.
        </p>
      ) : (
        filtered.map((a) => {
          const ct = CAT_TINT[a.category];
          const isOpen = !!open[a.id];
          return (
            <div key={a.id} className="mb-2.5 rounded-[14px] border border-border bg-surface px-[18px] py-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]" style={{ background: ct.tint, color: ct.edge }}>
                  <GlyphIcon name={a.category} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-text">{a.name}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-[7px] px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: ct.tint, color: ct.edge }}>
                      {a.trigger}
                    </span>
                    <span
                      className={`rounded-[7px] px-2 py-0.5 text-[10.5px] font-semibold ${
                        a.autonomy === 'auto' ? 'bg-green-soft text-green-ink' : 'bg-accent-soft text-accent'
                      }`}
                    >
                      {a.autonomy === 'auto' ? 'Auto' : 'Asks first'}
                    </span>
                    <TouchSquares touches={a.touches} />
                  </div>
                  <div className="mt-2 text-[11.5px] font-medium text-text-2">
                    Saved · <span className="font-normal text-muted">runs once the engine is switched on</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setOpen((o) => ({ ...o, [a.id]: !o[a.id] }))}
                    className="flex items-center gap-1 text-[11.5px] text-muted transition hover:text-accent"
                  >
                    Details
                    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${isOpen ? 180 : 0}deg)`, transition: 'transform .15s' }}>
                      <path d="M4 6l4 4 4-4" />
                    </svg>
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="mt-3.5 border-t border-border pt-3.5">
                  <div className="grid grid-cols-2 gap-[18px]">
                    <div>
                      <div className="mb-2.5 text-[10.5px] font-bold tracking-[0.06em] text-muted">WHAT IT DOES</div>
                      {a.steps.map((s, i) => (
                        <div key={i} className="mb-2 flex items-start gap-2.5">
                          <span className="mt-px grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-accent-soft text-[10px] font-bold text-accent">
                            {i + 1}
                          </span>
                          <span className="text-[12.5px] leading-snug text-text-2">{s}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="mb-2.5 text-[10.5px] font-bold tracking-[0.06em] text-muted">RECENT RUNS</div>
                      <div className="text-[12px] text-muted">None — the engine isn’t on yet, so this has never run.</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button type="button" onClick={() => startEdit(a)} className="rounded-[9px] border border-border bg-bg px-3 py-1.5 text-[12px] font-semibold text-text-2 hover:bg-hover">
                      Edit
                    </button>
                    <button type="button" onClick={() => remove(a.id)} className="ml-auto text-[11.5px] text-muted transition hover:text-accent">
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit automation" subtitle="Reconfigure what Xanî runs" width="max-w-lg">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-muted">Name</span>
            <input value={eName} onChange={(e) => setEName(e.target.value)} className="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-text outline-none focus:border-accent" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-semibold text-muted">Trigger</span>
            <input value={eTrigger} onChange={(e) => setETrigger(e.target.value)} className="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-text outline-none focus:border-accent" />
          </label>
          <div>
            <span className="mb-1.5 block text-[11.5px] font-semibold text-muted">Autonomy</span>
            <div className="flex rounded-[10px] border border-border bg-bg p-0.5">
              {(['auto', 'ask'] as const).map((v) => (
                <button key={v} type="button" onClick={() => setEAuto(v)} className={`flex-1 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${eAuto === v ? (v === 'auto' ? 'bg-green text-white' : 'bg-accent text-on-accent') : 'text-text-2 hover:text-text'}`}>
                  {v === 'auto' ? 'Auto' : 'Asks first'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2.5">
          <button type="button" onClick={() => setEditing(null)} className="rounded-[10px] border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-text-2 hover:bg-hover">Cancel</button>
          <button type="button" onClick={saveEdit} className="rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent-dim">Save</button>
        </div>
      </Modal>
    </div>
  );
}
