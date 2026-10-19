# MediFlow documentation

Start here. Each file answers one question. The order is the suggested reading order for a new contributor.

| # | File | Answers |
|---|------|---------|
| 01 | [Product vision](01-product-vision.md) | What are we building, for whom, and how do we win against Marg / GoFrugal / eVitalRx? |
| 02 | [Architecture](02-architecture.md) | How is the code organised? How does a request flow from a button to the database? |
| 03 | [Current-state audit](03-current-state-audit.md) | What exists today, what is half-built, what is broken? (snapshot: 20 Oct 2026) |
| 04 | [Database](04-database.md) | Schema conventions, table map, migration workflow for two developers |
| 05 | [Indian pharmacy & GST rules](05-domain-pharmacy-india.md) | Drugs & Cosmetics Rules, Schedules H/H1/X, GST 2.0 rates, e-invoice, DPDP |
| 06 | [Coding standards](06-coding-standards.md) | The patterns every server action, domain function and page must follow |
| 07 | [Git workflow (two lanes)](07-git-workflow.md) | Branches, PRs, the lane guard, day-to-day commands |
| 08 | [Local setup](08-local-setup.md) | From a fresh clone to a running app with seeded data |
| 09 | [Testing strategy](09-testing-strategy.md) | What to test, with which tool, and how to run it |
| 10 | [Offline POS design](10-offline-pos-design.md) | How billing keeps working when the internet drops |
| 11 | [Multi-store design](11-multi-store-design.md) | Store switching, warehouses, stock transfers, consolidated reports |
| 12 | [Data migration from Marg & others](12-data-migration.md) | The import wizard that lets shops leave their old software |
| 13 | [Security](13-security.md) | Threat model, known vulnerabilities, security checklist |
| — | [Glossary](glossary.md) | Every pharmacy, GST and engineering term used in these docs |
| — | [Decision records](adr/) | Why we chose what we chose (ADRs) |

The plan of work lives in [`../ROADMAP.md`](../ROADMAP.md). The contribution rules live in [`../CONTRIBUTING.md`](../CONTRIBUTING.md).

## Keeping docs alive

- If a PR changes behaviour that a doc describes, update the doc **in the same PR**.
- Regulatory facts (GST rates, schedules, thresholds) change. Every such fact in `05-domain-pharmacy-india.md` has a source and a "last verified" date. Re-verify before relying on it for a release.
- Architectural decisions go into `adr/` as a new numbered file. Never edit an accepted ADR; supersede it with a new one.
