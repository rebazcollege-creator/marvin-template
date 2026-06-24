'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { methodsFor, GMAIL_ACCOUNTS, type ConnectMethod } from '@/lib/connect-flows';
import type { Connection, ConnState } from '@/lib/connections';
import { isTauri } from '@/lib/storage';
import { setRuntimeCred, startOAuth } from '@/lib/marvin-client';

/** Integrations with a real one-click loopback sign-in, + their setup hints. */
const OAUTH: Record<string, { label: string; docsUrl: string; docsLabel: string; note: string }> = {
  gmail: { label: 'Sign in with Google', docsUrl: 'https://console.cloud.google.com/apis/credentials', docsLabel: 'Open Google Cloud →', note: 'Create a Google OAuth client (type: Desktop app) and paste its Client ID + secret. Then sign in — Google opens, you approve, it connects.' },
  gcal: { label: 'Sign in with Google', docsUrl: 'https://console.cloud.google.com/apis/credentials', docsLabel: 'Open Google Cloud →', note: 'Create a Google OAuth client (type: Desktop app) and paste its Client ID + secret. Then sign in — Google opens, you approve, it connects.' },
  drive: { label: 'Sign in with Google', docsUrl: 'https://console.cloud.google.com/apis/credentials', docsLabel: 'Open Google Cloud →', note: 'Create a Google OAuth client (type: Desktop app) and paste its Client ID + secret. Then sign in — Google opens, you approve, it connects.' },
  github: { label: 'Sign in with GitHub', docsUrl: 'https://github.com/settings/developers', docsLabel: 'Open GitHub OAuth Apps →', note: 'Create a GitHub OAuth App with Authorization callback URL exactly http://127.0.0.1:8788, then paste its Client ID + secret. Then sign in — GitHub opens, you approve, it connects.' },
};

/**
 * The connection flow. Walks the real paths for an integration:
 *   manage (if connected) ⇄ choose method → oauth scopes / credentials form
 *   → connecting → connected. Honest throughout: OAuth explains it opens the
 *   provider's consent screen in the packaged app; forms name the .env/keychain
 *   keys the runtime reads. No fake "connected" — the record captures method,
 *   accounts and scopes so manage is real.
 */

type Step = 'manage' | 'choose' | 'method' | 'connecting' | 'done' | 'error';

export function ConnectFlow({
  connection,
  state,
  onComplete,
  onDisconnect,
  onClose,
}: {
  connection: Connection;
  state?: ConnState;
  onComplete: (s: ConnState) => void;
  onDisconnect: () => void;
  onClose: () => void;
}) {
  const methods = useMemo(() => methodsFor(connection.id, connection.name), [connection]);
  const [step, setStep] = useState<Step>(state?.connected ? 'manage' : 'choose');
  const [method, setMethod] = useState<ConnectMethod | null>(null);
  const [scopes, setScopes] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [account, setAccount] = useState('');
  const [error, setError] = useState('');

  // Gmail is multi-account: `account` holds the chosen role, which fixes the slot.
  const isGmail = connection.id === 'gmail';
  const gmailSlot = isGmail ? GMAIL_ACCOUNTS.find((a) => a.role === account)?.slot : undefined;
  const gmailNeedsAccount = isGmail && !account;

  const pick = (m: ConnectMethod) => {
    setMethod(m);
    setScopes((m.scopes ?? []).filter((s) => s.required).map((s) => s.id));
    setValues({});
    setAccount('');
    setError('');
    setStep('method');
  };

  const finish = async () => {
    if (!method) return;
    setStep('connecting');
    // On desktop, credential-form values are written to the OS keychain (the Rust
    // command), so the sidecar can read them at next spawn — tokens never touch the
    // renderer beyond this transient write. On web/dev there's no keychain, so the
    // connection is recorded and the user adds the keys to .env (per the note).
    if (method.kind === 'form') {
      for (const f of method.fields ?? []) {
        const v = (values[f.key] ?? '').trim();
        if (!f.envKey || !v) continue;
        // Gmail credentials are per-account: route the _1 keys to the chosen slot
        // so connecting a second account never overwrites the first.
        const envKey = isGmail && gmailSlot ? f.envKey.replace(/_1$/, `_${gmailSlot}`) : f.envKey;
        if (isTauri()) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            await invoke('set_integration_cred', { name: envKey, value: v });
          } catch {
            /* still record the connection below */
          }
        } else {
          // dev: hand the credential to the running sidecar so it takes effect now
          await setRuntimeCred(envKey, v);
        }
      }
    } else {
      await new Promise((r) => window.setTimeout(r, 500));
    }
    const accounts = method.multiAccount
      ? Array.from(new Set([...(state?.accounts ?? []), account].filter(Boolean)))
      : undefined;
    onComplete({
      connected: true,
      method: method.id,
      accounts,
      scopes: method.scopes ? scopes : undefined,
      connectedAt: new Date().toISOString(),
    });
    setStep('done');
  };

  const oauthCfg = OAUTH[connection.id];
  const isOAuth = !!oauthCfg;

  const oauthSignIn = async () => {
    const clientId = (values.clientId ?? '').trim();
    const clientSecret = (values.clientSecret ?? '').trim();
    if (!clientId || !clientSecret) {
      setError('Enter your Client ID and secret first.');
      return;
    }
    if (gmailNeedsAccount) {
      setError('Choose which account you’re connecting first.');
      return;
    }
    setStep('connecting');
    const r = await startOAuth(connection.id, clientId, clientSecret, gmailSlot);
    if (r.ok) {
      const label = isGmail ? GMAIL_ACCOUNTS.find((a) => a.slot === gmailSlot)?.role : r.account;
      const merged = Array.from(new Set([...(state?.accounts ?? []), label, r.account].filter(Boolean))) as string[];
      onComplete({
        connected: true,
        method: 'oauth',
        accounts: merged.length ? merged : undefined,
        scopes,
        connectedAt: new Date().toISOString(),
      });
      setStep('done');
    } else {
      setError(r.error ?? `Could not connect to ${connection.name}.`);
      setStep('error');
    }
  };

  const canFinish =
    (method?.kind === 'oauth'
      ? (!method.multiAccount || account.trim().length > 0) && scopes.length > 0
      : (method?.fields ?? []).every((f) => (values[f.key] ?? '').trim().length > 0)) &&
    !gmailNeedsAccount;

  const title =
    step === 'manage'
      ? `${connection.name}`
      : step === 'choose'
        ? `Connect ${connection.name}`
        : step === 'method' && method
          ? method.label
          : `Connect ${connection.name}`;

  const subtitle =
    step === 'choose'
      ? 'How would you like to connect?'
      : step === 'method' && method
        ? method.blurb
        : step === 'manage'
          ? 'Manage this connection'
          : undefined;

  return (
    <Modal open onClose={onClose} title={title} subtitle={subtitle}>
      <div className="flex items-center gap-3 pb-4">
        <span className="grid h-10 w-10 place-items-center rounded-[11px] text-base font-bold" style={{ background: connection.tint, color: connection.edge }}>
          {connection.glyph}
        </span>
        <div className="text-[12.5px] text-text-2">{connection.category}</div>
      </div>

      {/* CHOOSE METHOD */}
      {step === 'choose' && (
        <div className="space-y-2.5">
          {methods.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => pick(m)}
              className="flex w-full items-center gap-3 rounded-[13px] border border-border bg-bg px-4 py-3.5 text-left transition hover:border-accent hover:bg-accent-soft"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent">
                {m.kind === 'oauth' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7 11V7a5 5 0 0 1 10 0v4M5 11h14v9H5z" /></svg>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-[13.5px] font-semibold text-text">{m.label}</span>
                  {m.recommended && <span className="rounded-full bg-green-soft px-2 py-0.5 text-[10px] font-semibold text-green-ink">Recommended</span>}
                </span>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-text-2">{m.blurb}</span>
              </span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="shrink-0 text-muted" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
            </button>
          ))}
        </div>
      )}

      {/* METHOD: OAUTH */}
      {step === 'method' && method?.kind === 'oauth' && (
        <div className="space-y-4">
          {isGmail && <GmailAccountPicker selected={account} onSelect={setAccount} existing={state?.accounts ?? []} />}
          {isOAuth && oauthCfg && (
            <div className="space-y-2.5">
              <p className="rounded-[11px] border border-border bg-bg px-3.5 py-2.5 text-[11.5px] leading-relaxed text-text-2">
                One-time setup: {oauthCfg.note}{' '}
                <a href={oauthCfg.docsUrl} target="_blank" rel="noreferrer" className="font-semibold text-accent hover:underline">{oauthCfg.docsLabel}</a>
              </p>
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-text-2">Client ID</span>
                <input value={values.clientId ?? ''} onChange={(e) => setValues((v) => ({ ...v, clientId: e.target.value }))} placeholder="Client ID" className="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-text outline-none focus:border-accent" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-text-2">Client secret</span>
                <input type="password" value={values.clientSecret ?? ''} onChange={(e) => setValues((v) => ({ ...v, clientSecret: e.target.value }))} placeholder="Client secret" className="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-text outline-none focus:border-accent" />
              </label>
            </div>
          )}
          <div>
            <div className="mb-2 text-[11px] font-bold tracking-[0.07em] text-muted">WHAT MARVIN MAY DO</div>
            <div className="space-y-1.5">
              {(method.scopes ?? []).map((s) => {
                const on = scopes.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={s.required}
                    onClick={() => setScopes((cur) => (on ? cur.filter((x) => x !== s.id) : [...cur, s.id]))}
                    className={`flex w-full items-start gap-3 rounded-[11px] border px-3.5 py-2.5 text-left transition ${
                      on ? 'border-accent/40 bg-accent-soft' : 'border-border bg-bg hover:bg-hover'
                    } ${s.required ? 'cursor-default' : ''}`}
                  >
                    <span className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border ${on ? 'border-accent bg-accent text-on-accent' : 'border-border'}`}>
                      {on && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7" /></svg>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[13px] font-medium text-text">
                        {s.label}
                        {s.required && <span className="text-[10.5px] font-normal text-muted">required</span>}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-text-2">{s.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {!isOAuth && (
            <p className="rounded-[11px] border border-border bg-bg px-3.5 py-2.5 text-[11.5px] leading-relaxed text-muted">
              In the packaged app this opens {connection.name}’s sign-in and stores the token in your OS keychain.
              {method.envHint && <span className="mt-1 block">Runtime reads: <code className="text-text-2">{method.envHint}</code></span>}
            </p>
          )}
          {isOAuth && oauthCfg ? (
            <div className="flex items-center justify-between pt-1">
              <button type="button" onClick={() => setStep('choose')} className="text-[13px] font-medium text-text-2 hover:text-text">← Back</button>
              <button
                type="button"
                onClick={() => void oauthSignIn()}
                disabled={!(values.clientId ?? '').trim() || !(values.clientSecret ?? '').trim() || gmailNeedsAccount}
                className="flex items-center gap-2 rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg>
                {oauthCfg.label}
              </button>
            </div>
          ) : (
            <FlowButtons
              backTo={() => setStep('choose')}
              onConfirm={finish}
              confirmLabel={method.multiAccount ? 'Continue' : 'Continue'}
              disabled={!canFinish}
            />
          )}
        </div>
      )}

      {/* METHOD: FORM */}
      {step === 'method' && method?.kind === 'form' && (
        <div className="space-y-3.5">
          {isGmail && <GmailAccountPicker selected={account} onSelect={setAccount} existing={state?.accounts ?? []} />}
          {(method.fields ?? []).map((f) => (
            <label key={f.key} className="block">
              <span className="mb-1 block text-[12px] font-semibold text-text-2">{f.label}</span>
              <input
                type={f.type ?? 'text'}
                value={values[f.key] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 text-[13.5px] text-text outline-none focus:border-accent"
              />
              {f.help && <span className="mt-1 block text-[11.5px] text-muted">{f.help}</span>}
            </label>
          ))}
          {method.docsUrl && (
            <a href={method.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-accent hover:underline">
              Get these from {method.docsLabel}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M9 7h8v8" /></svg>
            </a>
          )}
          <p className="rounded-[11px] border border-border bg-bg px-3.5 py-2.5 text-[11.5px] leading-relaxed text-muted">
            These are stored in your OS keychain when packaged (or your local <code className="text-text-2">.env</code> in dev) and read only by MARVIN’s runtime.
            {method.envHint && <span className="mt-1 block">Runtime reads: <code className="text-text-2">{method.envHint}</code></span>}
          </p>
          <FlowButtons backTo={() => setStep('choose')} onConfirm={finish} confirmLabel="Connect" disabled={!canFinish} />
        </div>
      )}

      {/* CONNECTING */}
      {step === 'connecting' && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-[13px] text-text-2">
            {isOAuth ? 'Waiting for sign-in in your browser… approve there, then come back.' : `Saving your ${connection.name} connection…`}
          </p>
        </div>
      )}

      {/* DONE */}
      {step === 'done' && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-green-soft text-green-ink">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7" /></svg>
          </span>
          <div>
            <p className="text-sm font-semibold text-text">{connection.name} connected</p>
            <p className="mt-1 text-[12.5px] text-text-2">
              {account ? `${account} is linked. ` : ''}MARVIN can use it once the matching credentials are in place.
            </p>
          </div>
          <div className="mt-1 flex gap-2.5">
            <button type="button" onClick={() => setStep('manage')} className="rounded-[10px] border border-border bg-bg px-4 py-2 text-[13px] font-semibold text-text-2 hover:bg-hover">
              Manage
            </button>
            <button type="button" onClick={onClose} className="rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent-dim">
              Done
            </button>
          </div>
        </div>
      )}

      {/* MANAGE */}
      {step === 'manage' && (
        <ManageView
          connection={connection}
          state={state}
          methods={methods}
          onAddAccount={() => {
            const oauth = methods.find((m) => m.multiAccount) ?? methods[0];
            if (oauth) pick(oauth);
          }}
          onReconfigure={() => setStep('choose')}
          onDisconnect={onDisconnect}
        />
      )}

      {step === 'error' && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm font-semibold text-text">Couldn’t connect</p>
          <p className="text-[12.5px] text-text-2">{error || 'Something went wrong.'}</p>
          <button type="button" onClick={() => setStep('choose')} className="rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent">
            Try again
          </button>
        </div>
      )}
    </Modal>
  );
}

/** Pick which Gmail account this connection is for — each maps to its own slot. */
function GmailAccountPicker({ selected, onSelect, existing }: { selected: string; onSelect: (role: string) => void; existing: string[] }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-bold tracking-[0.07em] text-muted">WHICH ACCOUNT?</div>
      <div className="grid grid-cols-2 gap-1.5">
        {GMAIL_ACCOUNTS.map((a) => {
          const on = selected === a.role;
          const already = existing.includes(a.role);
          return (
            <button
              key={a.role}
              type="button"
              onClick={() => onSelect(a.role)}
              className={`flex items-center justify-between gap-2 rounded-[11px] border px-3 py-2.5 text-left transition ${
                on ? 'border-accent bg-accent-soft' : 'border-border bg-bg hover:bg-hover'
              }`}
            >
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-text">{a.label}</span>
                {a.note && <span className="mt-0.5 block text-[11px] leading-snug text-muted">{a.note}</span>}
              </span>
              {already && !on && <span className="shrink-0 rounded-full bg-green-soft px-1.5 py-0.5 text-[9.5px] font-semibold text-green-ink">linked</span>}
              {on && (
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7" /></svg>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">Each account is stored separately, so connecting one never disconnects another. Re-pick an account to update its sign-in.</p>
    </div>
  );
}

function FlowButtons({ backTo, onConfirm, confirmLabel, disabled }: { backTo: () => void; onConfirm: () => void; confirmLabel: string; disabled: boolean }) {
  return (
    <div className="flex items-center justify-between pt-1">
      <button type="button" onClick={backTo} className="text-[13px] font-medium text-text-2 hover:text-text">
        ← Back
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={disabled}
        className="rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-40"
      >
        {confirmLabel}
      </button>
    </div>
  );
}

function ManageView({
  connection,
  state,
  methods,
  onAddAccount,
  onReconfigure,
  onDisconnect,
}: {
  connection: Connection;
  state?: ConnState;
  methods: ConnectMethod[];
  onAddAccount: () => void;
  onReconfigure: () => void;
  onDisconnect: () => void;
}) {
  const method = methods.find((m) => m.id === state?.method);
  const scopeLabels = (state?.scopes ?? [])
    .map((id) => method?.scopes?.find((s) => s.id === id)?.label ?? id)
    .filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="rounded-[12px] border border-border bg-bg px-4 py-3 text-[13px]">
        <div className="flex items-center gap-2 text-text">
          <span className="h-2 w-2 rounded-full bg-green" />
          Connected via <span className="font-semibold">{method?.label ?? state?.method ?? 'sign-in'}</span>
        </div>
      </div>

      {state?.accounts && state.accounts.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-bold tracking-[0.07em] text-muted">ACCOUNTS</div>
          <div className="space-y-1.5">
            {state.accounts.map((a) => (
              <div key={a} className="flex items-center justify-between rounded-[10px] border border-border bg-bg px-3.5 py-2 text-[13px] text-text">
                {a}
              </div>
            ))}
          </div>
        </div>
      )}

      {scopeLabels.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-bold tracking-[0.07em] text-muted">GRANTED</div>
          <div className="flex flex-wrap gap-1.5">
            {scopeLabels.map((l) => (
              <span key={l} className="rounded-full bg-accent-soft px-2.5 py-1 text-[11.5px] font-medium text-accent">{l}</span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {method?.multiAccount && (
          <button type="button" onClick={onAddAccount} className="rounded-[10px] border border-border bg-bg px-3.5 py-2 text-[12.5px] font-semibold text-text-2 hover:bg-hover">
            + Add another account
          </button>
        )}
        <button type="button" onClick={onReconfigure} className="rounded-[10px] border border-border bg-bg px-3.5 py-2 text-[12.5px] font-semibold text-text-2 hover:bg-hover">
          Reconfigure
        </button>
        <button type="button" onClick={onDisconnect} className="rounded-[10px] border border-border bg-bg px-3.5 py-2 text-[12.5px] font-semibold text-accent hover:bg-accent-soft">
          Disconnect {connection.name}
        </button>
      </div>
    </div>
  );
}
