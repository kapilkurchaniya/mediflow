# ADR 0001 · Record architecture decisions

- **Status:** accepted · 2026-10-20

## Context
Two developers work in parallel lanes. Decisions made in one lane affect the other, and "why did we do it this way?" gets forgotten.

## Decision
Every significant technical decision gets a short markdown file in `docs/adr/`, numbered sequentially: `NNNN-kebab-title.md`. Each one has these sections: Status, Context, Decision, Consequences. An accepted ADR is never edited. A new ADR can **supersede** it, and the old one's status changes to "superseded by NNNN".

"Significant" means: a new dependency, a new table family, a change to a cross-cutting pattern (auth, money, sync, migrations), or anything that's hard to undo.

## Consequences
- Small overhead per decision; much less re-litigating later.
- The ADR number is referenced in PR descriptions.
