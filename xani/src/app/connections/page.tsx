'use client';

import { useEffect, useState } from 'react';
import { ensureStorageReady } from '@/lib/storage';
import { CONNECTIONS, getConnected, setConnected, type Connection } from '@/lib/connections';

function Card({
  c,
  on,
  onToggle,
}: {
  c: Connection;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-[18px]">
      <div className="flex items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] text-base font-bold"
          style={{ background: c.tint, color: c.edge }}
        >
          {c.glyph}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-text">{c.name}</div>
          <div className="text-[11.5px] text-muted">{c.category}</div>
        </div>
      </div>
      <p className="flex-1 text-[12.5px] leading-relaxed text-text-2">{c.desc}</p>
      <button
        type="button"
        onClick={onToggle}
        className={`rounded-[10px] border px-3 py-2 text-xs font-semibold transition ${
          on
            ? 'border-border bg-bg text-text-2 hover:bg-hover'
            : 'border-accent bg-accent text-on-accent hover:bg-accent-dim'
        }`}
      >
        {on ? 'Disconnect' : 'Connect'}
      </button>
    </div>
  );
}

export default function ConnectionsPage() {
  const [map, setMap] = useState<Record<string, boolean>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureStorageReady().then(() => {
      setMap(getConnected());
      setReady(true);
    });
  }, []);

  const toggle = (id: string) => {
    const next = { ...map, [id]: !map[id] };
    setMap(next);
    setConnected(next);
  };

  const connected = CONNECTIONS.filter((c) => map[c.id]);
  const available = CONNECTIONS.filter((c) => !map[c.id]);

  return (
    <div className="mx-auto max-w-[820px] px-8 pb-16 pt-7">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-text">Connections</h1>
        <p className="mt-1 text-[13px] text-muted">
          Your integrations. Credentials are added in Settings, your <code className="text-text-2">.env</code> or the
          OS keychain — connecting here tells MARVIN a source is ready to use.
        </p>
      </header>

      {ready && connected.length > 0 && (
        <>
          <div className="mb-2.5 text-[11px] font-bold tracking-[0.08em] text-muted">CONNECTED</div>
          <div className="mb-8 grid grid-cols-2 gap-2.5 md:grid-cols-3">
            {connected.map((c) => (
              <Card key={c.id} c={c} on onToggle={() => toggle(c.id)} />
            ))}
          </div>
        </>
      )}

      <div className="mb-2.5 text-[11px] font-bold tracking-[0.08em] text-muted">
        {connected.length > 0 ? 'AVAILABLE' : 'AVAILABLE TO CONNECT'}
      </div>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
        {(ready ? available : CONNECTIONS).map((c) => (
          <Card key={c.id} c={c} on={false} onToggle={() => toggle(c.id)} />
        ))}
      </div>
    </div>
  );
}
