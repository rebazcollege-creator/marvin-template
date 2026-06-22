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

/**
 * Settings — the customization surface. Xanî is built for one user, so every
 * behaviour that the brief hardcoded is editable here: profile, days off,
 * MARVIN's system prompt, each Studio prompt, and model routing.
 *
 * Edits persist to localStorage via saveSettings(). Reset restores the factory
 * defaults defined in src/prompts/* and src/lib/anthropic.ts.
 */

const PROMPT_FIELDS: { key: keyof XaniSettings['prompts']; label: string }[] = [
  { key: 'marvin', label: 'MARVIN — system prompt' },
  { key: 'amargi', label: 'Amargi — caption writer' },
  { key: 'leadstories', label: 'LeadStories — fact-check' },
  { key: 'moonshot', label: 'Moonshot — OIC report' },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<XaniSettings | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    setSettings(getSettings());
  }, []);

  if (!settings) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-10">
        <div className="h-8 w-40 animate-pulse rounded bg-line" />
      </div>
    );
  }

  const update = (patch: Partial<XaniSettings>) =>
    setSettings({ ...settings, ...patch });

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
    update({
      prompts: { ...settings.prompts, [key]: DEFAULT_SETTINGS.prompts[key] },
    });

  const toggleDayOff = (day: number) => {
    const has = settings.daysOff.includes(day);
    update({
      daysOff: has
        ? settings.daysOff.filter((d) => d !== day)
        : [...settings.daysOff, day].sort((a, b) => a - b),
    });
  };

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl text-ink">Settings</h1>
        {savedAt ? (
          <span className="text-xs text-ink-soft">Saved at {savedAt}</span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Your app, your rules. Everything below overrides the built-in defaults.
      </p>

      {/* Profile */}
      <Section title="Profile">
        <Field label="Name">
          <input
            className={inputCls}
            value={settings.profile.name}
            onChange={(e) =>
              update({ profile: { ...settings.profile, name: e.target.value } })
            }
          />
        </Field>
        <Field label="Timezone (IANA)">
          <input
            className={inputCls}
            value={settings.profile.timezone}
            onChange={(e) =>
              update({
                profile: { ...settings.profile, timezone: e.target.value },
              })
            }
          />
        </Field>
      </Section>

      {/* Days off */}
      <Section title="Days off">
        <p className="mb-3 text-sm text-ink-soft">
          On these days MARVIN stays silent — no briefing, no alerts.
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
                className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                  active
                    ? 'border-terracotta bg-terracotta text-paper'
                    : 'border-line bg-paper-card text-ink-soft hover:border-terracotta'
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Model routing */}
      <Section title="Model routing">
        <Field label="Routine model (briefings, triage, counts)">
          <input
            className={inputCls}
            value={settings.models.routine}
            onChange={(e) =>
              update({ models: { ...settings.models, routine: e.target.value } })
            }
          />
        </Field>
        <Field label="Studio model (captions, fact-checks, reports)">
          <input
            className={inputCls}
            value={settings.models.studio}
            onChange={(e) =>
              update({ models: { ...settings.models, studio: e.target.value } })
            }
          />
        </Field>
      </Section>

      {/* Prompts */}
      <Section title="Prompts">
        <p className="mb-3 text-sm text-ink-soft">
          Edit how MARVIN and each Studio think. Non-negotiable safety rules are
          always appended automatically and can&apos;t be removed here.
        </p>
        {PROMPT_FIELDS.map((f) => {
          const isDefault = settings.prompts[f.key] === DEFAULT_SETTINGS.prompts[f.key];
          return (
            <Field key={f.key} label={f.label}>
              <textarea
                aria-label={f.label}
                className={`${inputCls} min-h-40 font-mono text-xs leading-relaxed`}
                value={settings.prompts[f.key]}
                onChange={(e) =>
                  update({
                    prompts: { ...settings.prompts, [f.key]: e.target.value },
                  })
                }
              />
              <button
                type="button"
                onClick={() => resetPrompt(f.key)}
                disabled={isDefault}
                className="mt-1 text-xs text-ink-soft underline-offset-2 hover:underline disabled:opacity-40"
              >
                {isDefault ? 'Using default' : 'Reset this prompt to default'}
              </button>
            </Field>
          );
        })}
      </Section>

      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-terracotta px-5 py-2 text-sm font-medium text-paper transition-colors hover:bg-terracotta-dim"
        >
          Save changes
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-lg border border-line px-5 py-2 text-sm text-ink-soft transition-colors hover:text-ink"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-lg border border-line bg-paper-card px-3 py-2 text-sm text-ink outline-none focus:border-terracotta';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 rounded-2xl border border-line bg-paper-card p-6">
      <h2 className="text-xl text-ink">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-soft">
        {label}
      </span>
      {children}
    </label>
  );
}
