# 03 · Current-state audit

**Snapshot of `master` at `c7a15f6` on 20 Oct 2026.** About 31,500 lines of TypeScript, ~58 tables, 26 action files, 18 domain modules, 60+ pages.

Health checks run for this audit:

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors (after `npm ci`) |
| `npx eslint src` | ❌ 70 errors, 131 warnings (mostly `no-explicit-any`, unused vars) |
| `next build` (dummy `DATABASE_URL`) | ✅ builds; all dashboard routes are dynamic |
| Automated tests | ❌ none (vitest is installed, no test files) |
| Migrations vs schema | ❌ `drizzle/0000_init.sql` creates 37 tables; `schema.ts` defines ~58. Databases were synced with `drizzle-kit push`. |

Legend: ✅ works · 🟡 partial / has gaps · 🔴 table exists but no code · ⚠️ bug or risk

## Module status

| Module | Status | Notes |
|---|---|---|
| Auth (login/register/logout, sessions) | 🟡 | Solid session design (hashed tokens, sliding expiry). Gaps: login ignores `memberships.storeIds` and always picks the tenant's first store (`actions/auth.ts:39`). Register sets store `stateCode: "00"`, which is invalid (`actions/auth.ts:101`). No rate limiting, no password reset, no user invites. |
| RBAC (roles, permissions) | 🔴 | `src/lib/permissions.ts` has a full catalogue and 7 role templates, but **nothing checks permissions**. Register creates an `owner` role with **no** `role_permissions` rows (`actions/auth.ts:112`). Every logged-in user can do everything. |
| Multi-store | 🔴 | `stores`, `memberships.storeIds` and `sessions.storeId` exist. There's no store switcher, no store management UI, no transfers and no warehouse concept. |
| Medicines / item master | ✅ | CRUD, categories, manufacturers, racks, trigram indexes for search. Default `gst_rate_bp = 1200` is **outdated** (12% slab abolished from 22 Sep 2025; see doc 05). |
| Batches & stock ledger | ✅ | `recordStockMovement` row-locks the batch and writes an immutable movement. Opening stock and adjustments are done. 🔴 Transfers (`transfer_in/out` types exist), physical stock count and expiry write-off flow are missing. |
| POS / sales | 🟡 | Strong core (server-side prices, FEFO, compliance check, journals, GST doc, loyalty). Gaps: **single payment method** per bill (`paymentMethod: string`, `sales.ts:191`), **inter-state hard-coded false** (`sales.ts:316`), no held/parked bills (column `held_payload` unused), no cancel and no returns. POS page is a single 1,427-line component. |
| Sale returns / credit notes | 🔴 | Tables `sale_returns`, `sale_return_items` exist; no code. |
| Cash register (shift open/close) | 🔴 | `cash_sessions` table with a one-open-per-store index exists; no code. |
| Purchases (GRN) | ✅ | Creates batches, stock movements, purchase journal, GST document. |
| Purchase orders | 🔴 | Tables exist; no code. Promise orders reference `purchase_order_id`. |
| Purchase returns / debit notes | 🔴 | Tables exist; no code. |
| Suppliers | 🟡 | List and create. No edit, ledger or payments UI. |
| Customers, groups (family), loyalty | 🟡 | Recently added by Lane B. Loyalty earns points at POS. Redemption at POS is not wired in. |
| Accounting | 🟡 | Chart of accounts seeding, sale/purchase journals, trial balance, P&L, balance sheet, cash flow, outstanding. Gaps: receipts/payments vouchers UI (`payments` table unused by UI), expenses, period lock, opening-balance journal. |
| Bank reconciliation | 🟡 | Statement upload, auto-match, manual match. Depends on `payments` rows that the UI can't create yet. |
| GST | 🟡 | GSTIN validation, supply-type logic, GSTR-1/2 builders, reconciliation, GSTR-1 JSON. Gaps: rates not GST 2.0, no tests, IMS/GSTR-2B import missing. |
| E-invoice / e-way bill | ⚠️ | `NICIRPProvider` (`domain/e-invoice.ts:119`) is a **simulator**. It invents IRNs, ack numbers and a base64 "QR". These must **never** be printed on real invoices. A real GSP integration is needed. |
| Compliance registers (H, H1, X, narcotics) | ✅ | Auto-logged from POS. Doctors and prescriptions CRUD, CSV export. Gaps: retention rules, Rx quantity-dispensed tracking, tests. |
| Schemes / offers | 🟡 | CRUD and `calculateBestScheme`. Check that it's applied consistently at POS and purchase. |
| Promise orders, external orders (omnichannel) | 🟡 | CRUD and dashboards. External API is insecure (see below). |
| WhatsApp, SMS, reminders | 🟡 | Providers with simulators, inbox, templates, webhook. Sending is synchronous (no retries). India SMS needs DLT template registration (not modelled). |
| Reports & dashboard | ✅ | Many reports and CSV exports. Single-store only. |
| AI assistant | 🟡 | Tool-calling over live data with a model fallback chain. File has `// @ts-nocheck`. Tools are not permission-aware, and the write tool `add_medicine` has no confirmation step. `ai_actions` audit table is unused. |
| Audit log | 🔴 | `audit_logs` table exists; nothing writes to it. |
| Outbox / notifications / idempotency | 🔴 / 🟡 | `outbox_events`, `idempotency_keys` unused. `notifications` partially used. |
| Offline | 🔴 | Only an "offline" banner (`navigator.onLine`). |
| Data import | 🟡 | Basic inventory CSV import (`actions/inventory-import.ts`). No Marg mapping, customers, suppliers or balances. |

## ⚠️ Security findings (fix in Phase 0 — details in [13-security.md](13-security.md))

| # | Severity | Finding | Location |
|---|---|---|---|
| S1 | **Critical** | `POST /api/v1/stock/check` has no auth and **no tenant filter**. It returns every tenant's medicines, prices and stock. `proxy.ts` only checks that *a* cookie named `mediflow_session` exists, so any value passes. | `src/app/api/v1/stock/check/route.ts:32`, `src/proxy.ts:23` |
| S2 | **Critical** | `POST /api/v1/orders` is unauthenticated. It takes `tenantId` from the request body and **defaults to the first tenant in the DB**. `GET` returns any order by id with no tenant check. | `src/app/api/v1/orders/route.ts:17,65` |
| S3 | High | Permissions are never enforced (see RBAC above). | all `src/app/actions/*` |
| S4 | High | WhatsApp webhook `POST` does not verify Meta's `X-Hub-Signature-256`, so anyone can inject inbound messages. `GET` accepts a hard-coded verify token `"mediflow_wa_webhook"`. | `src/app/api/webhooks/whatsapp/route.ts:20,28` |
| S5 | High | Simulated e-invoice IRNs and QR codes could be printed on real B2B invoices. | `src/server/domain/e-invoice.ts:119` |
| S6 | Medium | WhatsApp access tokens and SMS API keys are stored in plaintext. | `schema.ts:1070,1118` |
| S7 | Medium | No login rate limiting or lockout. | `actions/auth.ts` |
| S8 | Low | `// @ts-nocheck` on the AI route hides type errors in code that runs raw SQL. | `src/app/api/chat/route.ts:1` |

## ⚠️ Correctness findings

| # | Finding | Location | Impact |
|---|---|---|---|
| C1 ✅ fixed in A0.7 | `try/catch` around queries **inside** a transaction (GST document, loyalty). In Postgres, a failed statement aborts the whole transaction. Catching the JS error doesn't help: the next statement or `COMMIT` fails with "current transaction is aborted". | `actions/sales.ts:483,496` | A loyalty or GST bug makes the **whole sale fail** with a confusing error. Fix: wrap optional steps in `tx.transaction(...)`, which creates a savepoint, or move them to the outbox. |
| C2 | GST 2.0: default rate 12% is wrong for most medicines (now 5%). No rate catalogue. | `schema.ts:240` | Wrong tax on new items. |
| C3 | `isInterState = false` always. | `actions/sales.ts:316` | Wrong CGST/SGST vs IGST for B2B customers in other states. |
| C4 ✅ fixed in A0.7 | Invoice numbers can exceed **16 characters** (GST Rule 46 limit) if the prefix is long. Nothing validates this. | `domain/sequence.ts` | Non-compliant invoices. |
| C5 | Migrations don't match the schema. A fresh `npm run db:migrate` creates only 37 of ~58 tables. | `drizzle/` | New environments (CI, production, Kapil's or your machine) break. |
| C6 | `scripts/Indian-Medicine-Dataset` is committed as a git **submodule pointer** with no `.gitmodules` file. | repo root | Fresh clones get an empty folder; the seed script fails. |
| C7 | README documents `GOOGLE_GENERATIVE_AI_API_KEY` and `SESSION_SECRET`. The code reads `GEMINI_API_KEY` and never reads `SESSION_SECRET`. `env.ts` validates only `DATABASE_URL`. | `README.md`, `src/env.ts` | Setup confusion; missing keys fail at runtime instead of at boot. |
| C8 | The WhatsApp receipt is sent synchronously after the sale, with a placeholder URL `https://mediflow.demo/receipts/…`. | `actions/sales.ts:510` | Slow POS response; broken links for customers. |
| C9 | `scripts/migrate-tenant.ts` has hard-coded tenant UUIDs from someone's local DB. | `scripts/` | Dangerous if run against the wrong DB. Delete it. |

## What is genuinely good (keep it)

- Paise/basis-point money model and `src/lib/money.ts`. The GST-inclusive back-calculation and proportional bill-discount distribution are correct and well thought out.
- An immutable stock ledger with row locks.
- A gap-free, per-store, per-fiscal-year numbering table.
- Hashed session tokens.
- Well-indexed schema with partial unique indexes (e.g. one open cash session per store).
- Compliance logging inside the sale transaction.
