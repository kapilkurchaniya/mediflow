## What & why
<!-- One or two sentences. Link the roadmap item, e.g. "ROADMAP A1.2 — enforce permissions in server actions". -->

Roadmap item: 

## Lane
- [ ] Lane A (overxpowered)
- [ ] Lane B (kapilkurchaniya)

## Checklist
- [ ] I merged the latest `main` into my lane branch before opening this PR
- [ ] `npm run typecheck`, `npm test` and `npm run build` pass locally
- [ ] New/changed server actions check a permission (`requirePermission`) and scope every query by `tenantId` (and `storeId` where relevant)
- [ ] Money is integer paise, rates are basis points
- [ ] Schema change? Migration generated **after** merging latest `main` (see docs/04-database.md), and only one migration file in this PR
- [ ] Touched a shared file (schema index, permissions, Sidebar/nav, package.json)? Told the other lane
- [ ] Added/updated tests for domain logic
- [ ] Updated docs if behaviour changed

## How to test
<!-- Steps the reviewer can follow locally. -->

## Screenshots (UI changes)
