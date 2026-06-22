'use client';

import { DataView } from '@/components/ui/DataView';
import { fetchSlack } from '@/lib/marvin-data';

export default function SlackPage() {
  return (
    <DataView
      title="Slack"
      subtitle="The Amargi · monitor"
      fetcher={fetchSlack}
      isEmpty={(d) => d.messages.length === 0}
      notConnectedNote="Add SLACK_AMARGI_BOT_TOKEN to xani/.env.local and restart the sidecar to monitor #general and #tt-arabic. LeadStories Slack is monitor-only — MARVIN never posts there."
      emptyNote="No recent messages in the watched channels."
      render={(d) =>
        d.messages.map((m, i) => (
          <li key={i} className="rounded-xl border border-line bg-paper-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-ink-soft">#{m.channel}</span>
              {m.emergency ? (
                <span className="rounded-full bg-terracotta px-2 py-0.5 text-xs text-paper">Emergency</span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-ink">{m.text}</p>
          </li>
        ))
      }
    />
  );
}
