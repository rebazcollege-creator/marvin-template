import { readJson, writeJson, newId } from '@/lib/storage';
import type { ChatMessage } from '@/lib/marvin-protocol';

/**
 * Local chat history. Conversations persist through the storage adapter
 * (localStorage in dev, SQLite under Tauri) so they survive restarts. Single
 * user, modest volume — a capped flat list is plenty.
 */

export interface Chat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

const KEY = 'xani.chats.v1';
const MAX_CHATS = 50;

export function titleFrom(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user')?.content.trim();
  if (!firstUser) return 'New chat';
  return firstUser.length > 48 ? `${firstUser.slice(0, 48)}…` : firstUser;
}

export function listChats(): Chat[] {
  return readJson<Chat[]>(KEY, []).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getChat(id: string): Chat | undefined {
  return readJson<Chat[]>(KEY, []).find((c) => c.id === id);
}

export function newChatId(): string {
  return newId();
}

/** Upsert a conversation (preserving its original createdAt). No-op if empty. */
export function saveChat(id: string, messages: ChatMessage[]): void {
  if (messages.length === 0) return;
  const all = readJson<Chat[]>(KEY, []);
  const existing = all.find((c) => c.id === id);
  const now = new Date().toISOString();
  const chat: Chat = {
    id,
    title: titleFrom(messages),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    messages,
  };
  writeJson(KEY, [chat, ...all.filter((c) => c.id !== id)].slice(0, MAX_CHATS));
}

export function deleteChat(id: string): void {
  writeJson(
    KEY,
    readJson<Chat[]>(KEY, []).filter((c) => c.id !== id),
  );
}
