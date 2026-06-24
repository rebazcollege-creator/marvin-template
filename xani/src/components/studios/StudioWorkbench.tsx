'use client';

import { useEffect, useRef, useState } from 'react';
import { streamMarvin } from '@/lib/marvin-client';
import { composeStudioSystemPrompt } from '@/lib/context';
import { DEFAULT_SETTINGS, getSettings, saveSettings, type XaniSettings } from '@/lib/settings';
import { ensureStorageReady, readJson, writeJson, newId } from '@/lib/storage';
import { Collapsible } from '@/components/ui/Collapsible';
import { logActivity } from '@/lib/activity';

/**
 * Shared Studio workbench. Input → MARVIN (Studio system prompt + locked rules +
 * learned preferences) → streamed output. Drafting only: Studios never take
 * outward actions. Per the product principle, the controls (prompt, model,
 * connectors) live behind a disclosure; you can attach reference files; and every
 * draft is kept in a local run history. All existing run logic is preserved.
 */

type StudioId = 'amargi' | 'leadstories' | 'moonshot';
type Attachment = { name: string; text: string };
type Run = { id: string; at: string; input: string; output: string };

const CONNECTORS: Record<StudioId, string[]> = {
  amargi: ['Buffer', 'Slack', 'Instagram'],
  leadstories: ['Gmail (read)', 'Web'],
  moonshot: ['Drive', 'Calendar'],
};

export function StudioWorkbench(props: {
  studio: StudioId;
  title: string;
  subtitle: string;
  inputLabel: string;
  placeholder: string;
}) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [settings, setSettings] = useState<XaniSettings | null>(null);
  const [promptDraft, setPromptDraft] = useState('');
  const [extra, setExtra] = useState('');
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [history, setHistory] = useState<Run[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const histKey = `xani.studio.${props.studio}.v1`;

  useEffect(() => {
    ensureStorageReady().then(() => {
      const s = getSettings();
      setSettings(s);
      setPromptDraft(s.prompts[props.studio]);
      setHistory(readJson<Run[]>(histKey, []));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.studio]);

  const promptDirty = settings ? promptDraft !== settings.prompts[props.studio] : false;
  const promptIsDefault = promptDraft === DEFAULT_SETTINGS.prompts[props.studio];

  const savePrompt = () => {
    if (!settings) return;
    const next = { ...settings, prompts: { ...settings.prompts, [props.studio]: promptDraft } };
    saveSettings(next);
    setSettings(next);
  };
  const resetPrompt = () => setPromptDraft(DEFAULT_SETTINGS.prompts[props.studio]);

  const onAttach = async (files: FileList | null) => {
    if (!files) return;
    const read: Attachment[] = [];
    for (const f of Array.from(files)) {
      try {
        const text = await f.text();
        read.push({ name: f.name, text: text.slice(0, 20000) });
      } catch {
        read.push({ name: f.name, text: '' });
      }
    }
    setAtts((a) => [...a, ...read]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const run = async () => {
    const text = input.trim();
    if (!text || busy) return;
    await ensureStorageReady();
    setBusy(true);
    setOutput('');
    setCopied(false);

    const model = getSettings().models.studio;
    const system = [{ type: 'text' as const, text: composeStudioSystemPrompt(props.studio), cache: true }];

    const parts: string[] = [];
    if (extra.trim()) parts.push(`Extra instructions for this draft:\n${extra.trim()}`);
    for (const a of atts) if (a.text) parts.push(`Attached file "${a.name}":\n${a.text}`);
    parts.push(text);
    const content = parts.join('\n\n---\n\n');

    let out = '';
    await streamMarvin({ model, system, messages: [{ role: 'user', content }] }, (e) => {
      if (e.type === 'text') {
        out += e.text;
        setOutput(out);
      } else if (e.type === 'error') {
        out += (out ? '\n\n' : '') + `⚠ ${e.message}`;
        setOutput(out);
      }
    });
    setBusy(false);

    if (out.trim()) {
      const run: Run = { id: newId(), at: new Date().toISOString(), input: text, output: out };
      const next = [run, ...history].slice(0, 30);
      setHistory(next);
      writeJson(histKey, next);
      logActivity({ kind: 'note', title: `Drafted with ${props.title}`, detail: text.slice(0, 80) });
    }
  };

  const copy = () => {
    void navigator.clipboard?.writeText(output);
    setCopied(true);
  };

  return (
    <div className="mx-auto max-w-3xl px-8 pb-16 pt-7">
      <h1 className="font-display text-2xl font-semibold text-text">{props.title}</h1>
      <p className="mt-1 text-[13px] text-muted">{props.subtitle}</p>

      {/* Controls — behind a disclosure (progressive disclosure) */}
      <div className="mt-6">
        <Collapsible title="Controls" summary={`Model ${settings?.models.studio ?? '…'} · ${CONNECTORS[props.studio].join(' · ')}${promptDirty ? ' · prompt edited (unsaved)' : ''}`}>
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-center">
                <span className="flex-1 text-[12px] font-semibold text-text-2">System prompt</span>
                <button type="button" onClick={resetPrompt} disabled={promptIsDefault} className="text-[11.5px] font-semibold text-text-2 hover:text-accent disabled:opacity-40">Reset to default</button>
              </div>
              <textarea value={promptDraft} onChange={(e) => setPromptDraft(e.target.value)} className="min-h-32 w-full resize-y rounded-[10px] border border-border bg-bg px-3 py-2.5 font-mono text-[12px] leading-relaxed text-text outline-none focus:border-accent" />
              <div className="mt-2 flex items-center gap-2">
                <button type="button" onClick={savePrompt} disabled={!promptDirty} className="rounded-[9px] bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-on-accent hover:bg-accent-dim disabled:opacity-40">Save prompt</button>
                <span className="text-[11.5px] text-muted">Locked safety rules are always appended and can’t be edited.</span>
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-[12px] font-semibold text-text-2">Connectors</span>
              <div className="flex flex-wrap gap-1.5">
                {CONNECTORS[props.studio].map((c) => (
                  <span key={c} className="rounded-full bg-accent-soft px-2.5 py-1 text-[11.5px] font-medium text-accent">{c}</span>
                ))}
              </div>
            </div>
          </div>
        </Collapsible>
      </div>

      <label className="mt-5 block">
        <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.07em] text-muted">{props.inputLabel}</span>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder={props.placeholder} className="min-h-32 w-full rounded-xl border border-border bg-surface px-3.5 py-3 text-[13.5px] leading-relaxed text-text outline-none focus:border-accent" />
      </label>

      <label className="mt-3 block">
        <span className="mb-1 block text-[11.5px] font-semibold text-muted">Extra instructions for this draft (optional)</span>
        <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="e.g. punchier, add a hook, keep it under 200 characters" className="w-full rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[13px] text-text outline-none focus:border-accent" />
      </label>

      {/* attachments */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-[9px] border border-border bg-bg px-3 py-1.5 text-[12.5px] font-semibold text-text-2 hover:bg-hover">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.5 12 21a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8.5-8.5" /></svg>
          Attach
        </button>
        <input ref={fileRef} type="file" multiple accept=".txt,.md,.csv,.json,.html" className="hidden" onChange={(e) => void onAttach(e.target.files)} />
        {atts.map((a, i) => (
          <span key={i} className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] text-text-2">
            {a.name}
            <button type="button" onClick={() => setAtts((cur) => cur.filter((_, j) => j !== i))} aria-label={`Remove ${a.name}`} className="text-muted hover:text-accent">✕</button>
          </span>
        ))}
      </div>

      <button type="button" onClick={() => void run()} disabled={busy || input.trim().length === 0} className="mt-3 rounded-[10px] bg-accent px-5 py-2 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-40">
        {busy ? 'Drafting…' : 'Draft'}
      </button>

      {output && (
        <section className="mt-7 rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Draft</h2>
            <button type="button" onClick={copy} className="text-[12px] font-semibold text-text-2 hover:text-accent">{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-[13.5px] leading-relaxed text-text">{output}</p>
        </section>
      )}

      {/* run history */}
      {history.length > 0 && (
        <section className="mt-8">
          <div className="mb-2.5 text-[11px] font-bold tracking-[0.08em] text-muted">RUN HISTORY ({history.length})</div>
          <ul className="space-y-2">
            {history.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => { setOutput(r.output); setInput(r.input); setCopied(false); }} className="block w-full rounded-[12px] border border-border bg-surface p-3.5 text-left transition hover:bg-hover">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-[13px] font-medium text-text">{r.input}</span>
                    <span className="shrink-0 pl-3 text-[11.5px] text-muted">{new Date(r.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12px] text-text-2">{r.output}</p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
