'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  WEEKDAYS,
  getSettings,
  resetSettings,
  saveSettings,
  type XaniSettings,
} from '@/lib/settings';
import { ensureStorageReady, exportAll, importAll, isTauri } from '@/lib/storage';
import { Collapsible } from '@/components/ui/Collapsible';

/**
 * Settings — the customization surface, built as collapsible sections
 * (progressive disclosure). Xanî is one user's app, so everything the brief
 * hardcoded is editable: profile, working days, model routing, channels, the
 * Anthropic key (keychain), and every prompt. All edits persist via
 * saveSettings(); Reset restores the factory defaults. Every handler from the
 * prior version is preserved — only the presentation is deepened.
 */

const PROMPT_FIELDS: { key: keyof XaniSettings['prompts']; label: string }[] = [
  { key: 'marvin', label: 'MARVIN — system prompt' },
  { key: 'amargi', label: 'Amargi — caption writer' },
  { key: 'leadstories', label: 'LeadStories — fact-check' },
  { key: 'moonshot', label: 'Moonshot — OIC report' },
];

const TIMEZONES = [
  'Europe/Berlin',
  'Europe/London',
  'Europe/Paris',
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Istanbul',
  'Asia/Dubai',
];

const CHANNELS = [
  { id: 'web', glyph: 'X', tint: 'var(--accent-soft)', edge: '#C0613A', name: 'Web & desktop', detail: 'This app · always on', state: 'on' as const },
  { id: 'voice', glyph: '◍', tint: '#ECE7F1', edge: '#7A6E9C', name: 'Voice', detail: 'Speak to the orb on the home screen', state: 'soon' as const },
  { id: 'telegram', glyph: 'T', tint: 'var(--hover)', edge: 'var(--text-2)', name: 'Telegram', detail: 'Message MARVIN like a contact', state: 'soon' as const },
  { id: 'whatsapp', glyph: 'W', tint: 'var(--hover)', edge: 'var(--text-2)', name: 'WhatsApp', detail: 'Reach MARVIN from your phone', state: 'soon' as const },
  { id: 'sms', glyph: '#', tint: 'var(--hover)', edge: 'var(--text-2)', name: 'SMS', detail: 'Texts and reminders, no app needed', state: 'soon' as const },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<XaniSettings | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [keyStored, setKeyStored] = useState<boolean | null>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);

  const handleExport = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `xani-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setBackupMsg(`Backup downloaded — ${Object.keys(data).length} entries. Keep it somewhere safe.`);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, string>;
      const n = await importAll(parsed);
      if (n === 0) {
        setBackupMsg('That file contains no Xanî data — nothing was changed.');
        return;
      }
      setSettings(getSettings());
      setBackupMsg(`Restored ${n} entries from the backup. Reload the app to see everything.`);
    } catch {
      setBackupMsg('Couldn’t read that backup file — nothing was changed.');
    }
  };

  useEffect(() => {
    ensureStorageReady().then(() => setSettings(getSettings()));
    if (isTauri()) {
      import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke<boolean>('has_api_key'))
        .then(setKeyStored)
        .catch(() => setKeyStored(false));
    }
  }, []);

  const saveApiKey = async () => {
    if (!keyInput.trim()) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('set_api_key', { key: keyInput.trim() });
    setKeyInput('');
    setKeyStored(true);
  };

  if (!settings) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <div className="h-8 w-40 animate-pulse rounded bg-border" />
      </div>
    );
  }

  const update = (patch: Partial<XaniSettings>) => setSettings({ ...settings, ...patch });

  const handleSave = () => {
    saveSettings(settings);
    setSavedAt(new Date().toLocaleTimeString('en-GB'));
  };

  const handleReset = () => {
    resetSettings();
    setSettings(structuredClone(DEFAULT_SETTINGS));
    setSavedAt(null);
  };

  const resetPrompt = (key: keyof XaniSettings['prompts']) =>
    update({ prompts: { ...settings.prompts, [key]: DEFAULT_SETTINGS.prompts[key] } });

  const toggleDayOff = (day: number) => {
    const has = settings.daysOff.includes(day);
    update({
      daysOff: has ? settings.daysOff.filter((d) => d !== day) : [...settings.daysOff, day].sort((a, b) => a - b),
    });
  };

  const tzOptions = TIMEZONES.includes(settings.profile.timezone)
    ? TIMEZONES
    : [settings.profile.timezone, ...TIMEZONES];

  const offLabels = WEEKDAYS.filter((d) => settings.daysOff.includes(d.value)).map((d) => d.label);
  const daysSummary = offLabels.length ? `Quiet on ${offLabels.join(', ')}` : 'Working every day';
  const editedPrompts = PROMPT_FIELDS.filter((f) => settings.prompts[f.key] !== DEFAULT_SETTINGS.prompts[f.key]).length;

  return (
    <div className="mx-auto max-w-3xl px-8 pb-16 pt-7">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-semibold text-text">Settings</h1>
        {savedAt && <span className="text-[11.5px] text-muted">Saved at {savedAt}</span>}
      </div>

      {/* Profile (always open) */}
      <div className="mb-4 rounded-2xl border border-border bg-surface px-[22px] py-5">
        <div className="mb-3.5 text-[13px] font-bold text-text">Profile</div>
        <div className="flex flex-col gap-3.5 sm:flex-row">
          <label className="flex-1">
            <span className="mb-1.5 block text-[11.5px] text-muted">Name</span>
            <input
              className={inputCls}
              value={settings.profile.name}
              onChange={(e) => update({ profile: { ...settings.profile, name: e.target.value } })}
            />
          </label>
          <label className="flex-1">
            <span className="mb-1.5 block text-[11.5px] text-muted">Timezone</span>
            <select
              className={`${inputCls} cursor-pointer`}
              value={settings.profile.timezone}
              onChange={(e) => update({ profile: { ...settings.profile, timezone: e.target.value } })}
            >
              {tzOptions.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Working days */}
      <Collapsible title="Working days" summary={daysSummary}>
        <p className="mb-3.5 text-[12px] leading-relaxed text-muted">
          Tap a day to mark it a day off. Highlighted means MARVIN stays quiet — no briefing, no alerts.
        </p>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d) => {
            const active = settings.daysOff.includes(d.value);
            return (
              <button
                key={d.value}
                type="button"
                aria-pressed={active}
                onClick={() => toggleDayOff(d.value)}
                className={`rounded-[9px] border px-3.5 py-1.5 text-[12px] font-semibold transition ${
                  active ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface-2 text-text-2 hover:border-accent'
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </Collapsible>

      {/* Model routing */}
      <Collapsible title="Model routing" summary={`Routine ${settings.models.routine} · Studio ${settings.models.studio}`}>
        <div className="flex flex-col gap-3.5 sm:flex-row">
          <label className="flex-1">
            <span className="mb-1.5 block text-[11.5px] text-muted">Routine model (briefings, triage, counts)</span>
            <input className={monoCls} value={settings.models.routine} onChange={(e) => update({ models: { ...settings.models, routine: e.target.value } })} />
          </label>
          <label className="flex-1">
            <span className="mb-1.5 block text-[11.5px] text-muted">Studio model (captions, fact-checks, reports)</span>
            <input className={monoCls} value={settings.models.studio} onChange={(e) => update({ models: { ...settings.models, studio: e.target.value } })} />
          </label>
        </div>
      </Collapsible>

      {/* Channels */}
      <Collapsible title="Channels" summary="Web & desktop · more coming soon">
        <p className="mb-3.5 text-[12px] leading-relaxed text-muted">
          Reach MARVIN from anywhere. Your memory and context follow you across every channel.
        </p>
        {CHANNELS.map((c) => (
          <div key={c.id} className="flex items-center gap-3.5 border-t border-border-2 py-3 first:border-t-0">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] text-[13px] font-bold" style={{ background: c.tint, color: c.edge }}>
              {c.glyph}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-text">{c.name}</div>
              <div className="mt-px text-[11.5px] text-muted">{c.detail}</div>
            </div>
            {c.state === 'on' ? (
              <span className="rounded-full bg-green-soft px-2.5 py-1 text-[11px] font-semibold text-green-ink">On</span>
            ) : (
              <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-muted">Soon</span>
            )}
          </div>
        ))}
      </Collapsible>

      {/* Anthropic API key */}
      <Collapsible title="Anthropic API key" summary={isTauri() ? (keyStored ? 'sk-ant-•••• · stored in OS keychain' : 'Not set') : 'Desktop: keychain · Dev: .env'}>
        {isTauri() ? (
          <>
            <p className="mb-3 text-[12px] leading-relaxed text-muted">
              Stored in your OS keychain and handed to MARVIN&apos;s runtime — never saved to a file or shown again.
              {keyStored ? ' A key is currently stored.' : ' No key stored yet.'}
            </p>
            <input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="sk-ant-…" className={monoCls} />
            <div className="mt-3 flex items-center gap-2 text-[11.5px] text-muted">
              <span>⛭</span> Stored in your OS keychain — desktop only.
            </div>
            <button
              type="button"
              onClick={() => void saveApiKey()}
              disabled={!keyInput.trim()}
              className="mt-3 rounded-[10px] bg-accent px-4 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent-dim disabled:opacity-40"
            >
              Save key to keychain
            </button>
          </>
        ) : (
          <p className="text-[12px] leading-relaxed text-muted">
            For security the key is never entered in the browser. In the <strong className="font-semibold text-text-2">desktop app</strong> it&apos;s
            stored in your OS keychain (this field appears there). In <strong className="font-semibold text-text-2">dev</strong>, set{' '}
            <code className="rounded bg-bg px-1">ANTHROPIC_API_KEY</code> in <code className="rounded bg-bg px-1">xani/.env</code> — it&apos;s read only by the sidecar, never the renderer.
          </p>
        )}
      </Collapsible>

      {/* Prompts */}
      <Collapsible title="Prompts" summary={editedPrompts ? `${editedPrompts} customised` : 'All default'}>
        <p className="mb-4 text-[12px] leading-relaxed text-muted">
          Edit how MARVIN and each Studio think. Locked safety rules are always appended automatically and can&apos;t be edited here.
        </p>
        {PROMPT_FIELDS.map((f) => {
          const isDefault = settings.prompts[f.key] === DEFAULT_SETTINGS.prompts[f.key];
          return (
            <div key={f.key} className="mb-4">
              <div className="mb-1.5 flex items-center">
                <span className="flex-1 text-[12.5px] font-semibold text-text">{f.label}</span>
                <button
                  type="button"
                  onClick={() => resetPrompt(f.key)}
                  disabled={isDefault}
                  className="text-[11.5px] font-semibold text-text-2 hover:text-accent disabled:opacity-40"
                >
                  {isDefault ? 'Using default' : 'Reset to default'}
                </button>
              </div>
              <textarea
                aria-label={f.label}
                className={`${monoCls} min-h-20 resize-y leading-relaxed`}
                value={settings.prompts[f.key]}
                onChange={(e) => update({ prompts: { ...settings.prompts, [f.key]: e.target.value } })}
              />
            </div>
          );
        })}
      </Collapsible>

      {/* Backup — everything Xanî knows (settings, memories, loops, approvals, voice,
          chats) as one file the user holds. Restore overwrites matching keys. */}
      <section className="mt-2 rounded-2xl border border-border bg-surface p-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">Backup</div>
        <p className="mt-1.5 text-[12.5px] text-text-2">
          Download everything MARVIN has learned as a file you keep. Restoring a backup overwrites the current data.
        </p>
        {backupMsg && <p className="mt-2 text-[12.5px] font-medium text-text">{backupMsg}</p>}
        <div className="mt-3 flex gap-2.5">
          <button
            type="button"
            onClick={() => void handleExport()}
            className="rounded-[10px] border border-border bg-surface-2 px-[18px] py-2 text-[13px] font-semibold text-text-2 transition hover:bg-hover"
          >
            Export backup
          </button>
          <label className="cursor-pointer rounded-[10px] border border-border bg-surface-2 px-[18px] py-2 text-[13px] font-semibold text-text-2 transition hover:bg-hover">
            Restore backup…
            <input type="file" accept="application/json" className="hidden" onChange={(e) => void handleImport(e)} />
          </label>
        </div>
      </section>

      <div className="flex justify-end gap-2.5 pt-2">
        <button
          type="button"
          onClick={handleReset}
          className="rounded-[10px] border border-border bg-surface px-[18px] py-2 text-[13px] font-semibold text-text-2 transition hover:bg-hover"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="rounded-[10px] bg-accent px-[22px] py-2 text-[13px] font-semibold text-on-accent transition hover:bg-accent-dim"
        >
          Save
        </button>
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-[9px] border border-border bg-surface-2 px-3 py-2.5 text-[13.5px] text-text outline-none focus:border-accent';
const monoCls =
  'w-full rounded-[9px] border border-border bg-surface-2 px-3 py-2.5 font-mono text-[12.5px] text-text outline-none focus:border-accent';
