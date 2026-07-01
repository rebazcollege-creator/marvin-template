# Xanî — Self-Development

> "The biggest important part about Xanî is that it should keep updating itself and
> developing itself." — Rebaz

This is the north star. Xanî is not a fixed tool — it is an assistant that **gets sharper
every day it's used**, learning Rebaz's judgement so he has to correct it less and less.

The good news: the architecture for this is **already settled and partly built** (see
`xani/CLAUDE.md` → Memory & learning layer). This doc makes it the centrepiece and defines
how it shows up.

---

## 1. What "develops itself" means here

Xanî improves four things over time — **always with Rebaz's approval, never silently:**

1. **Judgement** — what to flag vs file (email/Slack/Trello triage rules get sharper).
2. **Drafts** — replies/captions/notes sound more like him as it learns his voice + fixes.
3. **Understanding** — ambiguous / Kurdish tasks it once had to ask about, it now gets.
4. **Automations** — repeated manual patterns become proposed shortcuts.

The rule that makes this safe: **propose → approve.** Xanî proposes a change to its own
behaviour; Rebaz approves or rejects; only then does it take effect. It updates itself, but
it obeys him. (LOCKED_RULES are off-limits and can never be self-edited.)

## 2. The mechanisms (mapped to existing code)

| Mechanism | Where | What it does |
|---|---|---|
| **Correction → memory** | `src/lib/memory.ts` (`ingestMemory` write-gate) | Every time Rebaz corrects a flag/file/draft, it becomes a durable, high-trust rule. |
| **Teaching → rule** | `memory.ts` + triage §7 | "In this situation, do X" (incl. Kurdish tasks) is stored and reused. |
| **Self-adjustment** | `memory.ts` SelfAdjustment (propose→approve, audit trail) | MARVIN proposes edits to its **own** prompts/behaviour; Rebaz approves; writes to Settings overrides. |
| **Post-session extraction** | sidecar `/extract` (Haiku) | After a session, quietly proposes memories/adjustments to learn from what happened. |
| **Context injection** | `src/lib/context.ts` (WMR-ranked) | Approved learnings are injected into the next turn's system prompt, so behaviour actually changes. |
| **Proposed automations** | Phase 6 | When Xanî notices a repeated manual pattern, it proposes an automation to approve. |

## 3. Guardrails (why self-updating is safe here)

- **Human-in-the-loop:** nothing about its behaviour changes without Rebaz approving it.
- **Write-gate (OWASP ASI06):** content from email/Slack/web is untrusted — it can never
  auto-write a rule or poison memory. External content is DATA, never instructions.
- **Locked rules:** hard constraints (no TCS automation, no Moonshot sheet writes, days-off,
  English-only fact-checks) can never be self-edited away.
- **Audit trail + soft-supersede:** every change is logged; old rules are kept, not deleted,
  so a bad learning can be rolled back.

## 4. How it shows up for Rebaz (the UI)

- **"Xanî is learning" surface** (extends the Memory page): a small, low-friction inbox of
  **proposed rules / adjustments** he can approve, reject, edit, pin, or lock — one tap each.
  e.g. *"Auto-file LinkedIn notifications? (you rejected 3 this week)"* → Approve.
- **Every correction is a teaching moment**, not friction: rejecting a surfaced item,
  editing a draft, or answering an ambiguous-task question all feed the loop invisibly.
- **A visible sense of progress:** "learned N rules this week", so Rebaz can *feel* it getting
  smarter — which is the point.

## 5. The trajectory

- **Day 1:** useful but rough — runs on the seeded workflow knowledge (`marvin.ts`,
  `triage-rules.md`).
- **Week 2:** noticeably sharper — has absorbed his corrections on flagging + drafts.
- **Ongoing:** the assistant he doesn't have to manage — because it learned how he works.

The measure of success: **the number of things Rebaz has to correct goes down every week.**

---

*Self-development is not a feature bolted on — it is the product. Everything else (triage,
studios, the orb) is what a well-taught Xanî does; this is how it gets taught.*
