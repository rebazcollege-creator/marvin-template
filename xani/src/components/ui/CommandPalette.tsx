'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';

/**
 * ⌘K / Ctrl+K command palette — the keyboard-first spine every fast tool
 * (Linear, Raycast, Superhuman, Shortwave) converges on. Phase 1 covers
 * navigation; compose/search/triage commands attach here as the runtime and
 * connectors land, so this stays the single entry point for "do anything".
 */

type Item = { label: string; href: string; keywords?: string };

const NAV: Item[] = [
  { label: 'Home / Briefing', href: '/' },
  { label: 'Inbox', href: '/inbox', keywords: 'email gmail mail' },
  { label: 'Drive', href: '/drive', keywords: 'files documents' },
  { label: 'Trello', href: '/trello', keywords: 'cards board tasks' },
  { label: 'Calendar', href: '/calendar', keywords: 'events schedule' },
  { label: 'Buffer', href: '/buffer', keywords: 'social queue posts' },
  { label: 'Slack', href: '/slack', keywords: 'messages mentions' },
  { label: 'Memory', href: '/memory', keywords: 'learned facts adjustments' },
  { label: 'Settings', href: '/settings', keywords: 'prompts days off models' },
];

const ASSISTANT: Item[] = [
  { label: 'Activity', href: '/activity', keywords: 'feed open loops' },
  { label: 'Notetaker', href: '/notetaker', keywords: 'meeting notes transcript' },
  { label: 'Automations', href: '/automations', keywords: 'standing instructions schedule' },
  { label: 'Connections', href: '/connections', keywords: 'integrations connect' },
  { label: 'Approvals', href: '/approvals', keywords: 'autonomy trust gate' },
];

const STUDIOS: Item[] = [
  { label: 'Studio — Amargi caption writer', href: '/studios/amargi', keywords: 'instagram x threads' },
  { label: 'Studio — LeadStories fact-check', href: '/studios/leadstories', keywords: 'verify claim' },
  { label: 'Studio — Moonshot OIC report', href: '/studios/moonshot', keywords: 'referral' },
  { label: 'Studio — Email drafter', href: '/studios/email' },
  { label: 'Studio — Slack composer', href: '/studios/slack' },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('xani:command', onOpen);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('xani:command', onOpen);
    };
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="fixed left-1/2 top-28 z-50 w-[36rem] max-w-[90vw] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-paper-card shadow-xl"
    >
      <Command.Input
        placeholder="Jump to… (⌘K)"
        className="w-full border-b border-line bg-transparent px-5 py-4 text-sm text-ink outline-none placeholder:text-ink-soft"
      />
      <Command.List className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-sm text-ink-soft">
          No matches.
        </Command.Empty>
        <Command.Group
          heading="Navigate"
          className="px-2 py-1 text-xs uppercase tracking-wide text-ink-soft"
        >
          {NAV.map((item) => (
            <Command.Item
              key={item.href}
              value={`${item.label} ${item.keywords ?? ''}`}
              onSelect={() => go(item.href)}
              className="cursor-pointer rounded-lg px-3 py-2 text-sm text-ink data-[selected=true]:bg-paper data-[selected=true]:text-terracotta"
            >
              {item.label}
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group
          heading="Studios"
          className="px-2 py-1 text-xs uppercase tracking-wide text-ink-soft"
        >
          {STUDIOS.map((item) => (
            <Command.Item
              key={item.href}
              value={`${item.label} ${item.keywords ?? ''}`}
              onSelect={() => go(item.href)}
              className="cursor-pointer rounded-lg px-3 py-2 text-sm text-ink data-[selected=true]:bg-paper data-[selected=true]:text-terracotta"
            >
              {item.label}
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group
          heading="Assistant"
          className="px-2 py-1 text-xs uppercase tracking-wide text-ink-soft"
        >
          {ASSISTANT.map((item) => (
            <Command.Item
              key={item.href}
              value={`${item.label} ${item.keywords ?? ''}`}
              onSelect={() => go(item.href)}
              className="cursor-pointer rounded-lg px-3 py-2 text-sm text-ink data-[selected=true]:bg-paper data-[selected=true]:text-terracotta"
            >
              {item.label}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
