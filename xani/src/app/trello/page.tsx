'use client';

import { DataView } from '@/components/ui/DataView';
import { fetchTrello } from '@/lib/marvin-data';

export default function TrelloPage() {
  return (
    <DataView
      title="Trello"
      subtitle="Amargi Social Media Board"
      fetcher={fetchTrello}
      isEmpty={(d) => d.cards.length === 0}
      notConnectedNote="Trello connects via Zapier MCP (board 683dafe308be04e369b8434c) — pending MCP wiring. Cards will appear here, urgent first. Moving a card always requires your confirmation."
      emptyNote="No cards awaiting action."
      render={(d) =>
        d.cards.map((c, i) => (
          <li key={i} className="flex items-center justify-between rounded-xl border border-line bg-paper-card p-4">
            <div>
              <a href={c.url} className="text-sm font-medium text-ink hover:text-terracotta">
                {c.name}
              </a>
              {c.due ? (
                <p className="text-xs text-ink-soft">due {new Date(c.due).toLocaleDateString('en-GB')}</p>
              ) : null}
            </div>
            {c.urgent ? (
              <span className="rounded-full bg-terracotta px-2 py-0.5 text-xs text-paper">Urgent</span>
            ) : null}
          </li>
        ))
      }
    />
  );
}
