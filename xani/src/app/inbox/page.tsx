'use client';

import { DataView } from '@/components/ui/DataView';
import { fetchInbox } from '@/lib/marvin-data';

export default function InboxPage() {
  return (
    <DataView
      title="Inbox"
      subtitle="Unified Gmail · 5 accounts"
      fetcher={fetchInbox}
      isEmpty={(d) => d.messages.length === 0}
      notConnectedNote="Add GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN_1..5 to xani/.env.local and restart the sidecar to see unread mail across your accounts."
      emptyNote="No unread mail across your accounts right now."
      render={(d) =>
        d.messages.map((m, i) => (
          <li key={i} className="rounded-xl border border-line bg-paper-card p-4">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-paper px-2 py-0.5 text-xs uppercase tracking-wide text-ink-soft">
                {m.account}
              </span>
              <span className="text-xs text-ink-soft">
                {m.receivedAt ? new Date(m.receivedAt).toLocaleString('en-GB') : ''}
              </span>
            </div>
            <p className="mt-1 text-sm font-medium text-ink">{m.subject || '(no subject)'}</p>
            <p className="text-xs text-ink-soft">{m.from}</p>
            <p className="mt-1 text-sm text-ink-soft">{m.snippet}</p>
          </li>
        ))
      }
    />
  );
}
