# Xanî — Zero-Based Audit (5 July 2026)

Mandate from the owner: nothing is immune — name, architecture, connectors, all of it.
Keeping the app and rebuilding from scratch have equal standing. The only yardstick:
**a personal AI assistant that performs better than 100 human assistants** for one
user — Rebaz (journalist, Berlin; Amargi social media, LeadStories fact-checking,
Moonshot CVE monitoring; ADHD; not a developer).

Evidence: five brief-compliance audit passes (see full-audit-2026-07-05.md) plus
three zero-based passes on Fable 5 (operational reality, the AI brain, proactivity)
and a job-fit/strategy analysis. All claims trace to file:line in the reports.

---

## THE VERDICT

**Rebuild the shell, keep the organs.** Deleting everything would throw away the
best parts (the safety architecture, the connector transport, the ADHD reactive
surfaces — independently judged "arguably the best ADHD email/Slack client" seen);
keeping everything preserves the three structural failures that make the goal
impossible. The app is a well-engineered *reactive dashboard* wearing the label of a
proactive assistant. Between sessions it employs zero assistants.

### The three structural failures (each alone is disqualifying)

1. **No heartbeat.** Not one scheduled job exists anywhere. Every watcher/timer runs
   in the browser window and stops when it's hidden; closing the window kills the
   whole app (tray exists, close-handler doesn't). Notifications are web-only and
   almost certainly dead in the packaged app. Nothing is ever prepared while he
   sleeps. → An assistant that only thinks when clicked cannot beat one intern.
2. **Amputated brain.** On his actual provider (Claude Code CLI), every AI call
   spawns a cold process (5–20s, no streaming) that **cannot use tools** — silently
   killing the agent loop, all 7 tools, the approval flow, and the "Save learnings"
   button (which has always saved nothing). The toolbox itself is "five dashboard
   glances and two suggestion boxes": no web search (LeadStories studio structurally
   cannot do its job), no email/Slack search, no writes, no follow-ups. Prompt
   caching is broken by a one-line double-conversion bug. The CLI is a full agentic
   runtime being used as the world's slowest text box.
3. **Empty memory + wrong operational shape.** Memory only holds what's hand-typed
   (no ingestion of his mail/Slack/Trello, substring-only recall, manual-only
   learning, zero Slack↔email linking). And the daily driver is dev mode: plaintext
   creds in the repo folder, the assistant's entire brain in browser localStorage
   (one "Clear site data" from oblivion), `git pull` + `rm -rf .next` as a ritual
   that exists because of a real, diagnosable trap (stale port → silent 3001 →
   everything 403s → "offline"). The packaged app was never compiled and its
   credential path would silently lose his Google tokens.

---

## VERDICTS BY LAYER

| Layer | Verdict | Why |
|---|---|---|
| Safety architecture (guard, approvals, origin gate, cred isolation, injection hygiene) | **KEEP** | The best work in the codebase; server-side enforced; give it more to guard |
| Connector transport (Gmail×5 batching, Slack reads/unread, Calendar, Trello REST, Buffer) | **KEEP** | Real, honest, now cached + unread-correct; add timeouts |
| ADHD reactive layer (Open Loops, BreakItDown, FocusSession, Routines, DayRitual, Momentum, sort-dump, tone-check) | **KEEP** | Genuinely excellent and wired end-to-end |
| Triage (inbox+Slack, learned corrections, SWR cache) | **KEEP-BUT-FIX** | Real craft; make it extract deadlines/promises; memory-aware |
| Prompts (marvin.ts and job knowledge) | **KEEP** | The strongest artifact; route ALL surfaces through it + the override layer |
| Data views (Inbox/Slack/Calendar/Trello/Buffer UX skeleton) | **KEEP-BUT-FIX** | Solid; contrast + focus + 3-item calm pass needed |
| Agent loop (agent.ts) | **KEEP-BUT-FIX** | Well-built; currently bypassed by provider; fix cache bug, cancellation |
| Provider layer (llm.ts spawn-per-call) | **REBUILD** | Persistent Claude session (Agent SDK / stream-json) keeps his free login, restores tools+streaming, ~10× latency |
| Tool registry (tools.ts) | **REBUILD** | Add search (web/email/Slack), gated writes, memory read/write, follow-up scheduling |
| Memory CONTENT layer (ingestion, recall, linking) | **REBUILD/BUILD** | Background ingestion + FTS/embedding recall + Slack↔email linking; store mechanics stay |
| Operational shell (dev-all ritual, localStorage brain, plaintext creds) | **KILL the ritual → supervised service** | One launchd-supervised single-port service serving the built UI; state+creds behind sidecar in App Support; nightly auto-backup; in-app updater |
| Scheduler / background jobs | **MISSING → BUILD** | The heartbeat: morning brief before wake, watchers, follow-ups, nightly learning |
| OS notifications + close-to-tray | **MISSING → BUILD** | tauri-plugin-notification + prevent_close; emergency lane bypassing the 90-min nudge gate |
| Commitment/follow-up tracking (his + theirs, silence detection, deadline extraction) | **MISSING → BUILD** | The biggest functional hole vs a real assistant |
| Design identity (green/Fraunces/flat vs the warm brief) | **REBUILD** | Warm terracotta + real Playfair + entrance + transitions; persistent 3D scene demoted to optional delight (conflicts with ADHD calm + MacBook Air thermals) |
| Home screen | **REBUILD** | Briefing-first, 3-item rule, no title-bar counter |
| Studios 4+5 (Amargi captions, LeadStories) | **KEEP** | Work today; LeadStories becomes real once web search exists |
| Studios 2+3 (drafters) | **KEEP-BUT-FIX** | Wire send-with-approval; per-account voice |
| Studios 1/6/7/8/9 (briefing, OIC, biweekly, invoice, Trello-from-brief) | **BUILD** | Missing or shells; invoice needs a PDF layer |
| Automations page | **KILL (until real)** | Fake toggles + fabricated run counts; actively harmful to an ADHD user's trust |
| GitHub connector | **KILL** | Serves a developer persona, none of his three jobs |
| Dead code (MarvinChat, BriefingCard, Orb, playwright dep) | **KILL or MOUNT** | MarvinChat is the only consumer of memory-chat/approval/learning — decide, don't leave fossils |
| Moonshot job tooling (TikTok monitoring, Google Sheets, OIC store) | **MISSING → BUILD** | His third job is essentially unserved by the app |
| The name | **Xanî stays; "MARVIN" retires** | One identity. MARVIN is template residue (and Hitchhiker's depressed robot). He may name the assistant persona himself |

## Strategy: should this app exist at all?

Benchmark: Claude Desktop + connectors already covers ad-hoc chat over mail. What it
can never be for him: an approvals-gated, ADHD-shaped, multi-account, memory-bearing,
*scheduled* cockpit that works his three jobs in his voice. The custom app is
justified **only** by delivering exactly the layers it currently lacks (heartbeat,
brain, memory). If Xanî can't beat "Claude Desktop + connectors" on reliability
within a month of the rebuild, it doesn't deserve to exist. That is the bar.

## THE BUILD PLAN (each phase maps to the goal)

- **Phase 0 — Make it run itself (the service).** launchd-supervised single-port
  service serving the built UI (kills the ritual, the 3001 trap, the .next habit);
  state + creds move behind the sidecar to Application Support; nightly auto-backup;
  fetch timeouts; provider-capability honesty in the UI; strip the Automations page;
  keychain key-parity fix.
- **Phase 1 — Give it a working brain.** Persistent Claude session (keeps free
  login; restores tools/streaming/learning); real tool belt (web search+fetch,
  email/Slack search, gated writes, memory read/write, schedule_followup); fix the
  cache_control bug; mount the memory-injected chat as the centrepiece.
- **Phase 2 — Make it know and act on his world.** Background ingestion → memory
  with FTS/semantic recall; deadline + promise extraction in triage; commitment
  tracker + silence detection with pre-drafted nudges; scheduled morning brief built
  before he wakes; OS notifications + close-to-tray + emergency lane.
- **Phase 3 — Make it his place.** Warm identity (terracotta/cream, real Playfair,
  entrance moment, physical transitions); Home rebuilt briefing-first with the
  3-item rule; contrast/focus accessibility fixes.
- **Phase 4 — Finish the jobs.** Invoice PDFs; Trello-from-brief; OIC row + store +
  biweekly; drafters that send; Buffer hand-off; TikTok/Sheets for Moonshot; real
  Trello (webview) decision.

Sequencing logic: a heartbeat makes everything else possible; a brain makes the
heartbeat smart; memory makes the brain his; identity makes it a place he wants to
be; job tools make it 100 assistants instead of one good one.
