'use client';

import { useEffect, useState } from 'react';
import { ensureStorageReady } from '@/lib/storage';
import {
  CONNECTIONS,
  getConnections,
  setConnection,
  removeConnection,
  type Connection,
  type ConnState,
} from '@/lib/connections';
import { ConnectFlow } from '@/components/connections/ConnectFlow';
import { LivePreview } from '@/components/connections/LivePreview';
import { logActivity } from '@/lib/activity';
import { getCredStatus } from '@/lib/marvin-client';

/** Env-vars the runtime needs before an integration can actually fetch/act. */
const REQUIRED: Record<string, string[]> = {
  gmail: ['GMAIL_CLIENT_ID_1', 'GMAIL_CLIENT_SECRET_1', 'GMAIL_REFRESH_TOKEN_1'],
  gcal: ['GOOGLE_CALENDAR_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_SECRET', 'GOOGLE_CALENDAR_REFRESH_TOKEN'],
  drive: ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_REFRESH_TOKEN'],
  slack: ['SLACK_AMARGI_BOT_TOKEN'],
  trello: ['TRELLO_API_KEY', 'TRELLO_TOKEN', 'TRELLO_BOARD_ID'],
  buffer: ['BUFFER_ACCESS_TOKEN'],
};

function Card({ c, state, credsReady, onOpen }: { c: Connection; state?: ConnState; credsReady: boolean; onOpen: () => void }) {
  const on = !!state?.connected;
  const hasEndpoint = c.id in REQUIRED;
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-[18px]">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] text-base font-bold" style={{ background: c.tint, color: c.edge }}>
          {c.glyph}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-text">{c.name}</div>
          <div className="text-[11.5px] text-muted">{c.category}</div>
        </div>
        {on && (
          credsReady ? (
            <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-green-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-green" />
              {state?.accounts && state.accounts.length > 1 ? `${state.accounts.length} linked` : 'Live'}
            </span>
          ) : (
            <span className="ml-auto flex items-center gap-1 rounded-full bg-gold-soft px-2 py-0.5 text-[10.5px] font-semibold text-gold">
              {hasEndpoint ? 'Needs key' : 'Intent only'}
            </span>
          )
        )}
      </div>
      <p className="flex-1 text-[12.5px] leading-relaxed text-text-2">{c.desc}</p>
      {on && <LivePreview id={c.id} />}
      <button
        type="button"
        onClick={onOpen}
        className={`rounded-[10px] border px-3 py-2 text-xs font-semibold transition ${
          on ? 'border-border bg-bg text-text-2 hover:bg-hover' : 'border-accent bg-accent text-on-accent hover:bg-accent-dim'
        }`}
      >
        {on ? 'Manage' : 'Connect'}
      </button>
    </div>
  );
}

export default function ConnectionsPage() {
  const [map, setMap] = useState<Record<string, ConnState>>({});
  const [ready, setReady] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creds, setCreds] = useState<Record<string, boolean>>({});

  const refreshCreds = () => getCredStatus().then((s) => s && setCreds(s));

  useEffect(() => {
    ensureStorageReady().then(() => {
      setMap(getConnections());
      setReady(true);
    });
    void refreshCreds();
  }, []);

  const credsReadyFor = (id: string) => (REQUIRED[id]?.every((k) => creds[k]) ?? false);

  const active = activeId ? CONNECTIONS.find((c) => c.id === activeId) ?? null : null;

  const complete = (id: string, s: ConnState) => {
    setConnection(id, s);
    setMap(getConnections());
    void refreshCreds();
    const name = CONNECTIONS.find((c) => c.id === id)?.name ?? id;
    logActivity({ kind: 'connection', title: `Connected ${name}`, detail: s.accounts?.length ? s.accounts.join(', ') : undefined });
  };
  const disconnect = (id: string) => {
    removeConnection(id);
    setMap(getConnections());
    setActiveId(null);
    const name = CONNECTIONS.find((c) => c.id === id)?.name ?? id;
    logActivity({ kind: 'connection', title: `Disconnected ${name}` });
  };

  const connected = CONNECTIONS.filter((c) => map[c.id]?.connected);
  const available = CONNECTIONS.filter((c) => !map[c.id]?.connected);

  return (
    <div className="mx-auto max-w-[820px] px-8 pb-16 pt-7">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-text">Connections</h1>
        <p className="mt-1 text-[13px] text-muted">
          Everything MARVIN can see and act on. Connect more to widen what it can do for you — each one asks
          how you’d like to connect and exactly what to grant.
        </p>
      </header>

      {ready && connected.length > 0 && (
        <>
          <div className="mb-2.5 text-[11px] font-bold tracking-[0.08em] text-muted">CONNECTED</div>
          <div className="mb-8 grid grid-cols-2 gap-2.5 md:grid-cols-3">
            {connected.map((c) => (
              <Card key={c.id} c={c} state={map[c.id]} credsReady={credsReadyFor(c.id)} onOpen={() => setActiveId(c.id)} />
            ))}
          </div>
        </>
      )}

      <div className="mb-2.5 text-[11px] font-bold tracking-[0.08em] text-muted">
        {connected.length > 0 ? 'AVAILABLE' : 'AVAILABLE TO CONNECT'}
      </div>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
        {(ready ? available : CONNECTIONS).map((c) => (
          <Card key={c.id} c={c} state={map[c.id]} credsReady={credsReadyFor(c.id)} onOpen={() => setActiveId(c.id)} />
        ))}
      </div>

      {active && (
        <ConnectFlow
          connection={active}
          state={map[active.id]}
          onComplete={(s) => complete(active.id, s)}
          onDisconnect={() => disconnect(active.id)}
          onClose={() => setActiveId(null)}
        />
      )}
    </div>
  );
}
