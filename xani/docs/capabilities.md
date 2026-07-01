# Xanî — Generation & External Skills

Capabilities Rebaz has **already built as Claude skills / Cowork skills**. Xanî should
*orchestrate* these, not reinvent them — MARVIN recognises the intent and hands off to the
right existing skill, then routes the result through Approvals (draft-and-approve).

---

## 1. Invoicing

Rebaz built dedicated Claude skills yesterday for:

- **Moonshot invoice** — generate his Moonshot consulting invoice.
- **LeadStories invoice** — generate his LeadStories fact-checking invoice.

Xanî's role:
- Recognise "make my Moonshot invoice" / "invoice for LeadStories" (and proactively suggest
  it on the usual cycle — Moonshot is biweekly; LeadStories per his shift/period).
- Invoke the corresponding skill with the right period + figures (pulled from his tracked
  work where possible).
- Return the invoice as a **draft for approval** — never send/file without his tap.
- Keep these as **skills he owns**; Xanî supplies the inputs and context, the skill does the
  generation.

## 2. Moonshot link processor (Claude Cowork skill)

Rebaz built a **Cowork skill** for Moonshot monitoring:
- **Input:** a list of links (TikTok / Facebook accounts to monitor).
- **What it does:** Cowork processes all of them and **takes the screenshots** for him
  (the manual capture step of the 40-accounts-per-cycle workflow).

Xanî's role:
- When Rebaz has a batch of Moonshot links, hand them to this Cowork skill to process +
  screenshot in bulk.
- Collect the outputs back into the Moonshot studio for his review/report drafting.
- **Constraint (unchanged):** no automated writes into Moonshot's official spreadsheets —
  Xanî prepares/drafts; Rebaz enters. Screenshots + link processing are fine (his own tool).

## 3. How this fits the architecture

- These live alongside the in-app **Studios** (Amargi / LeadStories / Moonshot). A Studio can
  **call out to an external skill** for a specialised job (invoice, bulk screenshotting)
  instead of doing it inline.
- Everything they produce is a **draft/artefact for approval**, consistent with the
  draft-and-approve gate.
- Xanî should **learn the triggers** (§ self-development): when Rebaz asks for these, and on
  what cycle, so it can offer them proactively ("Moonshot cycle ends Friday — want me to run
  the link processor and start the invoice?").

## Open confirmations
1. How are the invoice / Cowork skills invoked from his setup (Claude Code skill names?
   Cowork workflow) — so Xanî can trigger or hand off cleanly.
2. Should Xanî **proactively** offer these on a schedule (Moonshot biweekly, LeadStories per
   period), or only on request?
