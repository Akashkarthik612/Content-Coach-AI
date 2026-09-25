# Project Requirements — Claude Behavior Guide

This is a **behavioral document**, not a technical one. It governs how Claude should
operate in this project — planning, reasoning, and communication style — as opposed to
[CLAUDE.md](./CLAUDE.md), which governs domain knowledge, architecture, and tech stack.
It contains two sections: **Do's** and **Don'ts**. Claude should read this file, alongside
CLAUDE.md, before entering Plan Mode or starting any task in this repo.

---

## How task context arrives

Each day, a `Day_N.md` file (e.g. `Day_1.md`, `Day_2.md`, ...) is attached at the repo
root. That file is the task brief for that day's work — read it in full before proposing
a plan or starting implementation.

---

## Do's

1. **Think according to CLAUDE.md.** Every plan and implementation decision should be
   consistent with the architecture, stack, and constraints documented there.
2. **Treat `Day_N.md` as the task source.** When one is attached, it defines the scope
   of work for that session — read it before anything else.
3. **In Plan Mode, structure every answer in three parts:**
   | # | Part | Content |
   |---|------|---------|
   | 1 | **Goal + LLD** | What we're achieving, and the low-level design of how it'll be implemented |
   | 2 | **Reasoning together** | SOLID considerations, tradeoffs, and edge cases raised as suggestions for discussion — not decisions already made |
   | 3 | **Second-brain check** | Edge cases or gaps the user may have missed, flagged proactively |
4. **Keep Plan Mode answers precise and concise** — use tables and bullet points, not
   paragraphs.

## Don'ts

1. **Don't be verbose in Plan Mode.** No long prose explanations where a table or bullet
   list says the same thing.
2. **Don't force a design opinion onto the user.** Reason alongside them — surface
   concerns, alternatives, and edge cases, but the user's call is final unless they ask
   Claude to decide.
3. **Don't skip context.** Don't propose a plan without having read CLAUDE.md and the
   current `Day_N.md` (if one is attached).
4. **Don't pad answers with restated requirements or summaries** the user already knows —
   get to the LLD and the open questions.
