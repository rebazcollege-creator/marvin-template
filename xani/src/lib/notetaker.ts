import { readJson, writeJson, newId } from '@/lib/storage';

/**
 * Notetaker sessions. Honest by design: we really capture the agenda, notes,
 * timing and action items the user enters, but we do NOT fabricate a transcript
 * or summary — on-device transcription/summarisation isn't wired yet, so those
 * stay empty with a clear note. Persisted via the storage adapter.
 */

export type ActionDest = 'trello' | 'calendar' | 'none';

export type ActionItem = {
  id: string;
  text: string;
  dest: ActionDest;
  done: boolean;
  routed: boolean;
};

export type NoteSession = {
  id: string;
  title: string;
  agenda: string;
  notes: string;
  startedAt: string;
  durationSec: number;
  actions: ActionItem[];
};

const KEY = 'xani.notetaker.v1';

export function listSessions(): NoteSession[] {
  return readJson<NoteSession[]>(KEY, []);
}

export function saveSessions(list: NoteSession[]): void {
  writeJson(KEY, list);
}

export function newSession(agenda: string, durationSec: number): NoteSession {
  const firstLine = agenda.trim().split('\n')[0]?.trim();
  return {
    id: newId(),
    title: firstLine && firstLine.length > 0 ? firstLine.slice(0, 80) : 'Untitled session',
    agenda: agenda.trim(),
    notes: '',
    startedAt: new Date().toISOString(),
    durationSec,
    actions: [],
  };
}

export function newAction(text: string): ActionItem {
  return { id: newId(), text, dest: 'none', done: false, routed: false };
}
