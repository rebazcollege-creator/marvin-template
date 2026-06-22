import Link from 'next/link';

const NAV = [
  { label: 'Home', href: '/' },
  { label: 'Inbox', href: '/inbox' },
  { label: 'Trello', href: '/trello' },
  { label: 'Calendar', href: '/calendar' },
  { label: 'Buffer', href: '/buffer' },
  { label: 'Slack', href: '/slack' },
  { label: 'Memory', href: '/memory' },
  { label: 'Settings', href: '/settings' },
];

const STUDIOS = [
  { label: 'Amargi — Captions', href: '/studios/amargi' },
  { label: 'LeadStories — Fact-check', href: '/studios/leadstories' },
  { label: 'Moonshot — OIC report', href: '/studios/moonshot' },
  { label: 'Email drafter', href: '/studios/email' },
  { label: 'Slack composer', href: '/studios/slack' },
];

export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 border-r border-line bg-paper-card px-5 py-6">
      <Link href="/" className="wordmark block text-3xl text-ink">
        Xanî
      </Link>
      <p className="mt-1 text-xs text-ink-soft">Personal OS · MARVIN</p>

      <nav className="mt-8 space-y-1">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-md px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-paper hover:text-ink"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <p className="mt-8 px-3 text-xs font-medium uppercase tracking-wide text-ink-soft">
        Studios
      </p>
      <nav className="mt-2 space-y-1">
        {STUDIOS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-md px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-paper hover:text-ink"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
