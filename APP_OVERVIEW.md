# MediFlow: Understanding the Whole App

> **Audience:** you (or a new teammate) who wants to understand what MediFlow is, how it is built, what each part does and how the parts connect.
> **Written:** 28 Oct 2026, **updated after merging Lane B's work from `origin/main` (PRs #12, #13) into `lane-a/overxpowered`.** Companions: `USER_MANUAL.md` (how to use the app, for pharmacy staff) and `MANUAL_TESTING.md` (the single manual testing guide). Where this file and `docs/` disagree, the code on this branch wins. Some docs still describe permissions as "not built", but they are built now.

---

## 1. What MediFlow is

**One sentence:** a cloud ERP for Indian pharmacy chains, with a billing counter (POS) that is meant to keep working offline, built to replace desktop software like Marg.

**Who it's for (priority order):**
1. Multi-store pharmacy chains (3–50 branches, often with a warehouse).
2. Single chemist shops (a chain of one).
3. Clinic/hospital dispensaries (later).

**What "ERP" means here:** every record connects, so one action updates everything it affects:

```
Supplier ─PO─► Purchase (GRN) ─► Stock (batches) ─► Sale (POS) ─► Customer
   ▲                │                 │   ▲   │            │
   │                ▼                 ▼   │   ▼            ▼
Payments ◄── Accounts payable   Transfers between stores   Receivables, loyalty
   │                                                         │
   └──────────────► Double-entry ledger ◄────────────────────┘
                         │
        GST returns, e-invoice, statutory registers, reports
```

A sale reduces stock, writes an immutable stock-ledger row, posts a balanced accounting journal, creates a GST document, records a compliance register line (for scheduled drugs) and may earn loyalty points, all in one database transaction.

**Differentiators the product is built around:** 
- **Keyboard-fast counter billing** (`F2`, `F3`, `F6`, `F8`) with loose tablet/strip cutting and auto-FEFO batch picking.
- **Three-tier platform deployment:** Cloud Web ERP (admin & chain oversight), Native Desktop App (Tauri for offline billing & raw ESC/POS dot-matrix/thermal printing), and Native Mobile App (React Native for owner live sales, chain stock lookups, and delivery).
- **"Correct by construction" money and stock** (integer paise, immutable ledger, double-entry accounting).
- **Automatic compliance registers and GSTR-1** (Schedule H/H1/Narcotics, e-invoicing).
- **Chain control** through multi-branch roles and real-time consolidated dashboards.
- **AI helpers** (substitutes, expiry redistribution, reorder drafts).
- **Complete Marg ERP 9+ operational parity** (see `docs/MARG_COMPETITIVE_RESEARCH.md`).

**Non-goals for the first 6 months:** wholesale/distributor billing, HR/payroll, consumer e-commerce storefront.

---

## 2. How far along it is

Two developers work in parallel "lanes" (see §10):

| Lane | Owner | Branch | Covers |
|---|---|---|---|
| **A** | overxpowered | `lane-a/overxpowered` | platform (auth, RBAC, stores, audit, CI, tests), POS/sales, inventory & stock, accounting core, offline POS, desktop/mobile apps |
| **B** | Kapil | `lane-b/kapil` | purchasing & suppliers, compliance registers, GST & e-invoice, customers/loyalty/orders, WhatsApp/SMS/reminders, reports, AI, data import |

The roadmap is 26 weeks in 7 phases (0–6). On the **mainline tree**, `typecheck` and `lint:strict` pass and `npm test` runs **34 files / 526 tests, all passing**:

| Phase | Theme | Status |
|---|---|---|
| 0 | Foundation & safety | **Done** (multi-tenant schema, RBAC foundation, CI baseline). |
| 1 | Platform & correctness | **100% Complete** (Lane A: A1.1–A1.7; Lane B: B1.1–B1.7 merged into `main`). |
| 2 | Transaction loop | **Active**: Lane B (B2.1–B2.7 complete); Lane A: A2.1 (createSale) and A2.9 (payments) merged; A2.2 (split tender) in progress. Added Marg-parity tasks A2.10 (loose tablet cutting), A2.11 (auto-FEFO), B2.8 (purchase schemes). |
| 3–6 | Multi-store, offline, finance, launch | Planned. |

**Important nuance:** several Lane B items are ticked because the *backend piece* exists and is tested, but the POS doesn't call it yet because that wiring belongs to Lane A's A2.1 sale-service refactor. Specifically: inter-state GST on sales (`determineTaxContext`), prescription dispensing tracking (`applyPrescriptionDispensing`), loyalty redemption, and credit-note/cancel GST documents (there is no cancel or return screen). The outbox so far only carries reminders, not sale receipts.

---

## 3. Tech stack

| Layer | Technology | Location |
|---|---|---|
| Framework | **Next.js 16.3** (App Router, Turbopack, Server Actions, `proxy.ts`) | `src/app/` |
| UI | React 19, Tailwind CSS v4, lucide-react icons, Recharts | `src/app/**`, `src/app/components/` |
| Mutations | Server Actions (`"use server"`) | `src/app/actions/*.ts` |
| Business logic | Plain TypeScript domain modules | `src/server/domain/*.ts` |
| Database | PostgreSQL 14+ (extensions `pg_trgm`, `pgcrypto`) | n/a |
| ORM / migrations | Drizzle ORM 0.45 + drizzle-kit (generated SQL migrations in git) | `src/server/db/`, `drizzle/` |
| Validation | Zod 4 | actions, `src/env.ts` |
| Action wrapper | `next-safe-action` | `src/server/action.ts` |
| AI | Vercel AI SDK with Gemini (primary), Groq (fallback), Tavily web search | `src/app/api/chat/route.ts`, `src/server/ai.ts` |
| Messaging | Meta WhatsApp Cloud API; MSG91 / TextLocal / Twilio SMS (simulators when inactive) | `src/server/domain/whatsapp.ts`, `sms.ts` |
| Tests | Vitest against a real Postgres (each test file gets its own throwaway DB) | `tests/` |

> **Warning:** this is Next.js 16, not the one in most tutorials. `middleware.ts` is now `proxy.ts`, `cookies()` is async, etc. The repo's `AGENTS.md` says to read `node_modules/next/dist/docs/` before using an API from memory.

---

## 4. Architecture

### 4.1 Layers

```
Browser   Client Components ("use client"): POS, forms, modals
   │  calls a Server Action (POST RPC) or a Route Handler
   ▼
src/proxy.ts            fast "is there a session cookie?" redirect (NOT security)
src/app/dashboard/**    Server Components: read data (pages)
src/app/actions/*.ts    Server Actions: write data
src/app/api/**          Route Handlers: external callers (v1 API, webhook, exports, AI)
   │   every entry point must: authenticate → authorize → validate (Zod) → scope → delegate
   ▼
src/server/domain/*.ts  business rules (take a transaction)
src/lib/*.ts            pure code shared with the browser (money, format, permissions)
   ▼
src/server/db/          Drizzle schema + pg Pool  →  PostgreSQL
```

**The rule for every entry point (page, action, route):**
1. **Authenticate**: who is calling (`requireAuth()` / `getAuthCtx()`).
2. **Authorize**: do they hold the permission (`requirePermission("sale.create")`, `requirePagePermission(...)` for pages).
3. **Validate**: parse input with Zod; never trust client prices, totals or tenant IDs.
4. **Scope**: filter every query by `tenantId` (and `storeId` for store data).
5. **Delegate**: call a domain function inside `db.transaction()` if it writes more than one row.

Server Actions are public HTTP endpoints, so the proxy check alone is never enough.

### 4.2 Folder map

```
src/
├── app/
│   ├── actions/        server actions, one file per module (sales, stock, purchases, gst, …)
│   ├── api/
│   │   ├── chat/                 AI assistant streaming endpoint
│   │   ├── export/{sales,purchases,batches}   CSV exports (need report.export)
│   │   ├── v1/{stock/check,orders}            partner API (Bearer API key + scopes)
│   │   ├── cron/{outbox,reminders}            job runners (Bearer CRON_SECRET)
│   │   └── webhooks/whatsapp     Meta webhook (verify token + HMAC signature)
│   ├── components/     Sidebar, Topbar, CommandPalette, AIAssistant, ShortcutsModal, …
│   │   └── nav/        one nav config file per module; sidebar AND command palette read it
│   ├── dashboard/      all authenticated pages, one folder per module
│   ├── login/ register/ forbidden.tsx (the "no access" page)
├── lib/                code safe on server and client: money, format, permissions, regulatory, invoice-no
├── server/
│   ├── auth.ts         sessions + passwords + requireAuth()
│   ├── rbac.ts         getAuthCtx(), requirePermission(), requirePagePermission()
│   ├── api-auth.ts     authenticateApiKey(req, scope) for /api/v1/*
│   ├── crypto.ts       AES-256-GCM encrypt/decrypt/mask for WhatsApp/SMS secrets
│   ├── audit.ts        writeAudit() into audit_logs
│   ├── jobs/           outbox worker (retry + exponential back-off) and handlers
│   ├── roles.ts        seeds/heals the 7 system roles
│   ├── action.ts       protectedAction(permission) wrapper
│   ├── errors.ts       DomainError / ForbiddenError
│   ├── db/             index.ts (pool), migrate.ts, schema/*.ts (12 module files)
│   └── domain/         accounting, bank-reconciliation, compliance, e-invoice, family-ledger,
│                       gst, loyalty, purchases, reminders, reports, schemes, sequence, sms, stock, whatsapp
├── env.ts              Zod-validated environment variables
└── proxy.ts            optimistic auth redirect
tests/  unit/ (no DB)  integration/ (real Postgres)  setup/ (harness, factories)
scripts/ db reset/seed/dataset tools, lint ratchet
docs/   01–13 design docs, ADRs, glossary
drizzle/ generated SQL migrations (0000_init … 0005_quiet_ronan)
```

### 4.3 Authentication & sessions
- `loginAction` verifies the bcrypt password, picks the user's membership and store, creates a session.
- The cookie `mediflow_session` holds a random 32-byte token. The database stores only `sha256(token)` as the session id, so a database leak can't be replayed as cookies.
- Sessions last 30 days and slide forward when fewer than 15 days remain. The cookie is `HttpOnly`.
- `requireAuth()` redirects to `/login` if there's no valid session.

### 4.4 Permissions (RBAC)
- **Tenant** = one pharmacy business. **Store** = one branch. **Membership** = a user's role in a tenant plus which stores they may use. **Role** = a named bundle of permission strings.
- Seven system roles are seeded per tenant: **owner (38 permissions), manager (32), pharmacist (15), cashier (9), purchase_manager (13), accountant (12), auditor (11).** They are seeded at registration, by `db:seed`, and healed after every `db:migrate`.
- Permission strings look like `sale.create`, `inventory.adjust`, `accounting.view`, `settings.manage`, `sale.discount_override` (defined in `src/lib/permissions.ts`).
- Actions use `protectedAction("perm")` or `requirePermission`. Pages use `requirePagePermission`; a missing permission renders the friendly "You don't have access" page with HTTP 403.
- The sidebar and command palette hide items the user can't use (each nav item carries a `permission`; a unit test checks the page's check agrees with its menu item).
- Expected failures use `DomainError` (its message is shown to the user). Anything else is logged as `[server action]` and the user sees "Something went wrong. Please try again."

### 4.5 Multi-tenancy
Every business table has `tenant_id`; store-scoped tables also have `store_id`. One database serves many pharmacies, so a missing tenant filter is a data leak. Tests check that another tenant's ids are refused ("not found").

---

## 5. The rules that keep the data correct

| Rule | What it means |
|---|---|
| **Money = integer paise** (`bigint`) | ₹105.50 is `10550`. No floating point, no drift. Shared math in `src/lib/money.ts`. |
| **Rates = basis points** | `500` = 5%, `1200` = 12%. |
| **Stock changes only via `recordStockMovement()`** | It row-locks the batch, writes an immutable `stock_movements` row and updates `batches.qty_on_hand` in one transaction. A batch's quantity always equals the sum of its movements, and a concurrency test proves two parallel sales can't oversell. |
| **Document numbers only via `nextDocNumber()`** | Gap-free, per store, per fiscal year (1 Apr–31 Mar). Format `INV/26-27/000001`. **GST Rule 46: ≤ 16 characters**, so the bill prefix is limited to 3 capital letters/digits. |
| **Business dates are `date` columns** | Returned as `'YYYY-MM-DD'` strings, so a bill on 1 April never becomes 31 March through timezones. |
| **Snapshot names on transaction rows** | An invoice line stores medicine name, batch and the GST rate used, so old invoices print the same forever (and GST re-rating never rewrites history). |
| **Never hard-delete business records** | Use `is_active` or `status='cancelled'`. Registers, prescriptions and sales have legal retention (about 3 years for H1, 6+ years for accounts). |
| **Optional steps can't kill a sale** | The GST-document and loyalty steps run inside a savepoint; if they fail the sale still commits (Postgres otherwise aborts the whole transaction). |
| **Server recomputes totals** | The sale action ignores client prices/totals and rejects negative/fractional quantities and discounts. (Purchases do **not** yet; see §9.) |

---

## 6. Feature tour: what each module does

### 6.1 Sales & POS (Lane A)
- **POS** (`/dashboard/sales/pos`): search medicines by name/composition/barcode, pick a batch (FEFO-style, expired batches are not offered), line discounts, customer selection, quick customer add, medical-rep tag, payment (Cash/UPI/Card, one at a time), "Complete & Print". Barcode scanner input is detected by fast typing + Enter.
- **Shortcuts:** `F2` clear/new bill, `F3` search, `F4` quick customer, arrows+Enter to pick, `Esc` to close.
- **Substitutes finder** for out-of-stock items; **promise order** capture for unavailable items.
- **Schedule H/H1/X compliance** at the counter: doctor name, registration number, patient details and Rx reference become mandatory depending on the drug, and the sale writes a `dispensing_logs` row.
- **Sales list / invoice / print:** search, view billed lines with batch and expiry, thermal 80 mm print view.
- **Discount ceiling:** an optional per-tenant `maxDiscountBp` setting; discounts above it need `sale.discount_override`.
- Automatically on each sale: stock movement, balanced journal entry, GST document, loyalty points (if configured).

### 6.2 Inventory (Lane A)
- **Item master:** medicines with category, manufacturer, generic name, MRP, sale price, **GST rate (default 5%, GST 2.0)**, HSN, unit, pack size, barcode, schedule (None/H/H1/X/narcotic), rack.
- **Batches & stock:** per-batch quantity, expiry, MRP, cost; Near-expiry tab (≤ 90 days); expired badge.
- **Opening stock** form and **Bulk CSV import** (loose header matching, `MM/YY` expiry, error/warning preview).
- **Racks & shelves:** the reference example of the new permission pattern (unique code per store, upper-cased).
- **Trade schemes:** free-quantity or discount offers by medicine/category/supplier.

### 6.3 Accounting (Lane A)
- Double-entry accounts and journals generated automatically from sales and purchases.
- Pages: Accounting & Day Book, Trial Balance, Profit & Loss, Balance Sheet, Cash Flow, Outstanding (receivables).
- **Bank reconciliation** (Lane B file): paste a bank CSV, auto-match or manually link to system payments.

### 6.4 Purchasing & suppliers (Lane B)
- Supplier master (GSTIN, drug licence, credit days).
- **GRN / purchase entry:** supplier bill number (unique per supplier), lines with batch, expiry, qty, **free qty**, rate, MRP, GST. Creates batches, a stock movement per line, a purchase journal and a GST document.
- Purchases list, detail page, CSV export.
- **Hardened (B1.7):** the server recomputes every total from qty, free qty, rate, discount and GST (client numbers are ignored); batch cost is the **landed cost** (taxable ÷ (qty + free)); inter-state suppliers get **IGST**; invalid GST rates and negative values are refused. Domain logic lives in `src/server/domain/purchases.ts`.

### 6.5 Customers & CRM (Lane B)
- Customers with credit limit/GSTIN, **family groups** with pooled limit and consolidated history, **loyalty programme** (points per ₹ spent, redemption rules, ledger, manual adjustment), **medical reps** with commission %, **omnichannel orders** (received → preparing → ready → delivered, also created through the external API), **promise orders**.

### 6.6 Compliance (Lane B)
- Doctor master (unique registration number), prescriptions (patient, doctor, items), statutory **registers** for Schedule H, H1, X and narcotics filled automatically from POS, with date filters, CSV export and a **printable inspector-style register** (`/dashboard/compliance/<register>/print`).
- A tested `applyPrescriptionDispensing` function tracks dispensed quantity and blocks over-dispensing for H1/X, but POS does not call it yet.

### 6.7 GST (Lane B)
- Dashboard, **Outward (GSTR-1)** and **Inward (ITC)** statements, reconciliation (liability vs ITC), returns hub with worksheets, **GSTR-1 JSON export**.
- **GST re-rate tool** (`/dashboard/gst/rates`, not in the menu): bulk-move medicines from one GST rate to another (e.g. 12% → 5% for HSN 3004) with a preview, a reason and an audit row; historical invoices keep their old rate.
- **E-invoice & e-way bill:** IRN, signed QR, cancellation within 24 h and e-way bill generation, all through a **simulator** controlled by `EINVOICE_MODE` (`disabled` default / `simulator` / `sandbox` / `production`). No real government connection exists yet.

### 6.8 Reports & dashboard (Lane B)
- Dashboard KPIs (revenue, average bill, low stock, expiring ≤ 90 days), expiry exposure (≤ 30 and 31–90 days), fast/slow/dead stock, MR commissions, CSV exports.

### 6.9 Communications (Lane B)
- WhatsApp inbox/templates/settings, SMS settings, patient reminders (refill, follow-up, payment, custom). Providers run in **simulator mode** until activated, so nothing is sent for real in testing. Saved provider secrets are **encrypted at rest** and shown masked.
- **Outbox + cron (B2.1):** work that must happen after the database commit (sending a reminder, SMS, WhatsApp receipt, e-invoice, GST-document retry) is queued in `outbox_events` and processed by `GET /api/cron/outbox` with retries and exponential back-off. `GET /api/cron/reminders` queues due reminders. Nothing schedules these calls yet; a scheduler is Phase 6 work.

### 6.10 AI assistant (Lane B)
- `Ctrl+J` opens a chat that can query live data (low stock, sales summary) and check drug interactions. Needs `GEMINI_API_KEY` or `GROQ_API_KEY`; falls back between providers. Requires the `ai.use` permission; logged-out calls get 401.

### 6.11 External API and integrations (Lane B)
- **API keys** (`/dashboard/settings/api-keys`, not in the menu): create a key with scopes `stock.read`, `orders.write`, `orders.read`, optionally limited to one store. The raw `mf_live_…` key is shown once; only its SHA-256 hash is stored; keys can be revoked.
- `POST /api/v1/stock/check` and `/api/v1/orders` (POST/GET) require `Authorization: Bearer mf_live_…`, are scoped to the key's pharmacy (and store), and reject other tenants' ids with 404.
- **WhatsApp webhook** `/api/webhooks/whatsapp`: the handshake checks the verify token saved per pharmacy, and POSTs are HMAC-verified when `WHATSAPP_APP_SECRET` is set.

### 6.12 App shell
- Sidebar (collapsible, permission-aware), top bar with breadcrumbs and notifications, **command palette** (`Ctrl+K`), keyboard shortcuts sheet (`?`), AI drawer (`Ctrl+J`).

---

## 7. Data model (~58 tables)

Grouped by owning lane (schema split into `src/server/db/schema/*.ts`):

- **Platform:** tenants, users, stores, sessions, roles, role_permissions, memberships, audit_logs, doc_sequences, idempotency_keys
- **Catalog:** manufacturers, categories, racks, medicines
- **Inventory:** batches, stock_movements, stock_adjustments
- **Sales:** sales, sale_items, sale_payments, sale_returns (+ items), cash_sessions
- **Accounting:** accounts, journal_entries, journal_lines, payments
- **Purchasing:** suppliers, purchase_orders (+ items), purchases, purchase_items, purchase_returns (+ items), schemes
- **Compliance:** doctors, prescriptions, prescription_items, dispensing_logs
- **GST:** gst_documents, e_invoice_logs
- **CRM:** customers, customer_groups, loyalty_configs, loyalty_transactions, medical_reps, promise_orders, external_orders
- **Comms:** whatsapp_configs/templates/messages, sms_configs, reminders, outbox_events, notifications
- **Banking:** bank_statements, bank_statement_lines
- **AI:** ai_actions

Some tables (returns, cash sessions, purchase orders, outbox) exist in the schema ahead of the screens that will use them.

**Migrations:** generated SQL files committed to git (`npm run db:generate` / `db:migrate`), never `drizzle-kit push`. Only one migration per PR, regenerated on top of `main` right before merging, so two developers never collide.

---

## 8. Regulatory rules baked in (India)

- **Schedules:** None/OTC, G, **H** (prescription, doctor name required), **H1** (separate register; prescriber, patient, drug, quantity recorded at supply; kept 3 years), **X** (duplicate prescription, strictest), **Narcotic** (NDPS). The software records registers automatically and never deletes them.
- **No sale of expired stock; batch and expiry on every invoice line.**
- **GST 2.0 (22 Sep 2025):** the 12% slab merged into 5%, so most medicines are 5%; life-saving drugs 0%. New items default to 5%. Old invoices keep their old rate.
- **Intra-state** = CGST+SGST, **inter-state** = IGST. (Inter-state determination is not wired into billing yet.)
- **Invoice number ≤ 16 characters** (Rule 46) and a separate series per fiscal year.
- **E-invoice** is mandatory for B2B above ₹5 crore turnover (B2C exempt); **e-way bill** for consignments over ₹50,000.
- **DPDP Act 2023:** the pharmacy is the data fiduciary, MediFlow the processor; consent, erasure and privacy tools are planned.
- **SMS:** TRAI DLT templates; **WhatsApp:** approved templates outside the 24-hour window.
- Constants live in `src/lib/regulatory.ts`. See `docs/05-domain-pharmacy-india.md` and `docs/glossary.md` for terms (FEFO, GRN, PTR, landed cost, IRN, ITC, etc.).

---

## 9. Known gaps and risks today

**Security (fixed since the first review, verified live):** `/api/v1/*` now returns 401 without a key; the webhook is reachable, rejects wrong tokens and the old hard-coded token; the cron endpoints return 401 without the secret; provider secrets are encrypted; CSV exports and the AI route check permissions; `/api/chat` is no longer public.

**Security (still open):**
- **API Keys page and actions check login only**, not a permission: any logged-in role (even a cashier) can open `/dashboard/settings/api-keys` and mint keys. `api_key.manage` exists but isn't used.
- Omnichannel orders pages (`/dashboard/orders`, `/orders/<id>`) have no page-level permission check; these server actions also check login only: external-orders, medical-reps, schemes, bank-reconciliation, inventory-import, ai-enrichment.
- The webhook accepts **unsigned** POSTs when `WHATSAPP_APP_SECRET` is unset; the cron endpoints skip the secret when `CRON_SECRET` is unset (production boot requires it).

**Correctness / wiring:**
- Sales still hard-code intra-state GST; prescription dispensing and loyalty redemption aren't called from POS; no sale cancel/return, so the credit-note GST service has no caller; sale receipts aren't queued in the outbox (all waiting on Lane A's A2.x).
- E-invoice simulator has no visible "SIMULATED" badge even though B0.3 is ticked.
- GST rate dropdown still offers 12% and 28%, while the docs list slabs 0/5/18/40.
- Audit rows are written but there is no audit-log screen.
- Pages for **API keys** and **GST rates** aren't in the menu.

**Missing flows:** split tender, hold bills, cash shifts, purchase orders/returns, supplier payments, multi-store, offline mode, user invites, login lockout, reorder engine, import wizard (see §11).

**Housekeeping:** the whole-repo `npm run lint` still isn't clean (`lint:strict` covers the clean paths); `MANUAL_TESTING.md` is now the single, current testing guide; the older `A_TEST_GUIDE.md` and `B_TEST_GUIDE.md` still describe the pre-merge state (12 files / 141 tests, fixed security items listed as failing) and are superseded by it.

---

## 10. How the team works

- **Two lanes, two branches**, merged to `main` by PR with a merge commit. The other lane reviews within 24 h. Task IDs (`A1.3`, `B2.4`) go in PR titles.
- **Ownership** is enforced by `.github/CODEOWNERS` and ADR 0004. Shared files (schema index, migrations, permissions, nav) follow a protocol in `docs/07-git-workflow.md`.
- **Definition of done:** follows `docs/06-coding-standards.md`; `npm run typecheck && npm test && npm run build` green in CI; tests for money/stock/tax/register logic; migration regenerated after merging `main`; docs and **`MANUAL_TESTING.md` updated**; roadmap box ticked.
- **CI:** typecheck, strict lint, tests against a Postgres service container, build, and a branch guard. A pre-push git hook is installed by `npm install`.

---

## 11. What's coming (roadmap summary)

| Phase | Weeks | Theme | Highlights |
|---|---|---|---|
| 0 | 1–2 | Foundation & safety | migrations, tests/CI, API keys, webhook verification, encrypted secrets ✅ |
| 1 | 3–6 | Platform & correctness | users/invites ⏳, login lockout ⏳, audit log ⏳, inter-state GST ✅(function), GST tests ✅, prescription dispensing ✅(function), purchase hardening ✅ |
| 2 | 7–10 | Close the transaction loop | split payments, hold/cancel/return bills, cash register, receipts/payments, outbox worker, purchase orders/returns, supplier ledger, loyalty redemption |
| 3 | 11–14 | Multi-store chain | store management and switcher, per-store settings, stock transfers, warehouse, chain reports, reorder engine, per-GSTIN returns |
| 4 | 15–18 | Offline & onboarding | PWA, IndexedDB, sync API, offline billing; Marg/CSV import wizard |
| 5 | 19–22 | Finance & real integrations | expenses, ledgers, credit control, period lock, year-end; real e-invoice/e-way via a GSP, GSTR-2B/IMS, WhatsApp/SMS production, DPDP |
| 6 | 23–26 | Hardening & launch | observability, performance, deployment/backups, security headers, AI hardening, onboarding wizard, inspector/CA export packs, pilot |

Target "v1 sellable": end of April 2027. A success test for v1: a 3-branch chain runs a month without falling back to Marg or paper, the POS survives a 2-hour outage with no lost bills, and GSTR-1 JSON loads in the GST offline tool unedited.

---

## 12. Running and testing

```bash
docker compose up -d db          # Postgres (or the host-network container described in MANUAL_TESTING.md §2)
npm install
npm run db:reset                 # local only: wipe, migrate, seed owner + 7 role logins
npm run dev                      # http://localhost:3000
npm run db:migrate               # apply migrations (now 0000–0005) + sync system roles; run after every pull
npm run db:studio                # browse the database
npm run typecheck && npm run lint:strict && npm test
```
`.env` needs `DATABASE_URL` (the DB name for tests must contain "test"; tests refuse to run otherwise). Optional: `GEMINI_API_KEY`, `GROQ_API_KEY`, `TAVILY_API_KEY`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `EINVOICE_MODE`.

**Test logins** (after `db:reset`): `admin@apollo.com / admin123` (owner), and `manager@`, `pharmacist@`, `cashier@`, `purchase_manager@`, `accountant@`, `auditor@` `apollo.com` with passwords `<role>123` (for example `cashier123`, `purchase_manager123`).

**Automated tests (21 files, 307 tests, all passing on the merged tree):** unit tests (money, invoice numbers, permissions, nav config, DB error helper, GST, compliance, loyalty, outbox, purchases) and integration tests (stock concurrency and ledger replay, document numbering and year rollover, sale resilience, RBAC, racks, registration, the Lane A and Lane B permission matrices, dispensing, GSTR-1 payload vs a fixture, purchase totals).

---

## 13. Where to read next

| Want to know | Read |
|---|---|
| How to use every feature (for staff) | `USER_MANUAL.md` |
| Test everything by hand (UI, logic, permissions, dev checks) | `MANUAL_TESTING.md` |
| Every task, its files and "done when" | `ROADMAP.md` |
| Vision and competitors | `docs/01-product-vision.md` |
| Layers, flows, folder map | `docs/02-architecture.md` |
| What was wrong at the start (audit) | `docs/03-current-state-audit.md` |
| Tables and migration workflow | `docs/04-database.md` |
| Indian pharmacy, GST, DPDP rules | `docs/05-domain-pharmacy-india.md` |
| How to write code here | `docs/06-coding-standards.md` |
| Git/PR workflow | `docs/07-git-workflow.md` |
| Offline POS design | `docs/10-offline-pos-design.md` |
| Multi-store design | `docs/11-multi-store-design.md` |
| Data import from Marg | `docs/12-data-migration.md` |
| Security | `docs/13-security.md` |
| Terminology | `docs/glossary.md` |
