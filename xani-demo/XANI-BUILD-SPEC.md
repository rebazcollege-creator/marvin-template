# Xanî — Build Spec

**A personal AI operating system for Rebaz. MARVIN at the centre. ADHD-first.**

Status: planning doc. Written after the design exploration in `xani-demo/`.
Decisions locked with Rebaz: **watch everything · draft-and-approve · rank by VIPs +
projects + deadlines + learned corrections (ask when unsure) · light theme default.**

---

## 0. How to read this

Xanî is **two layers**:

- **The Face** — the app UI (Next.js/React). This is what the `xani-demo/` prototypes
  designed: the ADHD-first home, the voice orb, and the three modes (Now / Stream / Field),
  plus Triage, Studios, Approvals, Memory.
- **The Brain** — the intelligence + live data (the Node **sidecar** + connectors +
  memory + MARVIN's reasoning via the Anthropic SDK).

The good news: **most of the Brain already exists** in branch `claude/gifted-einstein-xnpauy`
under `xani/`. This spec is mostly about (a) replacing the current Face with the new
ADHD-first design, and (b) sharpening the Brain so Xanî is smart enough that Rebaz never
has to open a raw inbox.

---

## 1. Product principles

1. **One next thing, always.** The home never shows a wall of feeds. It shows *decisions*
   and *one* focus. Raw email/Slack/Trello lists are a place you *can* go, not the default.
2. **Xanî prepares; Rebaz decides.** The sidecar pulls from every source on a schedule,
   MARVIN ranks and drafts, and the UI presents finished decisions ("Sarah needs X — I
   drafted a reply, send?"), not chores.
3. **Draft everything, approve nothing silently.** No email, message, post, card move, or
   calendar change leaves without Rebaz's tap. (Already the rule in `prompts/marvin.ts` +
   `approvals.ts`.)
4. **It gets smarter every time it's corrected.** Corrections are durable, high-trust
   memory. Tomorrow it doesn't repeat today's mistake.
5. **When unsure, it asks — it does not guess.** Low-confidence items become a short
   question, not a wrong action.
6. **Calm, not sterile.** Light-first aurora identity; the orb is a living presence, not a
   gimmick. Respects reduced-motion and low-focus days.

---

## 2. Architecture

```
            ┌──────────────────────────── THE FACE (Next.js / React 19 / Tailwind) ───────────────────────────┐
            │  Home (voice orb + prepared brief)   Now (deck)   Stream (chat)   Triage   Field   Studios       │
            │  Approvals queue        Memory/Settings         react-three-fiber orb (voice)                    │
            └───────────────▲───────────────────────────────────────────────────────────▲──────────────────────┘
                            │ GET /data/*  (BriefingData, InboxData, …)                  │ POST /chat, /act, /memory
                            │ reads prepared state                                       │ approvals → real actions
            ┌───────────────┴──────────────────────── THE BRAIN (Node sidecar) ──────────┴──────────────────────┐
            │  scheduler → pull all sources → normalise → MARVIN rank+draft → write "Today" state → approvals    │
            │  context.ts (system prompt + memory)   memory.ts (learn)   autonomy.ts + approvals.ts (trust gate) │
            └───────────────▲───────────────────────────────────────────────────────────────────────────────────┘
                            │ connectors
   Gmail ×5 · Slack ×2 · Trello (Central+Social) · Buffer (7 platforms) · Google Calendar · Notion · Drive
```

Why a sidecar and not the browser: the sidecar owns the integration tokens and can run
**in the background even when the app window is closed** — which is exactly Rebaz's ask
("desktop app on my terminal that activates in the background when I open the app"). Xanî
is already a **Tauri** desktop app with a sidecar (`sidecar/server.ts`, `dev-all.mjs`).

---

## 3. What already exists (branch inventory)

Do **not** rebuild these — wire the new UI into them.

| Concern | File(s) | State |
|---|---|---|
| MARVIN persona + full workflow rules | `src/prompts/marvin.ts` | ✅ Rich, real (Amargi/LeadStories/Moonshot) |
| Wire protocol / data shapes | `src/lib/marvin-protocol.ts` | ✅ `BriefingData`, `InboxData`, `ProposedMemory`, `ProposedAdjustment`, `ActPayload` |
| Memory (3-tier, learn-from-correction, write-gate) | `src/lib/memory.ts` | ✅ Sophisticated |
| Approvals queue (draft→approve→act) | `src/lib/approvals.ts` | ✅ |
| Autonomy (auto/ask/never per category) | `src/lib/autonomy.ts` | ✅ Cautious defaults |
| Source connectors | `src/lib/{gmail,slack,trello,buffer,calendar,notion}.ts` | ✅ Exist; verify live wiring |
| Sidecar agent + tools | `sidecar/{server,agent,connectors,tools}.ts` | ✅ |
| Context builder (prompt + memory injection) | `src/lib/context.ts` | ✅ |
| Automations | `src/lib/automations.ts` | ✅ |
| Current UI (to be replaced by new design) | `src/app/*`, `src/components/*` | 🔁 Redesign |

**Gap to close:** the *Face* is the old editorial design. The *Brain* is strong. This build
swaps the Face for the ADHD-first design and tightens the ranking/learning loop.

---

## 4. Data flow (the loop that makes it feel smart)

1. **Pull** — sidecar scheduler (e.g. every 2–5 min, and on app focus) fetches from every
   connected source via the connectors → normalises into a common `Signal` shape
   (`source`, `sender`, `subject`, `snippet`, `timestamp`, `threadRef`, `project?`).
2. **Rank** — each Signal gets an **importance score** (see §5). Low-value noise is
   auto-archived per Rebaz's learned rules; the rest is queued.
3. **Draft** — for anything that needs a reply/action, MARVIN drafts it in Rebaz's voice
   (Amargi caption rules, fact-check note format, etc. from `marvin.ts`) → a **proposed
   action** with a preview.
4. **Prepare state** — the sidecar writes a compact **"Today"** object: `oneThing`,
   `timeline`, `decisions[]` (ranked), `momentum`, per-source counts (`BriefingData`).
5. **Serve** — the Face reads `GET /data/*` and renders Home / Now / Triage from prepared
   state. **No ranking or fetching in the browser.**
6. **Act** — when Rebaz approves a decision, `POST /act` performs the real send/post/move
   via the connector. Nothing acts without approval (§7).
7. **Learn** — corrections and edits flow back to `memory.ts` (§8), changing tomorrow's
   ranking and drafts.

---

## 5. Intelligence: the importance model

Every Signal scores against Rebaz's chosen factors. Score = weighted sum, then bucketed
into **Surface now / Prepare quietly / Auto-file**.

| Factor | Source of truth | Example |
|---|---|---|
| **VIP people** | memory `fact`/`preference` + Settings list | Editors, key contacts → always top |
| **Projects/clients** | `marvin.ts` roles + memory | Anything re: Amargi, LeadStories, Moonshot |
| **Deadlines/keywords** | content scan | "urgent", "today", "invoice", "by 1pm", emergency trend drops on LeadStories Slack |
| **Learned corrections** | `memory.ts` (`correction`, high trust) | "Never surface LinkedIn notifications" once told |
| **Source priority** | per Rebaz's day | LeadStories Slack emergencies = urgent during his 1–5pm shift |

**Ask-when-unsure:** if the top-scoring interpretation is below a confidence threshold, Xanî
does **not** guess — it emits a **clarifying question** (§9) instead of a wrong action.

Cold-start: seed weights from `marvin.ts` (already encodes VIPs, projects, urgency signals),
then let corrections tune them. This is why it can be useful on day one and sharp by week two.

---

## 6. The Face → data map

Each surface reads prepared state — it is a *view*, not a fetcher.

| Surface | Reads | Purpose |
|---|---|---|
| **Home** | `Today.oneThing`, `timeline`, `momentum`, `BriefingData` counts | The prepared cockpit. Orb = voice/presence. One focus + the day, no feeds. |
| **Now** (Deck) | `Today.decisions[]` (ranked) | One decision at a time; drives the day; ends at "clear". |
| **Stream** | `/chat` + inline `decisions`/`InboxData` | Conversation; pull anything ("clear my inbox"); results inline. |
| **Triage** | `InboxData` (ranked, pre-drafted) | One email/message at a time; MARVIN pre-decided; swipe to confirm. |
| **Field** | `Today` overview | Spatial glance + spotlight one thing. |
| **Studios** | project state (Amargi/LeadStories/Moonshot) | Focused per-role workspaces; MARVIN drafts, Rebaz directs. |
| **Approvals** | `approvals.ts` queue | The single place everything outbound waits for a tap. |
| **Memory** | `memory.ts` | See/curate what Xanî has learned; approve proposed rules; lock rules. |

---

## 7. Approval model ("draft everything, I approve")

- Every outbound action MARVIN prepares → `enqueueApproval({kind, title, preview, payload})`
  (`approvals.ts`). Kinds: `email · social · calendar · files · slack · task`.
- The UI shows the draft with a preview; **Approve** → `POST /act` performs it; **Reject**
  → logs a correction signal ("didn't want this") that feeds memory.
- `autonomy.ts` stays the master switch. Per Rebaz's choice, **defaults are `ask` for
  everything that reaches a person** (email/slack/social), matching `marvin.ts`
  ("never send autonomously"). Calendar can be `auto` later if he wants; today it stays `ask`.
- **Hard constraints (from `marvin.ts`) encoded as `never`:** no TCS automation, no writes
  to Moonshot's official spreadsheets, **nothing initiated on Sunday/Tuesday (days off).**

---

## 8. Learning loop ("when I correct it, it updates itself")

Already modelled in `memory.ts`. Wire the UI to it:

- **Triggers:** Rebaz edits a draft, rejects a surfaced item, re-ranks something, or says
  "no, do X instead" in Stream.
- **Write:** the correction lands as a `correction`/`preference` entry — `source:'correction'`,
  `trust:'high'` — via the **propose→approve write-gate** (untrusted external content can
  never auto-write a rule; poisoning-safe by design).
- **Apply:** `context.ts` injects active high-trust memory into MARVIN's system prompt each
  turn, so the correction changes ranking + drafts going forward. Contradictions
  soft-supersede (history kept).
- **Visible:** the Memory surface shows learned rules; Rebaz can pin, edit, lock, or reject —
  he stays in control of his own assistant's mind.

Example: reject a LinkedIn "you appeared in searches" → rule *"auto-file LinkedIn
notifications"* → they never reach Triage again.

---

## 9. Clarifying questions ("I can answer if Xanî doesn't understand")

- When confidence < threshold (ambiguous sender, unclear project, risky action), the sidecar
  produces a **question item** instead of an action: short, one-tap answers where possible.
- Surfaces in Stream (inline) and as a light Home nudge — never a blocking modal.
- Rebaz's answer is written to memory as a `fact`/`preference`, so the *same* question is
  never asked twice. Questions are a learning channel, not friction.

---

## 10. Sources — plan & status

All watched. Per-source: what to pull, what actions, current status.

| Source | Pull | Actions (all draft→approve) | Status / notes |
|---|---|---|---|
| **Gmail ×5** | unread, ranked threads | reply, archive, label, snooze | Connector exists; confirm all 5 accounts authorised |
| **Slack ×2** | mentions, DMs, **emergency trend drops** | reply, react, remind | LeadStories emergencies = urgent during 1–5pm shift |
| **Trello** | Central + Social boards; overdue/urgent cards | move card, comment | "Ready to Publish" auto-push is Rebaz's existing rule — surface, don't fight it |
| **Buffer** | queue drafts/scheduled across 7 platforms | draft caption, queue | Amargi caption rules live in `marvin.ts` |
| **Google Calendar** | today's events, conflicts | create/move/decline | `autonomy` currently `auto`; keep `ask` initially |
| **Notion** | relevant pages/docs | read, draft | ⚠️ Needs OAuth authorisation before use |
| **Drive** | recent files | read, draft | Connector present |
| **TCS (LeadStories)** | — | **none** | ❌ Closed app, no API — do NOT automate (hard rule) |
| **Moonshot sheets** | — | read only | ❌ Do NOT auto-write official spreadsheets (hard rule) |

---

## 11. The orb (identity + interface)

- Convert the prototype orb (`xani-demo/orb-assistant.html`) to a **react-three-fiber**
  component so it lives natively in the app with proper mount/unmount + SSR guards.
- **Theme-aware** (already solved in the prototype): additive bright aurora on dark; deep
  saturated aurora + grounding disc on **light (default)** so it never washes out.
- **Voice:** Web Audio mic → amplitude/bands drive the particles. On alert (idle breathing);
  hearing you → **particles shake chaotically** while the orb floats smoothly; optional live
  transcript via SpeechRecognition. Falls back to a simulated reaction if the mic is blocked.
- Add perf tiers (fewer particles on low-end/mobile) + `prefers-reduced-motion` full-stop.

---

## 12. Design system

- **Light default**, dark optional (toggle). Aurora accents; terracotta signature.
- Fonts: Fraunces (display), Inter (body), Space Grotesk (labels). CSS-variable tokens
  (already the pattern in `globals.css`), extended with the new palette.
- Design skills to lean on (installed in this repo): `modern-web-design`, `motion-framer`,
  `react-three-fiber`, `react-spring-physics`, `animated-component-libraries`.

---

## 13. Tech stack

Next.js 15 · React 19 · Tailwind 3 · TypeScript · Tauri (desktop) · Node sidecar ·
`@anthropic-ai/sdk` (MARVIN reasoning, prompt caching via `SystemBlock.cache`) ·
react-three-fiber (orb) · Playwright (exists) for QA. Storage: localStorage now → SQLite later
(as noted in `memory.ts`).

---

## 14. Roadmap (phased — stay in the loop between phases)

- **Phase 0 — Spec sign-off.** This doc. Confirm scope, VIP list, source priorities.
- **Phase 1 — Shell + identity.** New app shell, light-default aurora theme, r3f orb on Home,
  nav = Home/Now/Stream/Triage/Field/Studios/Approvals/Memory. Wired to *mocked* `/data`.
- **Phase 2 — Live read path.** Sidecar pull → normalise → `BriefingData`/`InboxData` real.
  Home + Triage show real, ranked, pre-drafted items. Confirm all 5 Gmail + 2 Slack + Trello
  + Buffer + Calendar authorised (Notion OAuth).
- **Phase 3 — Ranking + drafting.** Importance model (§5) + MARVIN drafts in-voice. Now/Deck
  driven by real ranked decisions.
- **Phase 4 — Approvals + act.** Approvals queue → `/act` performs real actions. Encode hard
  constraints (days off, TCS, Moonshot).
- **Phase 5 — Learning + questions.** Correction → memory → context injection loop; clarifying
  questions. Memory surface.
- **Phase 6 — Polish + QA.** Perf tiers, reduced-motion, `/qa` browser tests, security pass
  (`/cso`) on token handling.

---

## 15. Honest limits & risks

- **The `xani-demo/*` files are UX prototypes**, not the product. They load Three.js from a
  CDN and have no live data. The real build is in the `xani/` Next.js app.
- **Branch:** the app lives on `claude/gifted-einstein-xnpauy`. I can only build there with
  your explicit go-ahead (I'm currently authorised for a different branch).
- **Auth/setup blockers:** Notion needs OAuth; confirm all 5 Gmail + both Slack tokens; Trello
  connector may need a key. TCS + Moonshot sheets are permanently off-limits to automation.
- **"Never miss a thing" is a ranking-quality problem**, not a UI one. It gets there via the
  memory/correction loop over days — plan for a tuning period, not instant perfection.
- **Trust:** memory poisoning is a real risk when ingesting email/Slack; the existing
  write-gate (`memory.ts`) is the defence — keep external content from ever auto-writing rules.

---

## 16. Open questions for Rebaz

1. **VIP list:** who are the specific people that should always rise to the top? (names/emails)
2. **Which of the 5 Gmail accounts** are work vs personal, and do any deserve different rules?
3. **Slack:** which channels are signal vs noise in each of the 2 workspaces?
4. **Morning brief:** what does a *perfect* 30-second morning brief contain, in order?
5. **Day rhythm:** confirm days off (Sun/Tue) and the LeadStories 1–5pm urgency window.
6. **Green light:** do I build this in the `xani/` app on `claude/gifted-einstein-xnpauy`?

---

*Face designed in `xani-demo/` · Brain already substantially built in `xani/`. This spec
connects them.*
