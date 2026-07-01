'use client';

import { useState } from 'react';
import { streamMarvin } from '@/lib/marvin-client';
import { composeMarvinSystemPrompt } from '@/lib/context';
import { getSettings } from '@/lib/settings';
import { ensureStorageReady } from '@/lib/storage';

/**
 * Structured drafting workbench (Email drafter, Slack composer).
 *
 * Like StudioWorkbench but with typed context fields (account, recipient,
 * workspace, channel) in addition to free-text intent. MARVIN drafts only —
 * nothing is sent/posted here; outward sending always goes through the
 * confirmation gate elsewhere.
 */

export interface SelectField {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}
export interface TextField {
  key: string;
  label: string;
  placeholder?: string;
}

export function DrafterWorkbench(props: {
  title: string;
  subtitle: string;
  selects?: SelectField[];
  textInputs?: TextField[];
  intentLabel: string;
  intentPlaceholder: string;
  buildPrompt: (fields: Record<string, string>, intent: string) => string;
  note: string;
}) {
  const initial: Record<string, string> = {};
  for (const s of props.selects ?? []) initial[s.key] = s.options[0]?.value ?? '';
  for (const t of props.textInputs ?? []) initial[t.key] = '';

  const [fields, setFields] = useState<Record<string, string>>(initial);
  const [intent, setIntent] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const setField = (key: string, value: string) =>
    setFields((f) => ({ ...f, [key]: value }));

  const run = async () => {
    if (!intent.trim() || busy) return;
    await ensureStorageReady();
    setBusy(true);
    setOutput('');
    setCopied(false);

    const model = getSettings().models.studio;
    const system = [{ type: 'text' as const, text: composeMarvinSystemPrompt(), cache: true }];
    const userMsg = props.buildPrompt(fields, intent.trim());

    let out = '';
    await streamMarvin({ model, system, messages: [{ role: 'user', content: userMsg }] }, (e) => {
      if (e.type === 'text') {
        out += e.text;
        setOutput(out);
      } else if (e.type === 'error') {
        out += (out ? '\n\n' : '') + `⚠ ${e.message}`;
        setOutput(out);
      }
    });
    setBusy(false);
  };

  const inputCls =
    'w-full rounded-lg border border-line bg-paper-card px-3 py-2 text-sm text-ink outline-none focus:border-terracotta';

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-3xl text-ink">{props.title}</h1>
      <p className="mt-1 text-sm text-ink-soft">{props.subtitle}</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {(props.selects ?? []).map((s) => (
          <label key={s.key} className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">
              {s.label}
            </span>
            <select
              className={inputCls}
              value={fields[s.key]}
              onChange={(e) => setField(s.key, e.target.value)}
            >
              {s.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        {(props.textInputs ?? []).map((t) => (
          <label key={t.key} className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">
              {t.label}
            </span>
            <input
              className={inputCls}
              value={fields[t.key]}
              placeholder={t.placeholder}
              onChange={(e) => setField(t.key, e.target.value)}
            />
          </label>
        ))}
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">
          {props.intentLabel}
        </span>
        <textarea
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder={props.intentPlaceholder}
          className={`${inputCls} min-h-28`}
        />
      </label>

      <button
        type="button"
        onClick={() => void run()}
        disabled={busy || intent.trim().length === 0}
        className="mt-3 rounded-lg bg-terracotta px-5 py-2 text-sm font-medium text-paper transition-colors hover:bg-terracotta-dim disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'Drafting…' : 'Draft'}
      </button>

      <p className="mt-3 text-xs text-ink-soft">{props.note}</p>

      {output && (
        <section className="mt-8 rounded-2xl border border-line bg-paper-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-ink-soft">Draft</h2>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(output);
                setCopied(true);
              }}
              className="text-xs text-ink-soft underline-offset-2 hover:underline"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{output}</p>
        </section>
      )}
    </div>
  );
}
