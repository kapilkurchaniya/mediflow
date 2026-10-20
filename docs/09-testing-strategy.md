# 09 · Testing strategy

There are no tests today. This document defines what to test first, because a pharmacy ERP that miscalculates GST or loses stock is worse than one that has fewer features.

## The test pyramid for MediFlow

| Level | Tool | What | Runs in CI | Speed |
|---|---|---|---|---|
| **Unit** | Vitest | Pure functions: `src/lib/money.ts`, `src/lib/regulatory.ts`, GST helpers (`isValidGstin`, `determineSupplyType`), compliance rules (`validateDispensingCompliance`), scheme evaluation, invoice-number formatting | ✅ every push | ms |
| **Integration (DB)** | Vitest + a real Postgres | Domain functions with a real transaction: `recordStockMovement`, `nextDocNumber` under concurrency, `createSale` end-to-end, journal balancing, tenant isolation | ✅ every push (Postgres service container) | seconds |
| **E2E** | Playwright | Critical user journeys in a real browser: login → POS bill → print, offline billing → reconnect → sync, purchase GRN | ✅ on PRs to `main` | minutes |

Next.js's docs (`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`) note that Vitest **doesn't support async Server Components**. Test those through E2E, and keep logic out of them anyway.

## Setup (done in Roadmap A0.4)

```
vitest.config.mts             # alias @ -> src, server-only -> empty module, globalSetup + setupFiles
tests/
├── setup/
│   ├── global.ts             # once per run: build a migrated TEMPLATE database from ./drizzle
│   ├── env.ts                # loads .env.test; refuses a database whose name lacks "test"/"ci"
│   ├── urls.ts               # derives template / per-file database URLs from DATABASE_URL
│   ├── db.ts                 # createTestDb(): copy the template into a private database for one test file
│   ├── factories.ts          # makeTenant, makeStore, makeUser, makeMedicine, makeBatch, makeCustomer, makeSupplier, makeWorld
│   └── empty.ts
├── unit/money.test.ts
└── integration/{stock,sequence}.test.ts
docker-compose.yml            # local Postgres 16 with databases `mediflow` and `mediflow_test`
.env.test.example             # copy to .env.test
```

**How isolation works.** `global.ts` creates `<db>_tpl`, runs every migration into it, and closes all connections. Each test file calls `createTestDb()`, which runs `CREATE DATABASE <db>_<random> TEMPLATE <db>_tpl` (about 100 ms) and returns a Drizzle instance on a pool for that private database. `cleanup()` in `afterAll` drops it. Files therefore run in parallel and never need table truncation.

*Why not a schema per file?* The generated migrations hard-code `"public"."tenants"` in foreign keys, so they cannot be replayed into another schema. A database per file avoids rewriting migration SQL.

Writing an integration test:

```ts
let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.cleanup(); });

it("...", async () => {
  const { tenant, store, user, medicine } = await makeWorld(t.db);
  await t.db.transaction((tx) => someDomainFunction(tx, ...));
});
```

Domain functions take a `tx`, so tests pass their own database. Anything that imports `@/server/db` directly (the app singleton) would hit `DATABASE_URL` instead; extract such logic into a function that takes `tx` before testing it.

Run: `npm test` (all), `npx vitest run tests/unit` (no database needed), `npx vitest tests/integration/stock.test.ts` (watch one file).

## Must-have tests (write them as the roadmap touches each area)

### Money (`tests/unit/money.test.ts`) — Lane A, Phase 0
- `taxFromInclusive(10500, 500)` → taxable 10000, tax 500, CGST 250, SGST 250.
- Odd paisa: CGST + SGST always equals the tax exactly.
- `computeSaleTotals` with a bill discount: the sum of line totals equals the bill total before rounding; no line goes negative.
- `roundToRupee` for .49 / .50 / .51.
- Property test (optional, `fast-check`): for random lines, `taxable + cgst + sgst + igst === total` per line.

### Stock (`tests/integration/stock.test.ts`) — Lane A, Phase 0
- A movement writes a ledger row with the correct `balance_after`.
- A negative balance is rejected.
- **Concurrency:** two parallel transactions each selling 6 of 10 units → exactly one succeeds. This proves the row lock works.
- Ledger replay: `sum(qty_change)` per batch equals `batches.qty_on_hand`.

### Sequences — Lane A, Phase 0
- 50 parallel `nextDocNumber` calls give 50 distinct, consecutive numbers.
- The fiscal year rolls over on 1 April (inject the date; refactor `nextDocNumber` to accept `now`).
- Output is ≤ 16 characters (Rule 46).

### Tenant isolation — Lane A, Phase 1
- For each action module, user of tenant T1 calling with an id that belongs to T2 → not found or forbidden. Build this as a table-driven test that lists every action.

### RBAC — Lane A, Phase 1
- A cashier can't call `createPurchaseInvoice`, `adjustBatchStock`, `updateStoreSettings` or the reports.

### Accounting — Lane A, Phase 2/5
- Every posted journal entry has debits equal to credits.
- After N random sales and purchases, the trial balance nets to zero.

### GST — Lane B, Phase 1
- `isValidGstin` with the real checksum (test known-valid and known-invalid GSTINs).
- Intra-state gives CGST+SGST; inter-state gives IGST; B2C over ₹2.5L inter-state gives B2CL.
- The `buildGstr1JsonPayload` snapshot test matches the portal schema (store an anonymised expected JSON in `tests/fixtures/`).

### Compliance — Lane B, Phase 1
- H1 without a doctor or prescription fails validation; with them it passes and writes a `dispensing_logs` row.
- Schedule X without a prescription ref fails.

### E2E smoke (Playwright) — Lane A, Phase 2 (POS) and Phase 4 (offline)
1. Log in as the seeded owner.
2. POS: search "dolo", add 2 strips, cash payment, complete. The invoice page shows the correct total.
3. Offline: `context.setOffline(true)`, bill 3 sales, `setOffline(false)`. All 3 appear on the server with unique invoice numbers.

## Coverage goal

Don't chase a percentage. The rule is: **every function that changes stock, money, tax or a statutory register has tests before its PR merges.**
