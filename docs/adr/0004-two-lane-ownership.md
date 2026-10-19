# ADR 0004 · Two lanes with module ownership

- **Status:** accepted · 2026-10-20

## Context
Two part-time developers (about 10–15 h/week each, about 6 months). They need to work simultaneously without blocking each other or fighting merge conflicts.

## Decision
- Work is split **by module**, not by frontend/backend, so each feature is built end to end by one person.
  - **Lane A (overxpowered):** platform (auth, RBAC, users, stores, audit, CI, tests, migrations tooling), POS and sales, inventory and stock (transfers, warehouse), accounting core, offline POS, deployment and ops.
  - **Lane B (kapilkurchaniya):** purchasing and suppliers, compliance registers, GST and e-invoice, CRM (customers, groups, loyalty, promise and external orders), communications (WhatsApp, SMS, reminders, outbox worker), reports and dashboards, AI assistant, data import.
  - *Change from the initial proposal:* purchasing moved from Lane A to Lane B to balance the load. Lane A owns the offline POS, which is the largest single item.
- Each lane has a long-lived branch (`lane-a/overxpowered`, `lane-b/kapil`) and merges to `main` only through reviewed PRs (docs/07-git-workflow.md).
- File ownership is encoded in `.github/CODEOWNERS`.
- The 1,261-line schema file is split per module (Phase 0) so ownership maps onto files.
- Cross-lane dependencies are handled with **contracts first** (🤝 in the roadmap): a tiny PR with types and stub functions is merged before either side builds on it.

## Consequences
- Each developer learns the other's area through PR review, which is mandatory.
- Some shared files (schema index, permissions, nav, package.json) need the protocols in docs/07.
- Lanes can be swapped or rebalanced per phase by editing the roadmap and CODEOWNERS in one PR.
