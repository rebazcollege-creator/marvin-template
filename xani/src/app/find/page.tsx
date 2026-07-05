'use client';

import { useState } from 'react';
import { lookup, type LookupResult } from '@/lib/marvin-client';

/**
 * Find — search your OWN world (email + Slack) in one place.
 *
 * The sidecar does the searching (read-only); the model never gets a tool. Both
 * sources are shown together, so "did Sarah reply — email or Slack?" is one query,
 * not two apps. This is the cross-platform link from the brief, done the safe way.
 */

function slackTsMs(ts: string): number {
  const n = Number(ts);
  return Number.isFinite(n) ? Math.round(n * 1000) : 0;
}
function when(ms: number, tz: string): string {
  if (!ms) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(ms);
  } catch {
    return '';
  }
}

export default function FindPage() {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<LookupResult | null>(null);
  const [ran, setRan] = useState('');
  const tz = 'Europe/Berlin';

  const run = async () => {
    const query = q.trim();
    if (!query || busy) return;
    setBusy(true);
    setRes(null);
    const r = await lookup(query);
    setRes(r);
    setRan(query);
    setBusy(false);
  };

  const emails = res?.email.messages ?? [];
  const slacks = res?.slack.matches ?? [];
  const nothing = res && emails.length === 0 && slacks.length === 0;

  return (
    <div className="mx-auto max-w-3xl px-8 pb-16 pt-7">
      <h1 className="font-display text-2xl font-semibold text-text">Find</h1>
      <p className="mt-1 text-[13px] text-muted">
        Search your email and Slack together — a person, a subject, a phrase. Xanî searches on your behalf.
      </p>

      <div className="mt-5 flex items-end gap-2.5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void run()}
          placeholder="e.g. Sarah OIC deadline, or invoice from:editor@…"
          className="flex-1 rounded-xl border border-border bg-surface px-3.5 py-3 text-[14px] text-text outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || q.trim().length === 0}
          className="shrink-0 rounded-xl bg-accent px-5 py-3 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Searching…' : 'Search'}
        </button>
      </div>

      {res?.email.connected === false && res?.slack.connected === false && (
        <p className="mt-4 text-[13px] text-muted">
          Connect Gmail and/or Slack in <a href="/connections" className="font-medium text-accent hover:underline">Connections</a> so Xanî can search them. Slack search also needs a user token with <code>search:read</code>.
        </p>
      )}

      {res && (
        <div className="mt-7 space-y-8">
          {/* Email */}
          <section>
            <h2 className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-muted">
              Email {emails.length > 0 && `· ${emails.length}`}
            </h2>
            {!res.email.connected ? (
              <p className="text-[13px] text-muted">Gmail isn’t connected.</p>
            ) : res.email.error && emails.length === 0 ? (
              <p className="text-[13px] text-muted">Couldn’t search Gmail: {res.email.error}</p>
            ) : emails.length === 0 ? (
              <p className="text-[13px] text-text-2">No email matches “{ran}”.</p>
            ) : (
              <ul className="space-y-2.5">
                {emails.map((m) => (
                  <li key={`${m.account}:${m.id}`} className="rounded-2xl border border-border bg-surface p-4">
                    <div className="flex items-center gap-2 text-[12px] text-muted">
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 font-semibold text-accent">{m.account}</span>
                      <span className="truncate">{m.from}</span>
                      <span className="ml-auto shrink-0">{when(Date.parse(m.receivedAt), tz)}</span>
                    </div>
                    <p className="mt-1.5 font-display text-[16px] leading-snug text-text">{m.subject || '(no subject)'}</p>
                    {m.snippet && <p className="mt-1 line-clamp-2 text-[13px] text-text-2">{m.snippet}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Slack */}
          <section>
            <h2 className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-muted">
              Slack {slacks.length > 0 && `· ${slacks.length}`}
            </h2>
            {!res.slack.connected ? (
              <p className="text-[13px] text-muted">Slack isn’t connected with a user token (needed to search).</p>
            ) : res.slack.error && slacks.length === 0 ? (
              <p className="text-[13px] text-muted">Couldn’t search Slack: {res.slack.error}</p>
            ) : slacks.length === 0 ? (
              <p className="text-[13px] text-text-2">No Slack matches “{ran}”.</p>
            ) : (
              <ul className="space-y-2.5">
                {slacks.map((m, i) => (
                  <li key={i} className="rounded-2xl border border-border bg-surface p-4">
                    <div className="flex items-center gap-2 text-[12px] text-muted">
                      <span className="rounded-full bg-[#ECE7F1] px-2 py-0.5 font-semibold text-[#7A6E9C]">{m.workspaceName}</span>
                      <span className="truncate">{m.channel ? `#${m.channel}` : 'DM'} · {m.user}</span>
                      <span className="ml-auto shrink-0">{when(slackTsMs(m.ts), tz)}</span>
                    </div>
                    <p className="mt-1.5 text-[13.5px] leading-snug text-text">{m.text}</p>
                    {m.permalink && (
                      <a href={m.permalink} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-[12px] font-semibold text-accent hover:underline">
                        Open in Slack
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {nothing && (
            <p className="text-[13px] text-muted">Nothing found across email or Slack for “{ran}”. Try a name or a distinctive phrase.</p>
          )}
        </div>
      )}
    </div>
  );
}
