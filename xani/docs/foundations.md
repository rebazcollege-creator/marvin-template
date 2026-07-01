# Xanî — Foundations

> Rebaz built Xanî before he knew he had ADHD. Knowing it now changes the *premise*.

## The reframe

Xanî is **not** a generic executive assistant that happens to be tidy. Xanî is a
**prosthetic executive function** — an external brain that does the specific jobs an ADHD
brain struggles to do on its own, so Rebaz's actual talent (judgement, writing, reporting)
is freed from the parts that drain it.

Every feature must earn its place by answering **one ADHD challenge**. If a feature doesn't
map to a challenge below, it's decoration — cut it.

## The nine challenges → what Xanî does about each

| ADHD challenge | What it feels like | Xanî's job |
|---|---|---|
| **1. Working memory** | "I said ok and forgot." | **Hold everything.** Open Loops captures every commitment (Slack/Trello) and never lets it drop. Rebaz never has to *remember* — Xanî remembers for him. |
| **2. Task initiation** ("wall of awful") | Can't start, even knowing what to do. | **Lower activation energy.** One thing at a time, a "Focus with me" body-double + timer, the first step named for him. |
| **3. Time blindness** | 5 minutes = 2 hours; deadlines sneak up. | **Make time physical.** "42 min until Standup", the day as a visible track, time-boxed focus. |
| **4. Overwhelm** | 40 emails = freeze. | **Pre-decide.** Xanî triages everything and shows *decisions*, not feeds. Raw inboxes are a place he *can* go, never the default. |
| **5. Object permanence** | Out of sight = gone. | **Surface, don't store.** Nothing important lives only in a scrollback he'll never reopen. It comes to him. |
| **6. Prioritisation paralysis** | Everything feels equally urgent. | **Name the one thing.** Xanî ranks and says "this, now" — removes the meta-decision of what to do first. |
| **7. Dopamine / motivation** | Boring-but-important tasks stall. | **Reward momentum.** Streak, wins, satisfying completion, small celebrations — motivation engineered in, not willpower. |
| **8. Follow-through & RSD** | Dropped commitments → shame spiral. | **Gentle, not nagging.** Nudges without guilt; "you said ok" stated as fact, never a scolding. Closing a loop feels good, not relieving-of-blame. |
| **9. Variable energy** | Great day vs can't-focus day. | **Adapt to the day.** A low-focus mode (fewer items, lower stimulation, "just one thing") vs a high-energy mode. Xanî meets him where he is. |

## Design principles that follow

1. **One thing, never a wall.** The home shows a single focus + a short, closeable list — never a dashboard of twenty doors.
2. **Xanî decides; Rebaz confirms.** It does the deciding (what matters, what to draft) so his limited executive fuel goes to judgement, not triage. (Still draft-and-approve — he keeps control.)
3. **Externalise, don't rely on memory.** If it depends on Rebaz remembering, it's a bug.
4. **Calm is a feature, not a style.** Quiet Stone (warm paper, muted colour, generous space, low motion) is chosen because visual noise *is* cognitive load for ADHD. Colour is for wayfinding, not decoration.
5. **Time is always visible.** Fight time-blindness on every surface.
6. **Progress is felt.** Completion is satisfying and visible — dopamine is designed in.
7. **No guilt, ever.** Tone is a warm, competent colleague, never a taskmaster. Missed things are surfaced neutrally and handled, not moralised.
8. **Meet the energy.** The app flexes between a focused/low-stim mode and a fuller mode.
9. **It learns him.** Every correction makes it fit *his* brain better (see `self-development.md`) — because ADHD support is deeply individual.

## What this changes going forward

- **Home = the executive-function surface** (Open Loops + one thing + gentle triage), not a "briefing dashboard."
- **MARVIN's tone** (`prompts/marvin.ts`) gains an explicit ADHD-aware, no-guilt, decide-for-him directive.
- **A day-shape / energy mode** becomes a first-class idea (low-focus vs high-energy).
- **Every new feature** is justified against the nine challenges — or it doesn't ship.
- The **identity** (Quiet Stone, no orb, calm) is now *principled*, not just a taste choice.

## What stays

The brain we already built is right for this: Open Loops (working memory), one-thing/focus
(initiation), triage (overwhelm), momentum (dopamine), the learning loop (individual fit),
draft-and-approve (control without effort). The reframe doesn't discard them — it **explains
why they're the core**, and tells us what to add (time-visibility everywhere, energy modes,
no-guilt tone) and what to keep out (noise, walls of choice, nagging).

---

*This is the premise. Everything else in `docs/` (triage-rules, self-development,
capabilities) is how a well-built prosthetic executive function does its job.*
