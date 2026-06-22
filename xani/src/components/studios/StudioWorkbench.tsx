'use client';

import { useState } from 'react';
import { streamMarvin } from '@/lib/marvin-client';
import { composeStudioSystemPrompt } from '@/lib/context';
import { getSettings } from '@/lib/settings';
import { ensureStorageReady } from '@/lib/storage';

/**
 * Shared Studio workbench. Input → MARVIN (Studio system prompt + locked rules +
 * learned preferences, composed in the renderer) → streamed output. Drafting
 * only: Studios never take outward actions. Output is the user's to copy/use.
 */
export function StudioWorkbench(props: {
  studio: 'amargi' | 'leadstories' | 'moonshot';
  title: string;
  subtitle: string;
  inputLabel: string;
  placeholder: string;
}) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = async () => {
    const text = input.trim();
    if (!text || busy) return;
    await ensureStorageReady();
    setBusy(true);
    setOutput('');
    setCopied(false);

    const model = getSettings().models.studio;
    const system = [{ type: 'text' as const, text: composeStudioSystemPrompt(props.studio), cache: true }];

    let out = '';
    await streamMarvin({ model, system, messages: [{ role: 'user', content: text }] }, (e) => {
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

  const copy = () => {
    void navigator.clipboard?.writeText(output);
    setCopied(true);
  };

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-3xl text-ink">{props.title}</h1>
      <p className="mt-1 text-sm text-ink-soft">{props.subtitle}</p>

      <label className="mt-8 block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">
          {props.inputLabel}
        </span>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={props.placeholder}
          className="min-h-32 w-full rounded-xl border border-line bg-paper-card px-3 py-2 text-sm text-ink outline-none focus:border-terracotta"
        />
      </label>

      <button
        type="button"
        onClick={() => void run()}
        disabled={busy || input.trim().length === 0}
        className="mt-3 rounded-lg bg-terracotta px-5 py-2 text-sm font-medium text-paper transition-colors hover:bg-terracotta-dim disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? 'Drafting…' : 'Draft'}
      </button>

      {output && (
        <section className="mt-8 rounded-2xl border border-line bg-paper-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-ink-soft">Draft</h2>
            <button
              type="button"
              onClick={copy}
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
