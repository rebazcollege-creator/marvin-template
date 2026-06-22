'use client';

import { DataView } from '@/components/ui/DataView';
import { fetchBuffer } from '@/lib/marvin-data';

export default function BufferPage() {
  return (
    <DataView
      title="Buffer"
      subtitle="Queue · 7 channels"
      fetcher={fetchBuffer}
      isEmpty={(d) => d.drafts === 0 && d.scheduled === 0}
      notConnectedNote="Buffer connects via Direct MCP (org 68d1dabf16b86596e286a44b) — pending MCP wiring. Draft/scheduled counts per platform will appear here. Publishing always requires your confirmation."
      emptyNote="Nothing in the Buffer queue."
      render={(d) => [
        <li key="totals" className="flex items-center justify-between rounded-xl border border-line bg-paper-card p-4">
          <span className="text-sm text-ink-soft">Drafts / Scheduled</span>
          <span className="tabular-nums text-sm text-ink">
            {d.drafts} / {d.scheduled}
          </span>
        </li>,
        ...d.byPlatform.map((p) => (
          <li key={p.platform} className="flex items-center justify-between rounded-xl border border-line bg-paper-card p-4">
            <span className="text-sm text-ink">{p.platform}</span>
            <span className="tabular-nums text-sm text-ink-soft">{p.count}</span>
          </li>
        )),
      ]}
    />
  );
}
