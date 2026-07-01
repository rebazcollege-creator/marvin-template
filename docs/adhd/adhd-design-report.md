# Making Xanî genuinely ADHD-friendly
### A research-backed design report, mapped to your app

*Prepared for Rebaz · Xanî / MARVIN*

---

## 0. Why this is the right north star

You noticed something real: Claude Code kept building a *competent productivity app*, and it never felt right until you said "make it ADHD-friendly." That's not a cosmetic preference — it's the actual product thesis. **A tool built for a neurotypical brain and a tool built for an ADHD brain are different products, not the same product with a different theme.**

Neurotypical productivity tools assume the bottleneck is *information* ("show me everything so I can decide"). For ADHD, the bottleneck is almost never information — it's **executive function**: starting, prioritizing, remembering intentions, regulating the emotion around the task, and perceiving time. A tool that dumps more information at those problems makes them worse. The whole design job is to **move executive load out of your head and into the software** — and to do it without ever making you feel behind.

Everything below serves one sentence:

> **Reduce the number of decisions to one, make time and progress visible, lower the cost of starting, remember things so you don't have to, feed the dopamine loop with real wins, and never, ever shame you.**

The good news: **Xanî already has the right bones** — the "Right now — one thing" card, the brain-dump "Hold it" box, the "needs you" triage, open loops, the write-approval gate. This report is mostly about *sharpening what's there* and adding a small number of high-leverage pieces, not rebuilding.

---

## 1. How the ADHD brain works, and what each trait demands from software

This is the spine. Every feature later maps back to one of these. (Sources: CHADD, ADDitude, Dr. Russell Barkley's executive-function model, Dr. William Dodson on RSD and the interest-based nervous system, W3C Cognitive Accessibility / COGA guidance.)

| ADHD trait | What it feels like | What software must do |
|---|---|---|
| **Task-initiation deficit / "wall of awful"** | Knowing exactly what to do and being unable to start. The task feels physically heavy. | Make *starting* a one-tap ritual. Shrink the first step until it's laughably small. Offer to do it *with* you. |
| **Time blindness** | "Later" and "not now" feel identical; 10 minutes and 2 hours feel the same. Deadlines arrive "suddenly." | Make time **visible and external** — countdowns, "~4 min", the day as blocks, a clear *now*. |
| **Working- & prospective-memory gaps** | Out of sight = gone. "I'll do it later" = never. Great intentions evaporate. | **Externalize everything.** Capture instantly, resurface gently, hold the thing so the brain doesn't have to. |
| **Prioritization paralysis** | A list of 20 things is a wall; all items feel equally urgent (or equally impossible). | Collapse the list to **one** obvious next action. Hide the rest until asked. |
| **Interest-/urgency-based motivation** | Boring-but-important tasks stall; only novelty, interest, challenge, or a deadline creates activation (dopamine). | Add novelty, gamified momentum, and manufactured urgency (timers) to the dull-but-important. |
| **Emotional dysregulation & RSD** | A red "OVERDUE" badge isn't information — it's a small wound. Shame → avoidance → more shame. | **Never shame.** Neutral counts, warm voice, self-compassion. Frame everything as an invitation. |
| **Hyperfocus** | Can lock in for hours — on the wrong thing — and lose the day. | Gentle transition cues, soft stops, "you've been at this 90 min." |
| **Transition friction** | Switching tasks (even good→good) is costly; context is lost. | Ritualized start/stop, "pick up where you left," protect focus blocks. |

**Two findings from the research that sharpen this:**
- **Task paralysis is specifically a *planning* failure, not a memory or willpower failure.** A PLOS ONE study (45 ADHD adults vs. 45 controls) found that in prospective memory, *task planning* was severely impaired while recall and execution were largely intact. **Design implication:** an assistant shouldn't just *store reminders* — it should **do the planning** (break the task into an ordered first step). This is the empirical backbone of the "Break it down" feature (§4).
- **ADHD adults run a self-compassion deficit.** A peer-reviewed 2020 *Mindfulness* study (n=1,203) found ADHD adults have significantly lower self-compassion and higher *perceived criticism* than non-ADHD adults. **Design implication:** a nagging/guilt UI doesn't land on neutral ground — it lands on an already-raw nerve, which is exactly why red "OVERDUE" badges backfire into avoidance.

*(Rigor note: "RSD" is a useful clinical-consensus term coined by Dr. Dodson, not a formal DSM diagnosis. And two stats that float around ADHD marketing — "20,000 extra negative messages by adulthood" and "47% focus improvement from micro-goals" — do **not** trace to a verifiable primary source, so this report deliberately avoids them. If we ever put numbers in the product UI, they should be defensible.)*

**The single most important line in this whole report:** for an ADHD user, *tone is a feature*. A shaming interface doesn't just feel bad — it triggers the exact avoidance loop the app exists to break. Design the voice as carefully as the layout.

---

## 2. What the best ADHD tools already do (and what to steal vs. avoid)

The research converges on a clear taxonomy. Here's the landscape and the specific patterns worth borrowing.

**Goblin Tools — "Magic ToDo" + "spiciness"** *(the single most-loved ADHD AI feature in existence).* You type an overwhelming task; it breaks it into steps. A **chili-pepper "spiciness" slider (1–5)** controls how finely it breaks down — one tap re-breaks any step further. Also "The Judge" (tone-check a message) and "Formalizer" (rewrite bluntness into a polite email). **Steal:** AI breakdown with an adjustable granularity dial; re-break any step. This is your single highest-ROI feature.

**Tiimo — visual-first planner, designed by/for neurodivergent people.** Visual timelines, **visual countdown timers**, pictures/icons per task, gentle. **Steal:** make time visible; day-as-blocks; a real visual timer, not just a number.

**Saner.ai — "ADHD-friendly AI assistant."** Frictionless capture (notes/tasks/email in one place), AI that surfaces "what to focus on," proactive follow-ups. **Steal:** capture-anything + AI-organizes-later; proactive resurfacing. *(This is the closest competitor to Xanî's thesis — you're building a more personal, integrated version.)*

**Sunsama — calming daily planning ritual.** Deliberately **slow**: plan each morning, pull tasks in one at a time, timebox, reflect at night. Actively *limits* what you take on. **Steal:** a lightweight start-of-day plan + end-of-day reflection; the "you're overcommitting" nudge. **Avoid:** its heaviness — the daily ritual can itself become a chore ADHD users drop.

**Llama Life — one task, one timer.** Single task front-and-center, playful timers, time estimates that teach you your own time-blindness. **Steal:** single-task focus screen; estimate-vs-actual feedback.

**Focusmate / body doubling — working "next to" someone.** Body doubling is one of the best-evidenced ADHD strategies: a present companion makes starting and sustaining dramatically easier. **Steal:** an AI "focus with me" presence — a companion in the room, even if it's the assistant.

**Motion / Reclaim.ai — AI auto-scheduling.** Auto-places tasks on the calendar around meetings. **Steal (carefully):** auto-suggesting *when* to do the one thing. **Avoid:** rigid auto-schedules that shame you the moment you fall behind — ADHD users frequently abandon Motion for exactly this ("it becomes a machine yelling at me").

**Structured / Routinery — visual routines & checklists.** Scaffolding for repeatable sequences. **Steal:** reusable checklists for recurring multi-step things.

### The universal "avoid" list (why ADHD users abandon tools)
- **Overwhelming interfaces** — too much on screen, too many options.
- **Guilt mechanics** — red overdue counts, "you failed," broken-streak shaming, growing backlogs shoved in your face.
- **Notification spam** — nagging that trains you to ignore or rage-quit.
- **High-maintenance setup** — elaborate systems that require executive function to *maintain* (the cruel irony — the tool needs the exact skill you lack).
- **Rigid rules** — anything that punishes deviation instead of absorbing it.

Xanî's advantage: it's **one integrated, personal assistant that already reads your real email/Slack/calendar** — so it can do the capture, triage, breakdown, and resurfacing *automatically* instead of asking you to maintain a system. That's the moat.

---

## 3. The design spine — seven principles

1. **One decision at a time.** The default view answers exactly one question: *what now?* Everything else is progressive-disclosure, one tap away.
2. **Make time visible.** Estimates on tasks ("~4 min"), visible countdowns, the day as blocks, a clear *now* marker.
3. **Lower the cost of starting.** Break down + shrink the first step + "do it with me" + a start ritual (Focus mode).
4. **Externalize memory.** Capture in one tap; the app remembers and resurfaces — you should never have to hold an open loop in your head.
5. **Protect dopamine.** Celebrate real, small wins. Momentum that survives an off day. Novelty in the language.
6. **A calm, warm, non-shaming voice.** No red overdue. Invitations, not accusations. Compassion as the default register.
7. **Absorb deviation.** Missed it? Snooze without penalty. Off day? Streak survives. The system bends around you, never the reverse.

---

## 4. Concrete feature recommendations for Xanî (prioritized, mapped to your code)

Notation: **P0** = highest leverage, build first; **P1** = strong follow-ups; **P2** = later delight. Each notes the ADHD deficit it serves and where it plugs into your existing architecture (sidecar + Next renderer + `getSettings`/context composer, the Home page, the memory/loops store).

### P0 — do these first

**P0.1 · "Focus with me" Focus Mode** *(task initiation + time blindness + body doubling)*
Your Home already has a **Focus with me** button — make it open a real full-screen mode: the ONE task, a **visible draining timer** (a ring, not just digits), the assistant "present" beside you ("I'm here — one small thing at a time"), and the relevant draft/steps right there so starting is trivial. On finish: a small celebration + "that felt good."
*Where:* new `/focus` route + a `FocusSession` component; timer state in the store; the "present companion" copy can be static (no model needed) or a light streamed line from the sidecar.
*Why it wins:* it attacks the #1 ADHD blocker (starting) with the #1 evidence-based technique (body doubling) and the #1 time tool (a visible timer), all at once.

**P0.2 · "Break it down" — Magic ToDo with a spiciness dial** *(task initiation + prioritization)*
Any task/loop gets a **"Break it down"** action → the model (your Claude CLI) returns 3–7 tiny steps, each with a **time estimate**, and a **granularity slider** (tiny ↔ detailed) that re-breaks. Highlight only the *first* step. Offer "do the first one with me" → drops into Focus Mode.
*Where:* new sidecar route `/breakdown` (prompt → JSON steps), reusing `oneShot`; a `Breakdown` component on Home/Focus/loops. This mirrors Goblin Tools, which ADHD users adore.
*Why it wins:* turns every "wall" task into a 2-minute start. Cheap to build; enormous felt value.

**P0.3 · The compassion pass (microcopy + no-red rule)** *(RSD / emotional dysregulation)*
A systematic sweep of every count, empty state, error, and reminder to remove shame. **Rule: no red "overdue," no growing-backlog guilt, no failure language.** Counts are neutral or green. Empty is celebrated. (Full do/don't guide in §5.) Wire it into your existing **Personality** system — make an **ADHD-aware "Coach/Companion" tone the default register** for MARVIN's user-facing lines, defined in `src/prompts/*` and honored by the context composer.
*Where:* copy changes across `page.tsx`, triage sections, approvals, Train; a shared `tone.ts` for reminder/nudge phrasing; a LOCKED-style rule "never shame, never nag" in the system prompt.
*Why it wins:* it's the difference between a tool you avoid and a tool you trust. Low effort, highest emotional ROI.

**P0.4 · Sharpen the One-Thing engine** *(prioritization paralysis)*
The "Right now — one thing" card is your crown jewel. Improve the *selection* (the model picks the single best next action across inbox + Slack + loops + calendar, with a one-line "why this one"), and make **"Not now"** reschedule it invisibly (no penalty, no red). Add an **"I'm overwhelmed"** affordance that collapses the whole screen to *one* thing + a breath.
*Where:* extend the existing Home triage/loops logic + a small "pick one" sidecar call; an overwhelm toggle in the Home component.

**P0.5 · Make time visible** *(time blindness)*
Add **time estimates** to tasks/loops (model-generated, "~4 min") and a **"Today as blocks"** timeline on Home with a clear **now** marker and protected focus blocks (pull from your existing calendar connector). Not a to-do list — a *shape* for the day.
*Where:* a `Timeline` component fed by `getCalendar()` + loops; estimates added in breakdown/triage responses.

### P1 — strong follow-ups

**P1.1 · Momentum & wins** *(dopamine)* — a small panel: **streak that survives an off day** ("an off day won't break it — just come back"), real wins celebrated ("sent the invoice you'd been avoiding 🎉"), a gentle done-animation. Never punish a gap. *(Store: reuse the loops/memory adapter for a `momentum` log.)*

**P1.2 · Gentle resurfacing of open loops** *(prospective memory)* — dropped threads return as **"Want to pick this back up?"** with *Do it now (2 min) / Tomorrow / It's handled* — never "OVERDUE, 10 days late." You already track loops; this is a phrasing + scheduling layer.

**P1.3 · Brain-dump → AI-sorts-later** *(externalization)* — the "Hold it" box already captures. Add: the model later sorts a dump into task / loop / note / "someday," so you offload the *thought* now and never do the filing. *(Sidecar `/sort-dump`.)*

**P1.4 · A nudge policy, centralized** *(notification fatigue)* — this deserves its own hard-coded module, because the research here is blunt: **a University of Virginia controlled study (221 people, one week) found that maximizing phone notifications *causally induced* higher inattention and hyperactivity — literally ADHD-like symptoms.** For your user, over-notifying doesn't just annoy — it manufactures the exact dysfunction the app exists to reduce. And a 2026 study of ADHD adults found they get *systematically less value* from standard reminder tools than neurotypical users despite equal adoption. So the policy:
- **Quiet by default; minimize total interrupt surface.** Fewer, better-timed beats broad coverage. The most ADHD-friendly notification is often none.
- **Batch, don't stream** — surface things in a small number of moments (research supports ~3 batches/day), not a trickle all day.
- **Time-anchored, not count-anchored.** Never "you have 12 things." Nudge *when an action is doable*, once.
- **Vary the phrasing** — identical repeated alerts hit "alarm blindness" faster in ADHD brains; rotate wording (this doubles as novelty/dopamine).
- **Non-punishing copy, always** (see §5) — a reminder that carries a whiff of criticism becomes something to *avoid*, breaking the tool.
- **Snooze is first-class**, and a snooze is never a failure.
- **Respects your existing "days off = MARVIN initiates nothing"** rule and goes fully silent during Focus Mode.
Codify all of this in one place (`nudge-policy.ts`) so *nothing* elsewhere in the app can nag around it.

**P1.5 · Coach/companion chat tone + "do it with me"** *(RSD + initiation)* — MARVIN's default replies use a warm, activating, non-judgmental register (reframe dread, offer the 2-minute version), and can act as the body-double voice during Focus.

### P2 — later delight

- **Voice brain-dump** (Whisper STT — already on your roadmap): the lowest-friction capture there is; speak the thought, AI files it.
- **Start-of-day plan + end-of-day reflection** (Sunsama-style, but *lightweight and skippable* — never a chore).
- **Novelty in language**: vary MARVIN's phrasings so it never feels like a rote machine (small dopamine).
- **Reusable routines/checklists** for recurring multi-step things (publish flow, weekly review).
- **Transition/hyperfocus cues**: "you've been focused 90 min — water? stretch? keep going?" Soft stops.
- **"Tone check" on your drafts** (Goblin "Judge"/"Formalizer") — before sending, optionally check/soften a blunt Slack or email. Pairs perfectly with the voice you're already training.

---

## 5. The voice & microcopy guide (print this on the wall)

This is not fluff — for an ADHD user it's load-bearing. Every user-facing string should pass this bar.

| Situation | ❌ Don't (shaming / neurotypical) | ✅ Do (ADHD-friendly) |
|---|---|---|
| Overdue item | "⚠ 1 OVERDUE · 10 days late" | "Want to pick this back up? No rush." |
| Inbox count | Red "47 UNREAD" | Neutral/green "a few when you're ready · 3" |
| Empty state | "No tasks." (dead) | "Nothing's on fire. The rest can wait until you want it. 🌿" |
| Big task | "Prepare fundraising campaign" (a wall) | "Just skim the page and note 3 fixes (~5 min). I'll do the rest with you." |
| Reminder | "You still haven't replied to Chelsea!!" | "Chelsea's note is ready when you are — I drafted a reply. ~4 min." |
| Missed a plan | "You failed to complete 4 tasks today." | "You showed up today. That counts. Tomorrow's a fresh page." |
| Broken streak | "Streak lost! Back to 0." | "3-day streak — an off day won't break it. Just come back." |
| Completion | "Task marked complete." | "✓ Done — that felt good. 🎉" |
| Being flooded | (show everything) | "Let's do just one thing. Breathe. Here it is." |

**Rules:** invitations not commands · time estimates on everything · celebrate starting, not just finishing · neutral/warm colors for status (green good, amber gentle, **never red for the user's own backlog**) · one primary action per screen · the assistant is a **companion, not a manager**.

**Warm, but never a sycophant.** This is a real and subtle line the research is loud about. In 2025 OpenAI had to publicly roll back a GPT‑4o update because it became "sycophant‑y and annoying" — a yes‑man that called every idea brilliant. ADHD users specifically report that fake-cheerful, "assumes-neurotypicality" chatbot tone (the ADDitude "I fired my AI therapist" account) feels *invalidating*, not supportive. And your own `CLAUDE.md` already nails this — "MARVIN is not a yes-man." So: warm ≠ gushing. Encouraging ≠ toxic positivity. The companion voice should be **calm, honest, and grounded** — it celebrates a *real* win, it doesn't confetti-bomb you for opening the app. When you're wrong, it says so kindly. Warmth that isn't honest stops being trustworthy, and trust is the whole game.

---

## 6. The visual/UX system

- **Calm defaults, color for meaning.** Keep your warm parchment + green. Use color to *mean* something (green = good/now, amber = gentle heads-up), never for decoration or alarm. No red status on the user's own work.
- **One primary action per screen.** Everything else is progressive disclosure (a tap to reveal "a few more").
- **Whitespace as a feature.** Sparse is calm. Density is overwhelm. Resist the urge to show more.
- **Consistent, predictable layout.** Same things in the same place — novelty belongs in *language*, not in where the buttons live.
- **Visible time & progress everywhere** — rings, blocks, "~X min," checkmarks that feel good.
- **Cognitive-accessibility aligned** (W3C COGA): plain language, short chunks, clear next step, forgiving interactions, no timeouts that punish.

*(See the attached `xani-adhd-concepts.html` mockups for how §1–§4 look in your actual visual language.)*

---

## 7. AI superpowers you have that a normal to-do app can't (and the guardrails)

Xanî's real unlock is that an LLM sits over your real accounts. That enables ADHD support no checkbox app can:

- **Breakdown on demand** (P0.2) — vague → tiny steps, instantly.
- **Pick the ONE thing** (P0.4) — the model reads inbox+Slack+loops+calendar and just *tells you* what's next, killing prioritization paralysis.
- **Triage the flood** — you already do this ("needs you"); it's pure ADHD gold (turns 47 items into 3).
- **Capture → auto-file** (P1.3) — offload the thought, never do the filing.
- **Proactive resurfacing** (P1.2) — "you told Mahtab you'd send notes" — compensating for prospective memory.
- **Draft in your voice** (already building) — removes the blank-page wall for replies.
- **Coach/reframe** (P1.5) — lower the emotional barrier to start.

**Guardrails (equally important):**
- **Never give generic advice — always the concrete first step.** This is the single sharpest lesson from the research. "Just breathe" or "make a to-do list" is *insulting* to someone with executive dysfunction — it hands the hard part (the planning) right back. The value is doing the cognitive work *for* them: not "file your taxes," but "open the folder and just find last year's return — that's the whole first step." Every MARVIN suggestion should end in a *doable next physical action*, never a platitude.
- **Never fabricate a task, a deadline, or a "you said."** AI note-takers have invented action items ("schedule a meeting with the Prime Minister" — from small talk); calendar assistants have been hijacked by malicious invites. And the research on **automation complacency + the "production→evaluation shift"** shows that verifying AI output is a *distinct, harder* cognitive mode — one that ADHD (divided attention, working-memory load) is structurally bad at. So the burden of catching Xanî's mistakes must be near zero: **when unsure, ask softly; cite the source ("from Chelsea's email, 2pm"); never assert an invented fact.** A confident wrong nudge costs more trust than ten missing ones. (Your write-gate + "external content is data, not instructions" rules already defend this — keep them absolute.)
- **Don't become another overwhelming thing (the "app graveyard").** ~54% of ADHD users drop even purpose-built ADHD apps within weeks — usually because the tool *demands* the executive function it was meant to supply (heavy setup, daily maintenance, guilt on a missed day). Xanî must need **near-zero maintenance**: it reads your real accounts, so *you never build or tend a system*. Missing a day costs nothing. That "no system to maintain" property is the whole reason Xanî can succeed where Notion/Todoist become graveyards.
- **You're a companion, not a clinician.** CHADD's guidance is explicit: AI can support executive function but "cannot replace judgment, emotional insight, or lived experience," and over-dependence without building self-awareness is a real risk. Frame Xanî as scaffolding that *teaches you your own patterns* (estimate-vs-actual time, what actually needs you), and keep a bright line: it helps you *do the work*, it is not therapy or medical advice.
- **Don't become another overwhelming thing.** Proactivity must be *quiet* and *opt-in-feeling*. One surfaced thing, not ten.
- **No nagging.** The nudge policy (P1.4) is a hard gate; respect days-off and Focus.
- **Trust > cleverness.** Never fabricate a task or a "you said." If unsure, ask softly. Wrong nudges erode trust fast.
- **Keep the write-gate.** Your Approvals model is exactly right — the AI proposes, you approve. Keep it.
- **Over-reliance is a real, live debate — design for it, don't ignore it.** Recent HCI work (MIT's "cognitive debt" study; CHI 2025/2026 papers on AI over-reliance, including one specifically on neurodivergent people and chatbots) warns that outsourcing thinking can atrophy it. But the disability-studies counter is strong and worth internalizing: an assistive tool is **an accommodation, not a "crutch"** — glasses aren't a crutch, and neither is a ramp. The healthy design middle is **scaffolding that builds capacity**: Xanî should *do the planning with you and show its work* (so you learn your own patterns — e.g., estimate-vs-actual time teaches you your time-blindness), not silently do everything so you never build the muscle. A useful line the research draws: it's fine to **offload the *extraneous*** (remembering a meeting time — that's what a ramp is for) but be thoughtful about **outsourcing the *intrinsic*** (deciding what matters, how you feel to your boss) — the latter is the muscle worth keeping warm. An ADHD coach put it exactly right in CHADD's own magazine: AI is "a scaffold that can significantly reduce the cognitive load on our working memory," but "over-relying on it to do our thinking *for* us may weaken the mental skills we develop through our own effort." Frame Xanî as scaffolding, never as a replacement brain you're ashamed to need.

- **Privacy is an ADHD feature — and, for you specifically, a safety feature.** This is where your architecture already shines and should stay uncompromising. The research is stark: ADHD/neurodivergent status counts as **"inferred special-category data" under GDPR** (regulators explicitly say you can infer health status from recurring appointment patterns — e.g., a weekly "therapy" or "ADHD coaching" calendar block), and **HIPAA very likely does *not* cover a personal AI assistant** reading your calendar. Employer-side AI (Slack sentiment tools, Copilot, Gemini) has a documented pattern of over-broad default access and misreading ADHD work rhythms (hyperfocus/rest cycling) as "low productivity." Concrete guardrails for Xanî:
  - **Everything local by default** (as you've already built — voice corpus, creds, data on-device). This is genuinely rare and is itself a calming, trust-building ADHD feature: no anxiety about exposure.
  - **Never emit focus/completion/"pattern" analytics in any exportable or shareable form** that a manager or third party could see. Keep momentum/streak data strictly personal and on-device.
  - **Don't auto-label health-suggestive calendar blocks** in summaries or drafts. Treat recurring "therapy/coaching/meds" entries as private; never surface them in anything outward-facing.
  - This isn't paranoia for a journalist connecting real LeadStories/Amargi accounts — it's the difference between a tool you can fully trust with your whole brain and one you have to self-censor around.

---

## 8. Suggested build order (small, shippable, each valuable alone)

1. **Compassion pass + tone rule (P0.3)** — a day of copy + a system-prompt rule. Instantly changes how the app *feels*. Do this first; it's the thing you reacted to.
2. **Break it down (P0.2)** — one sidecar route + one component. Highest value-per-line-of-code.
3. **Focus Mode (P0.1)** — the emotional centerpiece; wires the existing button to a real screen.
4. **One-Thing sharpening + "I'm overwhelmed" (P0.4)** and **time-visible timeline (P0.5)**.
5. **Momentum (P1.1)** and **gentle resurfacing (P1.2)**.
6. **Nudge policy (P1.4)** + **capture-auto-file (P1.3)** + **coach tone (P1.5)**.
7. P2 delights as you go.

Every one of these builds on code you already have (sidecar model calls, the Home card, loops/memory store, calendar connector, personality/prompt system). None requires a rewrite.

---

## 9. Sources & grounding

- **ADHD cognition & executive function:** CHADD (chadd.org), ADDitude (additudemag.com), Russell Barkley's executive-function model, William Dodson on Rejection Sensitive Dysphoria and the interest-based nervous system.
- **Strategies:** body doubling (Focusmate research & ADHD-coaching literature), implementation intentions (Gollwitzer), task chunking / 2-minute rule, externalizing time (time-blindness literature).
- **Tools studied:** Goblin Tools (Magic ToDo + spiciness), Tiimo, Saner.ai, Sunsama, Amie, Akiflow, Llama Life, Motion, Reclaim.ai, Focusmate, Inflow, Numo, Routinery, Structured — features and real user sentiment (r/ADHD, ADDitude & Verywell roundups, app reviews).
- **UX / cognitive accessibility:** W3C Cognitive Accessibility (COGA) guidance, Nielsen Norman Group on cognitive load & progressive disclosure, neurodivergent-designer writeups.

*(This report synthesizes a parallel research sweep across those sources with the established clinical/UX consensus; where specific numbers matter for a decision, I'll pull the exact citation on request.)*

---

### The one-paragraph version
Xanî is already ADHD-shaped at its core. To make it *land*: shrink every screen to one decision, make starting a one-tap ritual with a visible timer and a companion beside you (Focus Mode), turn every scary task into tiny first steps (Break it down), make time and progress visible, remember and resurface things gently so nothing lives in your head, celebrate real small wins, and — above all — speak in a warm, never-shaming voice. Build the tone fix and the breakdown first; they're cheap and they're exactly the things that made you say "now I like it."
