'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ensureStorageReady } from '@/lib/storage';
import { fetchWritingSamples } from '@/lib/marvin-client';
import { getVoice, setVoiceSamples, type VoiceMedium } from '@/lib/voice';

/**
 * Train mode (docs/self-development.md §4b) — give Xanî a head start by teaching it
 * from Rebaz's real history. This first cut teaches his WRITING VOICE: it reads his
 * own sent emails and past Slack messages (per workspace), he confirms "yes, that's
 * how I write," and it's stored so every draft sounds like him. Read-only; nothing
 * is sent. Works without the Anthropic API — it reads Gmail/Slack directly.
 */

type Scope = { medium: VoiceMedium; scope: string; title: string; subtitle: string };

const SCOPES: Scope[] = [
  { medium: 'email', scope: 'all', title: 'Your email voice', subtitle: 'From your sent mail across accounts' },
  { medium: 'slack', scope: 'amargi', title: 'Your Amargi Slack voice', subtitle: 'From your own messages in The Amargi' },
  { medium: 'slack', scope: 'leadstories', title: 'Your LeadStories Slack voice', subtitle: 'From your own messages in LeadStories' },
];

function VoiceCard({ s }: { s: Scope }) {
  const [samples, setSamples] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [trainedAt, setTrainedAt] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const v = getVoice(s.medium, s.scope);
    setTrainedAt(v.trainedAt);
  }, [s.medium, s.scope]);

  const learn = async () => {
    setLoading(true);
    setErr(null);
    setSaved(false);
    const r = await fetchWritingSamples({
      medium: s.medium,
      workspace: s.medium === 'slack' ? s.scope : undefined,
    });
    setLoading(false);
    if (!r.ok) { setErr(r.error ?? 'Could not read your history.'); return; }
    if (r.samples.length === 0) { setErr('No writing found yet — send a few messages first, then try again.'); return; }
    setSamples(r.samples);
  };

  const save = () => {
    setVoiceSamples(s.medium, s.scope, samples);
    setTrainedAt(new Date().toISOString());
    setSaved(true);
  };

  return (
    <div className="rounded-[14px] border border-border bg-surface p-[18px]">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-text">{s.title}</div>
          <div className="text-[12px] text-muted">{s.subtitle}</div>
        </div>
        {trainedAt && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-green-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-green" /> Learned
          </span>
        )}
      </div>

      {err && <p className="mt-3 text-[12.5px] text-muted">{err}</p>}

      {samples.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-[12px] text-text-2">{samples.length} samples of how you write — does this sound like you?</p>
          {samples.slice(0, 6).map((t, i) => (
            <div key={i} className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-[10px] border border-border bg-bg px-3 py-2 text-[12px] leading-relaxed text-text-2">{t}</div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {samples.length === 0 ? (
          <button type="button" onClick={() => void learn()} disabled={loading} className="rounded-[9px] bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-on-accent transition hover:bg-accent-dim disabled:opacity-60">
            {loading ? 'Reading your writing…' : trainedAt ? 'Re-learn from latest' : 'Learn my voice'}
          </button>
        ) : (
          <>
            <button type="button" onClick={save} className="rounded-[9px] bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-on-accent transition hover:bg-accent-dim">
              {saved ? '✓ Saved as my voice' : 'Yes — save as my voice'}
            </button>
            <button type="button" onClick={() => setSamples([])} className="rounded-[9px] border border-border bg-bg px-3.5 py-1.5 text-[12.5px] font-semibold text-text-2 transition hover:bg-hover">Discard</button>
          </>
        )}
      </div>
    </div>
  );
}

export default function TrainPage() {
  const [ready, setReady] = useState(false);
  useEffect(() => { ensureStorageReady().then(() => setReady(true)); }, []);

  return (
    <div className="mx-auto max-w-[720px] px-8 pb-16 pt-7">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-text">Train</h1>
        <p className="mt-1 text-[13px] text-muted">
          Teach Xanî your writing so drafts sound like you — not like AI. It reads your own sent
          emails and past Slack messages, you confirm they’re yours, and it learns your language and
          tone. Read-only; nothing is ever sent.
        </p>
      </header>

      {!ready ? (
        <div className="space-y-2.5">{[0, 1, 2].map((i) => <div key={i} className="xsk h-24 rounded-2xl" />)}</div>
      ) : (
        <div className="space-y-2.5">
          {SCOPES.map((s) => <VoiceCard key={`${s.medium}:${s.scope}`} s={s} />)}
        </div>
      )}

      <p className="mt-5 text-[12px] text-muted">
        Xanî keeps learning as you go: every time you edit a draft in{' '}
        <Link href="/approvals" className="font-medium text-accent hover:underline">Approvals</Link>{' '}
        before sending, your edit becomes a new voice sample. Slack voice needs a user token
        (xoxp-) — add one in <Link href="/connections" className="font-medium text-accent hover:underline">Connections</Link>.
      </p>
    </div>
  );
}
