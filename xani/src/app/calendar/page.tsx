'use client';

import { DataView } from '@/components/ui/DataView';
import { fetchCalendar } from '@/lib/marvin-data';

export default function CalendarPage() {
  return (
    <DataView
      title="Calendar"
      subtitle="Today · Europe/Berlin"
      fetcher={fetchCalendar}
      isEmpty={(d) => d.events.length === 0}
      notConnectedNote="Add GOOGLE_CALENDAR_CLIENT_ID/SECRET/REFRESH_TOKEN to xani/.env.local and restart the sidecar. Creating or changing events always requires your confirmation."
      emptyNote="Nothing on the calendar today."
      render={(d) =>
        d.events.map((e, i) => (
          <li key={i} className="flex items-center justify-between rounded-xl border border-line bg-paper-card p-4">
            <span className="text-sm text-ink">{e.title}</span>
            <span className="text-xs text-ink-soft">
              {e.allDay
                ? 'All day'
                : e.start
                  ? new Date(e.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                  : ''}
            </span>
          </li>
        ))
      }
    />
  );
}
