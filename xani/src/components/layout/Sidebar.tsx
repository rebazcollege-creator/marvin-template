'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

type Item = { label: string; href: string; icon: string };

const PRIMARY: Item[] = [
  { label: 'Home', href: '/', icon: 'home' },
  { label: 'Inbox', href: '/inbox', icon: 'inbox' },
  { label: 'Drive', href: '/drive', icon: 'drive' },
  { label: 'Trello', href: '/trello', icon: 'trello' },
  { label: 'Calendar', href: '/calendar', icon: 'calendar' },
  { label: 'Buffer', href: '/buffer', icon: 'buffer' },
  { label: 'Slack', href: '/slack', icon: 'slack' },
  { label: 'Memory', href: '/memory', icon: 'memory' },
  { label: 'Settings', href: '/settings', icon: 'settings' },
];

const STUDIOS: Item[] = [
  { label: 'Amargi', href: '/studios/amargi', icon: 'studio' },
  { label: 'LeadStories', href: '/studios/leadstories', icon: 'studio' },
  { label: 'Moonshot', href: '/studios/moonshot', icon: 'studio' },
];

const ASSISTANT: Item[] = [
  { label: 'Activity', href: '/activity', icon: 'activity' },
  { label: 'Notetaker', href: '/notetaker', icon: 'notetaker' },
  { label: 'Automations', href: '/automations', icon: 'automations' },
  { label: 'Connections', href: '/connections', icon: 'connections' },
  { label: 'Approvals', href: '/approvals', icon: 'approvals' },
];

function Icon({ name }: { name: string }) {
  const p = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'home': return (<svg {...p}><path d="M3 10.5 12 4l9 6.5" /><path d="M5 9.5V20h14V9.5" /></svg>);
    case 'inbox': return (<svg {...p}><path d="M4 13h4l2 3h4l2-3h4" /><path d="M4 13 6 5h12l2 8v6H4z" /></svg>);
    case 'drive': return (<svg {...p}><path d="M8 4h8l4 7-4 7H8L4 11z" /></svg>);
    case 'trello': return (<svg {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="7" y="7" width="3.5" height="9" rx="1" /><rect x="13.5" y="7" width="3.5" height="5" rx="1" /></svg>);
    case 'calendar': return (<svg {...p}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 9h16M8 3v4M16 3v4" /></svg>);
    case 'buffer': return (<svg {...p}><path d="M12 3 21 8l-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></svg>);
    case 'slack': return (<svg {...p}><rect x="5" y="9" width="6" height="3" rx="1.5" /><rect x="12" y="5" width="3" height="6" rx="1.5" /><rect x="13" y="12" width="6" height="3" rx="1.5" /><rect x="9" y="13" width="3" height="6" rx="1.5" /></svg>);
    case 'memory': return (<svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 4v3M12 17v3M4 12h3M17 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" /></svg>);
    case 'settings': return (<svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.3-2.5H9.4l-.3 2.5a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.3 2.5h4.2l.3-2.5a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.5a7 7 0 0 0 .1-1z" /></svg>);
    case 'studio': return (<svg {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.5" /></svg>);
    case 'activity': return (<svg {...p}><path d="M3 12h4l2 6 4-12 2 6h6" /></svg>);
    case 'notetaker': return (<svg {...p}><rect x="6" y="3" width="12" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>);
    case 'automations': return (<svg {...p}><path d="M13 3 5 13h6l-1 8 8-10h-6z" /></svg>);
    case 'connections': return (<svg {...p}><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.2 11 16 7M8.2 13 16 17" /></svg>);
    case 'approvals': return (<svg {...p}><path d="M12 3 5 6v5c0 4 3 7 7 8 4-1 7-4 7-8V6z" /><path d="m9.5 12 1.8 1.8L15 10" /></svg>);
    default: return (<svg {...p}><circle cx="12" cy="12" r="3" /></svg>);
  }
}

function NavLink({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
        active
          ? 'bg-accent-soft font-semibold text-text'
          : 'text-text-2 hover:bg-hover hover:text-text'
      }`}
    >
      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-accent" />}
      <span className={active ? 'text-accent' : 'text-muted'}>
        <Icon name={item.icon} />
      </span>
      {item.label}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 mt-6 px-3 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted">
      {children}
    </p>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <aside className="gm-rail flex w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface px-3.5 pb-4 pt-5">
      <div className="flex items-start justify-between px-2">
        <Link href="/" className="block">
          <span className="wordmark block text-3xl font-semibold leading-none text-text">Xanî</span>
          <span className="mt-1 block text-[11.5px] text-text-2">Personal OS · MARVIN</span>
        </Link>
        <ThemeToggle />
      </div>

      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('xani:command'))}
        className="mt-4 flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-xs text-text-2 transition-colors hover:bg-hover"
      >
        <span>Search & commands</span>
        <kbd className="rounded border border-border bg-bg px-1.5 py-0.5 font-sans text-[10px]">⌘K</kbd>
      </button>

      <nav className="mt-4 space-y-0.5">
        {PRIMARY.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>

      <SectionLabel>Studios</SectionLabel>
      <nav className="space-y-0.5">
        {STUDIOS.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>

      <SectionLabel>Assistant</SectionLabel>
      <nav className="space-y-0.5">
        {ASSISTANT.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>
    </aside>
  );
}
