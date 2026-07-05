# Xanî — Full Audit (5 July 2026)

Five parallel audit passes (design/3D, ADHD rules + accessibility, memory/intelligence,
Studios + renderer, code health) plus a connectors/security pass. Analysis of the
`gifted-einstein-xnpauy` branch as of `f1da8e3` (post Slack-unread, token-cache,
instant-Home, and Sunday-guard fixes).

Legend: 🟢 works · 🟡 partly there · 🔴 broken/below the brief · ⚫ missing entirely

**Bottom line:** the plumbing is genuinely well-built — the Inbox, Slack, Calendar,
Trello and Buffer views show real data with proper loading/empty/error states, the
code compiles clean, and the safety-critical seams are tested. But three headline
promises of the brief are largely unmet: MARVIN does not actually remember the user's
world; the look is a different app (calm green dashboard — no 3D, no warm cinematic
entrance); and Home overwhelms instead of leading with one calm briefing. Several of
the nine Studios are missing or draft-only.

---

## A. Design, 3D & the overall look 🔴

🟢 Readable text, clean light/dark theming, real serif+sans pairing.

- 🔴 Different visual identity than the brief: **green** accent (#40705c), cool grey
  background — not amber/terracotta on warm cream (#F7F3EE). *You get a cool green
  mood, not the warm lamp-lit world in the brief.*
- 🔴 "Playfair Display" is actually **Fraunces** (layout.tsx keeps it under the
  `--font-playfair` variable). *Every headline/wordmark is in the wrong typeface.*
- ⚫ **No 3D at all** — no three.js/R3F in package.json, no scene components. The only
  3D-ish artifact (`src/components/home/Orb.tsx`) is a blue/purple neon orb — the
  exact forbidden aesthetic — and is dead code (never imported).
- ⚫ **No entrance animation, no nav transitions** — no GSAP, no framer-motion;
  pages cut instantly.
- 🔴 The briefed MARVIN centrepiece (`MarvinChat.tsx`, `BriefingCard.tsx`) is built
  but **never wired into any route** — dead code. Home is a different dashboard.
- 🔴 Wordmark: 30px near-black in the sidebar, not 32px terracotta hero.

Reaching the brief's look is a build, not a polish pass.

## B. Home screen & ADHD rules 🔴

Pass: Rule 5 (no sound — genuinely silent), Rule 7 (no blocking modals; approvals
queue instead). Everything else fails or is partial:

- 🔴 Rule 1 (max 3 items): no caps anywhere — `page.tsx` maps full `inboxActs`,
  `slackActs`, `restList` with the whole dashboard stacked (greeting, one-thing,
  brain-dump, calendar, inbox triage, Slack triage, open loops, momentum).
- 🔴 Rule 4 (MARVIN speaks first): no briefing gate; `Watcher.tsx:23-27` writes a
  live `(N) Xanî` count into the window title.
- 🔴 Rule 3: no 0–10 priority gate; act/know/ignore verdicts, and hidden-item counts
  are still surfaced.
- 🟡 Rule 6: CSS `xpop` entrance only (0.3s, plain ease); **no exit animations** —
  dismissed cards vanish instantly. No GSAP.
- ⚫ Rule 8: no sidebar dimming when a Studio is open.
- ⚫ Rule 9: no always-present Focus control in the sidebar (Focus session exists but
  only from Home cards).
- 🟡 Rule 10: primary cards fine (p-5/6/8); many sub-cards at 12–14px padding.
- 🔴 **Accessibility blocker:** `--muted #a19d8f` ≈ 2.6:1 on light surface (timestamps,
  labels, placeholders everywhere); dark `--muted` ~4.0:1; dark terracotta text ~3.1:1.
  Inputs use `outline-none` with border-only focus; no global `:focus-visible`.
- ⚫ No `aria-live` for toasts/triage updates.

## C. Memory & intelligence 🔴 (brief's #1)

🟢 Real typed memory store with write-gate/tiers/trust (`src/lib/memory.ts`); survives
restarts (SQLite via Tauri, localStorage in dev); triage corrections auto-learn
(`triage-learning.ts`); solid prompt-injection hygiene.

- ⚫ **No background ingestion** — nothing reads Gmail/Slack/Trello into memory, ever
  (no scheduler in the sidecar; read-tools discard their results). MARVIN still starts
  every session blank about the user's world. This is the core miss.
- 🔴 Retrieval is substring match on the whole query (`context.ts:68`) — recall by
  meaning does not exist.
- 🔴 Learning is manual-only: `/extract` fires only from the "Save learnings" button
  (`MarvinChat.tsx` — itself dead code; the live chat path needs verification).
- 🔴 Model-proposed memories sit unapproved on /memory; nothing prompts the user.
- ⚫ **Cross-platform linking (Slack ↔ email) is completely absent** — the brief calls
  it non-negotiable.
- 🔴 Studio prompts get pinned/preference memories only — no episodic recall.
- 🔴 Sidecar-initiated calls (draft-reply, summarize, triage) are blind to the memory
  store beyond the `learned[]` list the renderer passes.

## D. Connectors 🟡

🟢 Gmail ×5 (parallel, batched, cached), Calendar, Drive, Slack (unread now computed
from last_read), Trello REST, Buffer, GitHub — all real, cred-gated, honest states.

- 🔴 **No timeouts on any external fetch** (~25 calls in connectors.ts +
  google-oauth.ts + llm.ts). A stalled network hangs requests indefinitely; a hung
  background triage refresh pins the inflight promise until restart.
- 🟡 Calendar/Drive use separate `GOOGLE_CALENDAR_*`/`GOOGLE_DRIVE_*` OAuth from
  Gmail — "calendar not connected" while Gmail works confuses.
- 🔴 Trello is an API-fed clone, not the embedded real Trello the brief's Fix 3
  demands (and currently not connected — creds absent; diagnostic script exists).
- 🟡 Buffer `drafts` is always 0 (only `pending` is counted).
- 🟡 Origin gate allows requests with no Origin header (documented gap; spawn-token
  planned but unimplemented). Loopback bind mitigates.

## E. Studios 🟡 (2 work, 2 draft-only, 1 shell, 1 under-spec, 3 missing)

| # | Studio | Status |
|---|--------|--------|
| 1 | Morning Briefing | 🔴 counts shell (`BriefingCard` never calls the model; also dead code) |
| 2 | Email Drafter | 🟡 drafts only — no send, no per-account register |
| 3 | Slack Composer | 🟡 drafts only — free-text channel, no preview/confirm |
| 4 | Amargi Caption Writer | 🟢 works (copy only — no Buffer hand-off) |
| 5 | LeadStories Fact-Check | 🟢 works, best-built (no 150-word cap enforced) |
| 6 | Moonshot OIC | 🔴 paragraph, not spreadsheet row; no OIC entry store |
| 7 | Moonshot Biweekly | ⚫ missing |
| 8 | Invoice Generator | ⚫ missing (no PDF capability in project) |
| 9 | Trello from Brief | ⚫ missing as specified (manual card form only) |

🟢 All six data views (Inbox/Slack/Trello/Calendar/Buffer/Home) are genuinely wired
with complete loading/offline/not-connected/empty/error states; no mock data. Day-off
defaults correct (Sun+Tue).

## F. Code health 🟢/🟡

🟢 tsc clean (both configs, strict + noUncheckedIndexedAccess), lint passes
(1 warning: raw `<img>` slack/page.tsx:47), 31/31 sidecar tests, real CI (4 gates),
`output:'export'`, zero TODO/FIXME/`as any`/`@ts-ignore`. The tested seams are the
right ones (mail sanitization, guard, origin, agent loop, Slack ordering, batch parse).

- 🔴 **Rust/Tauri shell never compile-verified** (db.rs, keychain.rs, tray) — packaged
  app unproven; secrets/data storage unverified until a real `tauri build` on macOS.
- 🟡 Sidecar Bun bundling also unverified.
- 🟡 `htmlToText` duplicated with different behaviour (connectors.ts:322 vs
  server.ts:374).
- 🟡 No tests: connectors network paths, server.ts (0 tests, 1,095 lines), all of
  src/lib (memory, approvals, autonomy, nudge-policy, watcher…), all UI. No
  integration tests.
- 🟡 `@anthropic-ai/sdk` pinned 0.32.1 (manual cache_control shim); `next lint`
  deprecated; playwright dep unused; 2 stray console.logs; 5 `as unknown` casts on
  the LLM response shape.

---

## Priorities

**FIRST — solid & calm daily use:** fetch timeouts everywhere; Home declutter (3-item
caps, briefing-first, drop title count); muted-text contrast + focus-visible; small
bugs (Buffer drafts, htmlToText).

**SECOND — make MARVIN smart (brief Fix 1):** background ingestion of Gmail/Slack/
Trello into memory; auto-learn on chat end; meaning-based recall; Slack↔email linking.

**THIRD — the brief's look & finish the Studios:** warm palette + real Playfair +
entrance + 3D + transitions (Fix 4); drafters that send; Invoice, Trello-from-brief,
real Morning Briefing, OIC row + biweekly.
