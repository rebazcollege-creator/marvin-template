'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { ensureStorageReady } from '@/lib/storage';
import { pendingCount } from '@/lib/approvals';
import { pingRuntime } from '@/lib/marvin-client';

type Item = { label: string; href: string; icon: string };
type Studio = { label: string; href: string; dot: string };

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

const ASSISTANT: Item[] = [
  { label: 'Train', href: '/train', icon: 'train' },
  { label: 'Routines', href: '/routines', icon: 'routines' },
  { label: 'Activity', href: '/activity', icon: 'activity' },
  { label: 'Notetaker', href: '/notetaker', icon: 'notetaker' },
  { label: 'Automations', href: '/automations', icon: 'automations' },
  { label: 'Connections', href: '/connections', icon: 'connections' },
  { label: 'Approvals', href: '/approvals', icon: 'approvals' },
];

const STUDIOS: Studio[] = [
  { label: 'Amargi — Captions', href: '/studios/amargi', dot: '#C0613A' },
  { label: 'LeadStories — Fact-check', href: '/studios/leadstories', dot: '#D89A4E' },
  { label: 'Moonshot — OIC report', href: '/studios/moonshot', dot: 'var(--text-2)' },
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
    case 'activity': return (<svg {...p}><path d="M3 12h4l2 6 4-12 2 6h6" /></svg>);
    case 'notetaker': return (<svg {...p}><rect x="6" y="3" width="12" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>);
    case 'automations': return (<svg {...p}><path d="M13 3 5 13h6l-1 8 8-10h-6z" /></svg>);
    case 'connections': return (<svg {...p}><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.2 11 16 7M8.2 13 16 17" /></svg>);
    case 'approvals': return (<svg {...p}><path d="M12 3 5 6v5c0 4 3 7 7 8 4-1 7-4 7-8V6z" /><path d="m9.5 12 1.8 1.8L15 10" /></svg>);
    case 'train': return (<svg {...p}><path d="M12 4 2 9l10 5 10-5z" /><path d="M6 11v4c0 1.5 2.7 3 6 3s6-1.5 6-3v-4" /></svg>);
    case 'routines': return (<svg {...p}><path d="M4 6h4M4 12h4M4 18h4" /><path d="m10.5 5 1.3 1.3L14.5 4M10.5 11l1.3 1.3L14.5 10M10.5 17l1.3 1.3 2.7-2.6" /><path d="M18 6h2M18 12h2M18 18h2" /></svg>);
    default: return (<svg {...p}><circle cx="12" cy="12" r="3" /></svg>);
  }
}

function NavLink({ item, active, badge }: { item: Item; active: boolean; badge?: number }) {
  return (
    <Link
      href={item.href}
      style={{ boxShadow: active ? 'inset 3px 0 0 var(--accent)' : undefined }}
      className={`flex items-center gap-[11px] rounded-[9px] px-[11px] py-2 text-[13.5px] transition-colors ${
        active ? 'bg-accent-soft font-semibold text-text' : 'font-medium text-text-2 hover:bg-hover hover:text-text'
      }`}
    >
      <span className={active ? 'text-accent' : 'text-muted'}>
        <Icon name={item.icon} />
      </span>
      <span className="flex-1">{item.label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="grid h-[18px] min-w-[18px] place-items-center rounded-[9px] bg-accent-soft px-[5px] text-[10.5px] font-bold text-text-2">
          {badge}
        </span>
      )}
    </Link>
  );
}

function StudioLink({ studio, active }: { studio: Studio; active: boolean }) {
  return (
    <Link
      href={studio.href}
      className={`flex items-center gap-2.5 rounded-[9px] px-[11px] py-[7px] text-[12.5px] transition-colors ${
        active ? 'bg-accent-soft font-semibold text-text' : 'text-text-2 hover:bg-hover hover:text-text'
      }`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: studio.dot }} />
      <span>{studio.label}</span>
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-[7px] pt-[18px] text-[10.5px] font-semibold uppercase tracking-[0.09em] text-muted">
      {children}
    </p>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const [pending, setPending] = useState(0);
  const [runtimeUp, setRuntimeUp] = useState<boolean | null>(null);

  useEffect(() => {
    const read = () => ensureStorageReady().then(() => setPending(pendingCount()));
    read();
    window.addEventListener('xani:approvals-changed', read);
    return () => window.removeEventListener('xani:approvals-changed', read);
  }, []);

  useEffect(() => {
    let alive = true;
    const check = () => pingRuntime().then((up) => alive && setRuntimeUp(up));
    check();
    const id = window.setInterval(check, 15000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const runtimeDot = runtimeUp === null ? 'var(--muted)' : runtimeUp ? '#6E8B6A' : '#D89A4E';
  const runtimeLabel = runtimeUp === null ? 'Checking runtime…' : runtimeUp ? 'Runtime connected' : 'Runtime offline';

  return (
    <aside className="gm-rail flex w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface px-3.5 pb-3.5 pt-[22px]">
      <div className="flex items-start justify-between px-2 pb-0.5">
        <Link href="/" className="block">
          <span className="wordmark block text-[30px] font-semibold leading-none tracking-[0.01em] text-text">Xanî</span>
          <span className="mt-[5px] block text-[11.5px] tracking-[0.02em] text-text-2">Personal OS · MARVIN</span>
        </Link>
        <ThemeToggle />
      </div>

      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('xani:command'))}
        className="mx-1 mb-3.5 mt-4 flex items-center gap-2.5 rounded-[11px] border border-border bg-bg px-[11px] py-[9px] text-text-2 transition-colors hover:bg-hover"
      >
        <kbd className="rounded-[5px] border border-[#DBD2C0] bg-surface px-1.5 py-px font-sans text-[12px] font-semibold text-text-2">⌘K</kbd>
        <span className="text-[12.5px]">for anything</span>
      </button>

      <nav className="flex flex-col gap-px">
        {PRIMARY.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>

      <SectionLabel>Assistant</SectionLabel>
      <nav className="flex flex-col gap-px">
        {ASSISTANT.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(item.href)}
            badge={item.href === '/approvals' ? pending : undefined}
          />
        ))}
      </nav>

      <SectionLabel>Studios</SectionLabel>
      <nav className="flex flex-col gap-px">
        {STUDIOS.map((studio) => (
          <StudioLink key={studio.href} studio={studio} active={isActive(studio.href)} />
        ))}
      </nav>

      <div className="mt-auto flex items-center gap-2.5 border-t border-border px-2.5 pb-0.5 pt-2.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: runtimeDot }} />
        <span className="text-[11.5px] text-text-2">{runtimeLabel}</span>
        <div className="flex-1" />
        <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-accent text-[12px] font-semibold text-on-accent">R</span>
      </div>
    </aside>
  );
}
