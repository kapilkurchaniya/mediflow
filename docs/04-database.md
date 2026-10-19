# 04 · Database

## Conventions (non-negotiable)

These are written at the top of the schema file and enforced in review.

| Rule | Why |
|---|---|
| Every business table has `tenant_id` (FK → `tenants`, cascade). Store-scoped tables also have `store_id`. | Multi-tenancy: one database serves many pharmacy businesses. Forgetting the filter leaks data between businesses. |
| Money is **integer paise** in `bigint` columns (helper `money()`). | Floating point can't represent ₹0.10 exactly. Integer paise never drifts. |
| Percentages are **basis points** (`1200` = 12.00%). | Integer arithmetic, two decimal places of precision. |
| Stock quantities are integers in selling units (strip/bottle). | Fractions of a strip are modelled as a different unit, never as decimals. |
| Stock changes **only** via `recordStockMovement()`, which writes `stock_movements` and updates `batches.qty_on_hand` in one transaction. | Immutable audit trail: the balance can be rebuilt from movements at any time. |
| Document numbers **only** via `nextDocNumber()`. | Gap-free, per-store, per-fiscal-year sequences as GST requires. |
| `date` columns (not timestamps) for business dates (invoice date, expiry). | `db/index.ts` returns them as `'YYYY-MM-DD'` strings, so a bill dated 1 April never becomes 31 March in UTC. |
| Snapshot names onto transactional rows (`sale_items.medicine_name`, `batch_no`). | An invoice must print the same text forever, even after the master record is renamed. |
| Never hard-delete business records. Use `is_active` / `status = 'cancelled'`. | Statutory retention (3 years for H1 registers, 6+ years for GST/accounts). |

## Table map (grouped by owning lane)

**Lane A (platform, sales, stock, accounting)**
- Platform: `tenants`, `users`, `stores`, `sessions`, `roles`, `role_permissions`, `memberships`, `audit_logs`, `doc_sequences`, `idempotency_keys`
- Catalog: `manufacturers`, `categories`, `racks`, `medicines`
- Inventory: `batches`, `stock_movements`, `stock_adjustments` (+ ➕ `stock_transfers`, `stock_transfer_items`, `stock_counts`, `devices`)
- Sales: `sales`, `sale_items`, `sale_payments`, `sale_returns`, `sale_return_items`, `cash_sessions`
- Accounting: `accounts`, `journal_entries`, `journal_lines`, `payments`

**Lane B (purchasing, compliance, GST, CRM, comms, AI)**
- Purchasing: `suppliers`, `purchase_orders`, `purchase_order_items`, `purchases`, `purchase_items`, `purchase_returns`, `purchase_return_items`, `schemes`
- Compliance: `doctors`, `prescriptions`, `prescription_items`, `dispensing_logs`
- GST: `gst_documents`, `e_invoice_logs`
- CRM: `customers`, `customer_groups`, `loyalty_configs`, `loyalty_transactions`, `medical_reps`, `promise_orders`, `external_orders`
- Comms & jobs: `whatsapp_configs`, `whatsapp_templates`, `whatsapp_messages`, `sms_configs`, `reminders`, `outbox_events`, `notifications`
- Banking: `bank_statements`, `bank_statement_lines`
- AI: `ai_actions` · Import: ➕ `import_jobs`, `import_job_rows`

## Schema file layout (after Roadmap A0.3)

The 1,261-line `src/server/db/schema.ts` gets split so the two lanes stop editing the same file:

```
src/server/db/schema/
├── _helpers.ts      id(), tenantId(), storeId(), money(), createdAt(), updatedAt()
├── platform.ts      tenants, users, stores, sessions, roles, …            (Lane A)
├── catalog.ts       manufacturers, categories, racks, medicines           (Lane A)
├── inventory.ts     batches, stock_movements, stock_adjustments, …        (Lane A)
├── sales.ts         sales, sale_items, sale_payments, returns, cash       (Lane A)
├── accounting.ts    accounts, journal_*, payments                         (Lane A)
├── purchasing.ts    suppliers, purchase_*, schemes                        (Lane B)
├── compliance.ts    doctors, prescriptions, dispensing_logs               (Lane B)
├── gst.ts           gst_documents, e_invoice_logs                         (Lane B)
├── crm.ts           customers, customer_groups, loyalty_*, reps, orders   (Lane B)
├── comms.ts         whatsapp_*, sms_configs, reminders, outbox, notifs    (Lane B)
├── banking.ts       bank_statements, bank_statement_lines                 (Lane B)
├── ai.ts            ai_actions                                            (Lane B)
└── index.ts         export * from "./platform"; … (SHARED — one line per file)
```

`src/server/db/index.ts` keeps `import * as schema from "./schema"`. That import now resolves to `schema/index.ts`, so **no import in the app changes**. `drizzle.config.ts` changes `schema` to `"./src/server/db/schema/index.ts"`.

Cross-file foreign keys work because Drizzle references are lazy (`references(() => customers.id)`). A file imports the tables it points at, e.g. `sales.ts` imports `customers` from `./crm`. Avoid circular imports between two files by keeping FK direction consistent: transactional tables point to master tables, never the other way round.

## Migration workflow

We use **generated SQL migrations committed to git** (`drizzle-kit generate` + `src/server/db/migrate.ts`). `drizzle-kit push` is banned outside throwaway local experiments. See [ADR 0002](adr/0002-migrations-not-push.md).

### Everyday commands (added to `package.json` in Roadmap A0.2)

```bash
npm run db:generate -- --name add_stock_transfers   # diff schema → new SQL file in drizzle/
npm run db:migrate                                  # apply pending migrations to $DATABASE_URL
npm run db:studio                                   # browse the DB (drizzle-kit studio)
```

### The two-developer rule for migrations

drizzle-kit numbers migrations sequentially (`0003_…`) and records them in `drizzle/meta/_journal.json` plus a snapshot. If both lanes generate `0003` in parallel, the second PR conflicts, and resolving that by hand corrupts the snapshot chain. So:

1. **While developing,** change schema files freely and generate migrations locally as often as you like.
2. **Right before opening the PR:**
   ```bash
   git fetch origin && git merge origin/main        # get the other lane's merged migrations
   git rm drizzle/00NN_<your-unmerged>.sql drizzle/meta/00NN_snapshot.json  # delete YOUR unmerged migration(s)
   git checkout origin/main -- drizzle/meta/_journal.json                   # take main's journal
   npm run db:generate -- --name <feature>          # regenerate ONE migration on top of main
   ```
3. **One migration file per PR.** Squash them by regenerating as above.
4. **Never edit a migration that is already on `main`.** Fix forward with a new migration.
5. If both lanes have schema PRs open at once, **merge one, then the other author repeats step 2**. Say "I'm merging a migration" in your team chat before you merge.
6. Data migrations (backfills) go in the same SQL file, after the DDL. Make them idempotent (`UPDATE … WHERE new_col IS NULL`).

### Catching up the stale baseline (Roadmap A0.1, one time)

`0000_init.sql` has 37 tables; the schema has ~58. Both developers' local DBs were created with `push`. The plan:

1. Lane A runs `npm run db:generate -- --name catch_up`. drizzle-kit diffs the schema against `meta/0000_snapshot.json` (not the live DB), so the new file creates the ~21 missing tables and columns.
2. Each developer **recreates their local DB** from migrations: `dropdb mediflow && createdb mediflow && npm run db:migrate && npm run db:seed`. Local data is disposable.
3. If a real customer database already exists anywhere, **stop** and baseline it instead: apply `0001` manually after checking that the objects don't already exist, and insert its hash into `drizzle.__drizzle_migrations`. Ask before doing this.

## Indexing guidelines

- Every list page filters by `tenant_id` (+ `store_id`) and sorts by a date. Index `(store_id, <date>)`.
- Search uses `pg_trgm` GIN indexes (`medicines_name_trgm`). Query with `ILIKE '%x%'`, which uses the trigram index. For ranking, use `similarity()`.
- Partial unique indexes enforce business rules cheaply (`cash_sessions_one_open_uq`, `medicines_tenant_barcode_uq`).
- Before adding an index, check the query plan with `EXPLAIN ANALYZE` on seeded data (≥50k medicines and ≥200k movements).
