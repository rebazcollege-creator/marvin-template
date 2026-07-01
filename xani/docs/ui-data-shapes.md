# Xanî — UI data shapes & binding contract

Paste this alongside the design brief. It lists, per screen, the exact data each
view receives and the function that supplies it, so designs map 1:1 to the app.

Source of truth: `src/lib/marvin-protocol.ts` (wire types), `src/lib/memory.ts`,
`src/lib/settings.ts`. All times are ISO 8601 strings unless noted. `connected`
flags drive the not-connected state; never fabricate values when `connected` is
false.

---

## How data reaches the UI

| Concern | Import from | Key functions |
|---|---|---|
| Read-only view data (from sidecar) | `@/lib/marvin-data` | `fetchBriefingData`, `fetchInbox`, `fetchTrello`, `fetchCalendar`, `fetchSlack`, `fetchBuffer` — each returns `T \| null` (null = sidecar offline) |
| MARVIN chat / Studios | `@/lib/marvin-client` | `streamMarvin(req, onEvent)`, `approveMarvin(id, approved)`, `extractLearnings(messages, model)` |
| Settings (local, sync) | `@/lib/settings` | `getSettings`, `saveSettings`, `resetSettings`, `isDayOff`, `WEEKDAYS` |
| Memory (local, sync) | `@/lib/memory` | `getMemories`, `getProposedMemories`, `getAdjustments`, `ingestMemory`, `approveMemory`, `rejectMemory`, `updateMemory`, `removeMemory`, `setAdjustmentStatus` |
| Storage readiness / env | `@/lib/storage` | `ensureStorageReady()` (await before first local read), `isTauri()` |

Every data screen has 5 states: **loading · sidecar offline (`null`) · not
connected (`connected:false`) · connected-but-empty · populated.** The generic
`components/ui/DataView` already encodes these — designs should cover all five.

---

## Home — briefing  ·  `fetchBriefingData(): BriefingData | null`

```ts
interface BriefingData {
  gmail:    { account: string; unread: number }[];      // account: personal|moonshot|leadstories|zoho|amargi
  trello:   { name: string; url: string; urgent: boolean }[];
  buffer:   { drafts: number; scheduled: number } | null;
  slack:    { workspace: string; text: string; emergency: boolean }[];
  calendar: { title: string; start: string }[];
  connected: { gmail: boolean; trello: boolean; buffer: boolean; slack: boolean; calendar: boolean };
}
```
Briefing rows show counts: emails = sum of `gmail[].unread`; slack = `slack.length`;
trello = `trello.length`; calendar = `calendar.length`; buffer = `${drafts} / ${scheduled}`.
Show "—" for any source whose `connected` flag is false.
Greeting + day-off come from settings (see below): `isDayOff(new Date(), settings)`.

## Home — MARVIN chat  ·  `streamMarvin(req, onEvent)`

```ts
interface ChatMessage { role: 'user' | 'assistant'; content: string }
interface SystemBlock  { type: 'text'; text: string; cache: boolean }
interface ChatRequest  { model: string; system: SystemBlock[]; messages: ChatMessage[]; maxTokens?: number }

type StreamEvent =
  | { type: 'text'; text: string }                                            // append to current assistant bubble
  | { type: 'proposal'; kind: 'memory';     data: ProposedMemory }            // → notice "review on /memory"
  | { type: 'proposal'; kind: 'adjustment'; data: ProposedAdjustment }
  | { type: 'approval_request'; id: string; tool: string; input: unknown; reason: string } // → amber Approve/Reject card
  | { type: 'error'; message: string }
  | { type: 'done'; usage?: { input: number; output: number; cacheRead?: number; cacheWrite?: number } };

interface ProposedMemory     { category: string; content: string; importance?: number }
interface ProposedAdjustment { target: string; rationale: string; proposed: string }
```
Approve flow: render an inline card from `approval_request`; on click call
`approveMarvin(id, true|false)`. "Save learnings" calls `extractLearnings(...)`.

---

## Inbox  ·  `fetchInbox(): InboxData | null`
```ts
interface InboxData {
  connected: boolean;
  messages: { account: string; from: string; subject: string; snippet: string; receivedAt: string; unread: boolean }[];
}
```
Colour-code by `account`. Every account (incl. LeadStories) supports compose/reply; sending is gated by Approvals.

## Trello  ·  `fetchTrello(): TrelloData | null`
```ts
interface TrelloData {
  connected: boolean;  // currently false — Zapier MCP pending
  cards: { name: string; url: string; labels: string[]; urgent: boolean; due: string | null }[];
}
```

## Calendar  ·  `fetchCalendar(): CalendarData | null`
```ts
interface CalendarData {
  connected: boolean;
  events: { title: string; start: string; end: string; allDay: boolean }[];
}
```

## Slack  ·  `fetchSlack(): SlackData | null`
```ts
interface SlackData {
  connected: boolean;
  messages: { workspace: string; channel: string; user: string; text: string; ts: string; emergency: boolean }[];
}
```
`emergency: true` → terracotta "Emergency" chip. Read-only monitor.

## Buffer  ·  `fetchBuffer(): BufferData | null`
```ts
interface BufferData {
  connected: boolean;  // currently false — Direct MCP pending
  drafts: number;
  scheduled: number;
  byPlatform: { platform: string; count: number }[];  // Instagram, TikTok, X, Facebook, Bluesky, LinkedIn, YouTube
}
```

---

## Memory  ·  `getMemories()` / `getProposedMemories()` / `getAdjustments()`
```ts
interface MemoryEntry {
  id: string;
  tier: 'procedural' | 'semantic' | 'episodic';
  category: 'rule' | 'preference' | 'fact' | 'workflow' | 'correction' | 'episode' | 'other';
  content: string;
  source: 'manual' | 'conversation' | 'inferred' | 'correction' | 'external';
  trust: 'high' | 'medium' | 'low';
  importance: number;   // 1–10
  confidence: number;   // 0–1
  pinned: boolean;
  status: 'active' | 'proposed' | 'superseded' | 'rejected';
  createdAt: string; updatedAt: string; lastAccessedAt?: string; accessCount: number;
  supersededBy?: string; validUntil?: string;
}
interface SelfAdjustment {
  id: string;
  target: 'prompt.marvin' | 'prompt.amargi' | 'prompt.leadstories' | 'prompt.moonshot' | 'settings.daysOff' | 'behaviour';
  rationale: string; proposed: string; previousValue?: string;
  status: 'pending' | 'approved' | 'rejected'; createdAt: string; decidedAt?: string;
}
```
- `getMemories()` → active only (the "Learned" list; `pinned` first).
- `getProposedMemories()` → status `proposed` (the write-gate review section).
- `getAdjustments()` filtered to `status:'pending'` → the "MARVIN wants to adjust itself" section.
- Actions: `approveMemory(id)` / `rejectMemory(id)` / `updateMemory(id,{pinned})` /
  `removeMemory(id)` ; `setAdjustmentStatus(id,'approved'|'rejected')`.

## Settings  ·  `getSettings(): XaniSettings`
```ts
interface XaniSettings {
  profile: { name: string; timezone: string };       // IANA tz, e.g. Europe/Berlin
  daysOff: number[];                                  // 0=Sun … 6=Sat (default [0,2])
  prompts: { marvin: string; amargi: string; leadstories: string; moonshot: string };
  models:  { routine: string; studio: string };       // e.g. claude-haiku-4-5 / claude-sonnet-4-6
}
// WEEKDAYS: { value: 0..6; label: 'Sunday'..'Saturday' }[]  — for the day-off toggles
```
Save with `saveSettings(next)`; `resetSettings()` restores factory defaults.
Locked safety rules are always appended downstream and are NOT editable here.
Desktop-only API-key field: `isTauri()` gates it; store via Tauri
`invoke('set_api_key', { key })`, check with `invoke('has_api_key')`.

## Studios  ·  `streamMarvin` with a Studio system prompt
Same `StreamEvent` stream as chat. Build the request as:
```ts
const system = [{ type: 'text', text: composeStudioSystemPrompt(studio), cache: true }]; // '@/lib/context'
const model  = getSettings().models.studio;
streamMarvin({ model, system, messages: [{ role: 'user', content: input }] }, onEvent);
```
`studio` ∈ `'amargi' | 'leadstories' | 'moonshot'`. Output is the streamed `text`
events concatenated — drafting only, no outward actions.

---

## Design tokens (Tailwind classes that already exist)
`bg-paper` #F5F0E8 · `bg-paper-card` #FBF8F2 · `text-ink` #2C2C2C ·
`text-ink-soft` #5A554C · `border-line` #E3DBCC · `bg-terracotta` #C0613A ·
`bg-terracotta-dim` #A8512E · `bg-amber`/`border-amber` #D89A4E ·
fonts: `font-display` (Playfair Display) for headings/wordmark, `font-sans` (Inter) for UI.
