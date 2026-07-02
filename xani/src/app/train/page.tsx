'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ensureStorageReady } from '@/lib/storage';
import {
  fetchWritingSamples,
  harvestVoice,
  analyzeVoice,
  getVoiceCorpus,
  type VoiceCorpusInfo,
} from '@/lib/marvin-client';
import { fetchInboxFolder } from '@/lib/marvin-data';
import { generateQuestions } from '@/lib/marvin-client';
import { getVoice, setVoiceSamples, type VoiceMedium } from '@/lib/voice';
import { recordSenderRule } from '@/lib/triage-learning';
import {
  openQuestions,
  answeredQuestions,
  questionCounts,
  addQuestions,
  answerQuestion,
  skipQuestion,
  understandingFacts,
  type UnderstandingQ,
} from '@/lib/understanding';

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

/** Deep harvest — go back as far as Slack/Gmail allow, gather Rebaz's own writing (Slack
 *  bursts grouped into real messages, emails de-quoted), save it as his voice, and mine the
 *  patterns in the tasks he's given and how he answers. Bounded per run; re-run to go deeper. */
function DeepHarvest() {
  const [info, setInfo] = useState<VoiceCorpusInfo | null>(null);
  const [harvesting, setHarvesting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    getVoiceCorpus().then((r) => { if (r.ok) setInfo(r); });
  }, []);

  const harvest = async () => {
    setHarvesting(true);
    setMsg('Gathering your Slack + email history… this can take a few minutes (Slack limits how fast it can be read). Leave it running — re-run later to reach further back.');
    const r = await harvestVoice({});
    setHarvesting(false);
    if (!r.ok) { setMsg(r.error ?? 'Harvest failed.'); return; }
    let saved = 0;
    for (const [key, samples] of Object.entries(r.samples ?? {})) {
      const idx = key.indexOf(':');
      if (idx < 0) continue;
      setVoiceSamples(key.slice(0, idx) as VoiceMedium, key.slice(idx + 1), samples);
      saved += 1;
    }
    setMsg(`Gathered your writing and saved it as your voice across ${saved} channel${saved === 1 ? '' : 's'}. Now analyse the patterns.`);
    const c = await getVoiceCorpus();
    if (c.ok) setInfo(c);
  };

  const analyze = async () => {
    setAnalyzing(true);
    setMsg('Analysing your writing and the tasks you get, on your Claude login… this also takes a moment.');
    const r = await analyzeVoice();
    setAnalyzing(false);
    if (!r.ok) { setMsg(r.error ?? 'Analysis failed.'); return; }
    setMsg('Analysis done — see your patterns below.');
    const c = await getVoiceCorpus();
    if (c.ok) setInfo(c);
  };

  const stats = info?.stats ?? {};
  const sum = (pfx: string) => Object.entries(stats).filter(([k]) => k.startsWith(pfx)).reduce((a, [, v]) => a + (v as number), 0);
  const mine = sum('mine:');
  const pairs = sum('pairs:');
  const analysis = info?.analysis ?? null;

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-[12px] font-bold uppercase tracking-[0.1em] text-muted">Deep harvest — learn everything I&apos;ve written</h2>
      <div className="rounded-[14px] border border-border bg-surface p-[18px]">
        <p className="text-[13px] leading-relaxed text-text-2">
          Go back as far as Slack and Gmail allow and gather all of your own messages and sent
          emails. On Slack, several quick lines you type in a row are treated as one message (the way
          chatting really works). It saves everything as your voice, then finds the patterns in the
          tasks people send you and how you reply. Read-only; nothing is ever sent.
        </p>

        {(mine > 0 || info?.updatedAt) && (
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted">
            <span><span className="font-semibold text-text-2">{mine}</span> of your messages/emails gathered</span>
            <span><span className="font-semibold text-text-2">{pairs}</span> task→reply pairs</span>
            {info?.updatedAt && <span>updated {new Date(info.updatedAt).toLocaleString()}</span>}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void harvest()} disabled={harvesting || analyzing} className="rounded-[9px] bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-on-accent transition hover:bg-accent-dim disabled:opacity-60">
            {harvesting ? 'Gathering… (leave it running)' : mine > 0 ? 'Gather more (go further back)' : 'Gather all my writing'}
          </button>
          <button type="button" onClick={() => void analyze()} disabled={analyzing || harvesting || mine === 0} className="rounded-[9px] border border-border bg-bg px-3.5 py-1.5 text-[12.5px] font-semibold text-text-2 transition hover:bg-hover disabled:opacity-50">
            {analyzing ? 'Analysing…' : 'Analyse my patterns'}
          </button>
        </div>

        {msg && <p className="mt-3 text-[12.5px] leading-relaxed text-muted">{msg}</p>}

        {analysis && (
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            {Object.keys(analysis.voiceNotes).length > 0 && (
              <div>
                <div className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wide text-muted">How you write</div>
                {Object.entries(analysis.voiceNotes).map(([k, notes]) => (
                  <div key={k} className="mb-2">
                    <div className="text-[12px] font-semibold text-text-2">{k}</div>
                    <ul className="ml-4 list-disc text-[12px] leading-relaxed text-text-2">
                      {notes.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            {analysis.patterns && (
              <div>
                <div className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wide text-muted">Patterns in your tasks &amp; replies</div>
                <div className="whitespace-pre-wrap rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[12px] leading-relaxed text-text-2">{analysis.patterns}</div>
              </div>
            )}
            <div className="text-[11px] text-muted">Analysed {new Date(analysis.analyzedAt).toLocaleString()}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Understanding (Rebaz: "no room to guess") — Xanî finds the people, references and asks in
 * his connectors it doesn't understand and asks about them; he answers when he wants, and the
 * answers feed triage so it stops guessing. Ongoing — there's always more to learn.
 */
function Understanding() {
  const [open, setOpen] = useState<UnderstandingQ[]>([]);
  const [answered, setAnswered] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = () => { setOpen(openQuestions()); setAnswered(questionCounts().answered); };
  useEffect(() => {
    reload();
    window.addEventListener('xani:understanding-changed', reload);
    return () => window.removeEventListener('xani:understanding-changed', reload);
  }, []);

  const find = async () => {
    setBusy(true);
    setMsg('Reading your Slack & email for things I don’t understand yet…');
    const asked = [...openQuestions(), ...answeredQuestions()].map((q) => q.question);
    const r = await generateQuestions(understandingFacts(), asked);
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Couldn’t generate questions.'); return; }
    const added = addQuestions(r.questions ?? []);
    setMsg(added > 0 ? `Added ${added} question${added === 1 ? '' : 's'}.` : 'Nothing new to ask right now — I’m caught up.');
    reload();
  };
  const save = (q: UnderstandingQ) => {
    const a = (drafts[q.id] || '').trim();
    if (!a) return;
    answerQuestion(q.id, a);
    setDrafts((d) => { const n = { ...d }; delete n[q.id]; return n; });
    reload();
  };

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-muted">Help me understand your world</h2>
        {answered > 0 && <span className="text-[11.5px] text-text-2">{answered} answered</span>}
      </div>

      <div className="rounded-2xl border border-border bg-surface p-[18px]">
        <p className="text-[13px] leading-relaxed text-text-2">
          So I never guess: I read your Slack and email and ask about the people, projects and references
          I don’t understand. Answer whenever you have a minute — every answer helps me read your world
          the way you do. This never really finishes; there’s always more to learn.
        </p>
        <button type="button" onClick={() => void find()} disabled={busy} className="mt-3 rounded-[9px] bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-on-accent transition hover:bg-accent-dim disabled:opacity-60">
          {busy ? 'Looking…' : open.length > 0 ? 'Find more questions' : 'Find questions'}
        </button>
        {msg && <p className="mt-2 text-[12.5px] text-muted">{msg}</p>}
      </div>

      {open.length > 0 && (
        <div className="mt-3 space-y-2.5">
          {open.map((q) => (
            <div key={q.id} className="rounded-2xl border border-border bg-surface p-[18px]">
              {q.about && <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-accent">{q.about}</div>}
              <p className="mt-0.5 font-display text-[16px] font-semibold text-text">{q.question}</p>
              {q.context && <p className="mt-0.5 text-[12px] italic text-muted">“{q.context}”</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={drafts[q.id] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') save(q); }}
                  placeholder="Your answer…"
                  className="min-w-[220px] flex-1 rounded-xl border border-border-2 bg-bg px-3.5 py-2.5 text-[14px] text-text outline-none focus:border-accent"
                />
                <button type="button" onClick={() => save(q)} disabled={!(drafts[q.id] || '').trim()} className="rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim disabled:opacity-40">Save</button>
                <button type="button" onClick={() => { skipQuestion(q.id); reload(); }} className="rounded-xl px-3 py-2.5 text-[13px] font-medium text-muted transition hover:text-text-2">Skip</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type Sender = { email: string; name: string; count: number; subject: string };

function parseSender(from: string): { email: string; name: string } {
  const m = from.match(/<([^>]+)>/);
  const email = (m?.[1] ?? (from.includes('@') ? from : '')).trim().toLowerCase();
  let name = m ? from.slice(0, from.indexOf('<')).trim() : from.trim();
  name = name.replace(/^["']|["']$/g, '').trim();
  if (!name) name = email || from;
  return { email, name };
}

/** Bulk sender-labeling — the training-session queue (self-development.md §4b).
 *  Reads the raw inbox (no model), aggregates senders, and turns each Important/Noise
 *  tap into a durable triage rule. Works without the Anthropic API. */
function SenderQueue() {
  const [queue, setQueue] = useState<Sender[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [labeled, setLabeled] = useState(0);

  const load = async () => {
    setLoading(true);
    setErr(null);
    const data = await fetchInboxFolder('inbox');
    setLoading(false);
    setLoaded(true);
    if (!data) { setErr('Runtime unreachable — start it with: npm run dev:all'); return; }
    if (!data.connected) { setErr(data.error ?? 'Gmail isn’t connected yet — connect it in Connections.'); return; }
    const map = new Map<string, Sender>();
    for (const msg of data.messages) {
      const { email, name } = parseSender(msg.from);
      const key = email || name;
      const cur = map.get(key);
      if (cur) cur.count += 1;
      else map.set(key, { email, name, count: 1, subject: msg.subject });
    }
    setQueue([...map.values()].sort((a, b) => b.count - a.count).slice(0, 40));
  };

  const label = (s: Sender, decision: 'important' | 'noise') => {
    recordSenderRule({ medium: 'email', from: s.email || s.name, decision });
    setQueue((q) => q.filter((x) => x !== s));
    setLabeled((n) => n + 1);
  };
  const skip = (s: Sender) => setQueue((q) => q.filter((x) => x !== s));

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.1em] text-muted">Your inbox — who matters?</h2>
        {labeled > 0 && <span className="text-[11.5px] text-text-2">{labeled} taught</span>}
      </div>

      {!loaded ? (
        <div className="rounded-[14px] border border-border bg-surface p-[18px]">
          <p className="text-[13px] text-text-2">
            Go through your senders together — mark who’s important and who’s noise. Each tap becomes a
            rule so MARVIN files the junk and never buries the people who matter.
          </p>
          <button type="button" onClick={() => void load()} disabled={loading} className="mt-3 rounded-[9px] bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-on-accent transition hover:bg-accent-dim disabled:opacity-60">
            {loading ? 'Reading your inbox…' : 'Go through my senders'}
          </button>
        </div>
      ) : err ? (
        <p className="rounded-[14px] border border-border bg-surface p-[18px] text-[13px] text-muted">{err}</p>
      ) : queue.length === 0 ? (
        <p className="rounded-[14px] border border-dashed border-border bg-surface p-6 text-center text-[13px] text-text-2">
          {labeled > 0 ? `Done — you taught MARVIN about ${labeled} senders. It’ll apply them from now on.` : 'No senders found in your inbox yet.'}
        </p>
      ) : (
        <div className="space-y-2">
          {queue.map((s) => (
            <div key={s.email || s.name} className="flex items-center gap-3 rounded-[12px] border border-border bg-surface p-3.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold text-text">{s.name}</div>
                <div className="truncate text-[11.5px] text-muted">{s.email || '—'} · {s.count} {s.count === 1 ? 'message' : 'messages'}</div>
              </div>
              <button type="button" onClick={() => label(s, 'important')} className="shrink-0 rounded-[8px] bg-accent px-3 py-1.5 text-[12px] font-semibold text-on-accent transition hover:bg-accent-dim">Important</button>
              <button type="button" onClick={() => label(s, 'noise')} className="shrink-0 rounded-[8px] border border-border-2 bg-surface-2 px-3 py-1.5 text-[12px] font-semibold text-text-2 transition hover:bg-hover">Noise</button>
              <button type="button" onClick={() => skip(s)} className="shrink-0 rounded-[8px] px-2 py-1.5 text-[12px] font-medium text-muted transition hover:text-text-2">Skip</button>
            </div>
          ))}
        </div>
      )}
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
        <>
          <Understanding />

          <div className="mt-10 mb-2 text-[12px] font-bold uppercase tracking-[0.1em] text-muted">Your writing voice</div>
          <div className="space-y-2.5">
            {SCOPES.map((s) => <VoiceCard key={`${s.medium}:${s.scope}`} s={s} />)}
          </div>
          <DeepHarvest />
          <SenderQueue />
        </>
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
