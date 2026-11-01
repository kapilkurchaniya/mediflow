# MediFlow Roadmap: from prototype to a sellable pharmacy-chain ERP

> **Plan date:** 20 Oct 2026 · **Horizon:** 26 weeks (6 months), part-time (~10–15 h/week per developer)
> **Week 1 starts Mon 26 Oct 2026** · **Target "v1 sellable":** end of April 2027
> **Primary customer:** multi-store pharmacy chains · **Deployment:** cloud SaaS + offline-capable POS
> **Lane A:** overxpowered (`lane-a/overxpowered`) · **Lane B:** Kapil / kapilkurchaniya (`lane-b/kapil`)

Read first: [docs/03-current-state-audit.md](docs/03-current-state-audit.md) (what exists), [docs/06-coding-standards.md](docs/06-coding-standards.md) (how to write code here), [docs/07-git-workflow.md](docs/07-git-workflow.md) (how to ship it).

---

## 0. How to use this roadmap

### Structure
- **Phases** are 2–4 week blocks with one theme. Both lanes work on the same phase at the same time.
- Each phase has a **Lane A** and a **Lane B** section. Each task has an ID (`A1.3`, `B2.4`), and that ID goes in the PR title.
- Each task lists **Why**, **Files** (➕ create, ✏️ change, 🗑️ delete), **How** (steps and code sketches), and **Done when** (acceptance criteria).
- Code sketches show *shape and intent*. Adapt names to what you find when you open the file. If you change a function name that another task references, update this file in the same PR.

### Symbols
| Symbol | Meaning |
|---|---|
| 🤝 | **Contract.** The other lane depends on this interface. Merge a small PR with the types and stub first (day 1–2 of the phase), then implement. |
| 🔀 | Touches a **shared file** (schema index, migrations, permissions, nav, package.json). Follow the protocol in docs/07. |
| ⛔ | **Blocking.** Other tasks wait for this one. Do it first. |
| 🧪 | Tests are required in the same PR. |
| ⏱ | Rough effort for one part-time developer (1 day ≈ 3 focused hours). |

### Definition of Done (every task)
1. Code follows docs/06 (permission check, tenant scoping, Zod input, paise and basis points).
2. `npm run typecheck && npm test && npm run build` pass, and CI is green.
3. Tests exist for any logic that touches money, stock, tax or registers 🧪.
4. Migration (if any) generated after merging `main`, one per PR (docs/04).
5. Docs updated if behaviour changed. ROADMAP checkbox ticked in the same PR.
6. Reviewed and approved by the other lane, then merged with a merge commit.

### Team rituals (lightweight, part-time friendly)
- **Monday (15 min call or chat):** what each lane will merge this week; which 🤝 contracts are needed; who is touching shared files.
- **Daily:** `git merge origin/main` into your lane before starting.
- **PR review SLA:** within 24 h. Small PRs (under ~600 lines) get faster reviews.
- **End of phase (30 min):** demo to each other on a fresh DB (`db:migrate` + seed), tick off the phase exit criteria, adjust the next phase.

### Timeline overview

| Phase | Weeks | Dates (approx.) | Theme | Lane A (overxpowered) | Lane B (Kapil) |
|---|---|---|---|---|---|
| **0** | 1–2 | 26 Oct – 8 Nov | Foundation & safety | Migrations, schema split, test harness, CI | Security hot-fixes, GST 2.0, env & repo hygiene |
| **1** | 3–6 | 9 Nov – 6 Dec | Platform & correctness | RBAC, users, audit, login hardening | GST correctness, compliance hardening, re-rate tool |
| **2** | 7–10 | 7 Dec – 3 Jan | Close the transaction loop | Split tender, returns, cancel, cash register, POS refactor, receipts/payments API | Outbox worker, purchase orders, purchase returns, supplier ledger, loyalty redemption |
| **3** | 11–14 | 4 Jan – 31 Jan | Multi-store chain | Stores, switcher, per-store settings, stock transfers, warehouse | Chain reports, reorder engine, central purchasing, per-GSTIN returns |
| **4** | 15–18 | 1 Feb – 28 Feb | Offline & onboarding | Offline POS (PWA, IndexedDB, sync) | Marg/generic import wizard |
| **5** | 19–22 | 1 Mar – 28 Mar | Finance & real integrations | Expenses, ledgers, credit control, period lock, year-end | Real e-invoice/e-way bill (GSP), GSTR-2B/IMS, WhatsApp/SMS production, DPDP |
| **6** | 23–26 | 29 Mar – 25 Apr | Hardening & launch | Observability, performance, deployment, security headers | AI hardening, onboarding wizard, inspector exports, pilot |

Part-time schedules slip. **Don't skip Phase 0 or Phase 1 to "catch up".** Everything after them depends on them. If behind, cut the *stretch* items (marked "stretch") first.

### Ownership summary
Full map in `.github/CODEOWNERS` and [ADR 0004](docs/adr/0004-two-lane-ownership.md).

- **Lane A:** platform (auth, sessions, RBAC, users, stores, audit, env, CI, tests, migrations tooling), sales/POS, inventory and stock transfers, accounting core, offline POS, deployment.
- **Lane B:** purchasing and suppliers, compliance registers, GST and e-invoice, customers/groups/loyalty/orders, WhatsApp/SMS/reminders/outbox, reports and dashboards, AI, data import.
- *Change from the initial proposal:* **purchasing moved to Lane B** to balance the load, because Lane A carries the offline POS. To swap anything, edit this table, CODEOWNERS and ADR 0004 in one PR.

---

## Phase 0 · Foundation & safety (Weeks 1–2)

**Goal:** a codebase both developers can safely build on in parallel. That means reproducible databases, files split by owner, tests that run in CI, and the critical security holes closed.

**Order matters inside this phase:**
- Day 1–3: **A0.1 → A0.3 merge first** (catch-up migration and schema split). Meanwhile Lane B does the tasks that don't touch the schema (B0.2, B0.3, B0.6, B0.7).
- Day 4 onward: both lanes do everything else.

### Lane A · Phase 0

#### A0.1 ⛔ 🔀 Catch-up migration (fixes audit C5) ⏱ 0.5 day
- **Why:** `drizzle/0000_init.sql` creates 37 tables, but the schema defines ~58. CI, new machines and production can't be built from migrations.
- **Files:** ➕ `drizzle/0001_catch_up.sql`, ✏️ `drizzle/meta/_journal.json`, ➕ `drizzle/meta/0001_snapshot.json` (all generated).
- **How:**
  1. `git merge origin/main` (start from the latest schema).
  2. `npx drizzle-kit generate --name catch_up`
  3. Read the SQL: it should only `CREATE TABLE` the ~21 missing tables and `ALTER TABLE … ADD COLUMN` for columns added since `0000` (e.g. `customers.group_id`, `sales.medical_rep_id`, `medicines.rack_id`). If it tries to DROP anything, stop and investigate.
  4. Recreate your local DB from migrations only: `dropdb mediflow; createdb mediflow; npx tsx src/server/db/migrate.ts; npx tsx scripts/setup-db.ts`. The app must start and POS billing must work.
  5. Tell Kapil to recreate his DB the same way after merge.
- **Done when:** a fresh empty database plus `migrate` produces a working app, and a `drizzle-kit generate` right after reports "No schema changes".

#### A0.2 🔀 npm scripts for DB work ⏱ 0.25 day
- **Files:** ✏️ `package.json`.
- **How:** add
  ```json
  "db:generate": "drizzle-kit generate",
  "db:migrate": "tsx src/server/db/migrate.ts",
  "db:studio": "drizzle-kit studio",
  "db:seed": "tsx scripts/setup-db.ts",
  "db:reset": "tsx scripts/reset-db.ts"
  ```
  ➕ `scripts/reset-db.ts`: refuses to run unless `DATABASE_URL` host is `localhost` / `127.0.0.1`. Then it runs `DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;` and calls migrate and seed.
- **Done when:** `npm run db:reset` gives a fresh seeded local DB in one command.

#### A0.3 ⛔ 🔀 Split `schema.ts` into module files ⏱ 1 day
- **Why:** both lanes add tables every phase. One 1,261-line file means a merge conflict every week. Ownership should map to files (docs/04).
- **Files:**
  - ➕ `src/server/db/schema/_helpers.ts`: move `id`, `money`, `createdAt`, `updatedAt` here. `tenantId()` / `storeId()` live in `platform.ts` instead (they reference `tenants`/`stores`; putting them in `_helpers` would create an import cycle).
  - ➕ `platform.ts`, `catalog.ts`, `inventory.ts`, `sales.ts`, `accounting.ts`, `purchasing.ts`, `compliance.ts`, `gst.ts`, `crm.ts`, `comms.ts`, `banking.ts`, `ai.ts`. The table → file mapping is in docs/04.
  - ➕ `src/server/db/schema/index.ts` with `export * from "./platform"; export * from "./catalog"; …`
  - 🗑️ `src/server/db/schema.ts`
  - ✏️ `drizzle.config.ts`: `schema: "./src/server/db/schema/index.ts"`
- **How:**
  1. **Cut and paste only.** Don't rename or change anything, so the diff stays reviewable.
  2. Each file imports what it references, e.g. `sales.ts` imports `{ customers } from "./crm"`, `{ medicines } from "./catalog"`, `{ batches } from "./inventory"`, `{ prescriptions } from "./compliance"`, `{ users, stores, tenants } from "./platform"`. The helper `tenantId()` references `tenants`, so `_helpers.ts` imports `tenants` from `./platform`, and `platform.ts` must **not** import `_helpers`' `tenantId()`. Inline it there.
  3. Keep the exported `type X = typeof x.$inferSelect` lines next to their tables.
  4. `src/server/db/index.ts` keeps `import * as schema from "./schema"`. That resolves to the folder's `index.ts`, so no other file changes.
  5. Verify: `npm run typecheck`, `npm run build`, and `npx drizzle-kit generate` prints **"No schema changes"**. That proves the split is behaviour-neutral.
- **Done when:** the three checks above pass. Merge it **the same day** and announce it, because Lane B's open work must merge `main` right after.

#### A0.4 🧪 Test harness: Vitest + real Postgres in CI ⏱ 1.5 days
- **Why:** there are zero tests today. Money, stock and sequences need proof (docs/09).
- **Files:**
  - ➕ `vitest.config.ts` (sketch in docs/09; alias `@` → `src`, alias `server-only` → empty module).
  - ➕ `tests/setup/env.ts`: loads `.env.test` via dotenv.
  - ➕ `tests/setup/global.ts` + `tests/setup/db.ts`: a migrated template database is built once per run; `createTestDb()` copies it into a private database per test file (a schema per file was tried first and does not work: the generated migrations hard-code `"public"`). Returns `{ db, cleanup }`.
  - ➕ `tests/setup/factories.ts`: `makeTenant`, `makeStore`, `makeUser`, `makeMedicine`, `makeBatch`, `makeCustomer`, `makeSupplier`. Each inserts minimal valid rows and returns them.
  - ➕ `tests/setup/empty.ts` (`export {}`).
  - ➕ `docker-compose.yml`: a `db` service `postgres:16` with env `POSTGRES_USER/PASSWORD/DB=mediflow`, port `5432`, and a healthcheck.
  - ➕ `.env.test.example`: `DATABASE_URL=postgres://mediflow@localhost:5432/mediflow_test` (passwordless, local only).
  - ✏️ `.github/workflows/ci.yml`: add a Postgres service container and `DATABASE_URL` for tests:
    ```yaml
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_USER: mediflow, POSTGRES_HOST_AUTH_METHOD: trust, POSTGRES_DB: mediflow_test }
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U mediflow" --health-interval 5s --health-timeout 5s --health-retries 10
    ```
    and set the test step's env `DATABASE_URL: postgres://mediflow@localhost:5432/mediflow_test`. Keep the dummy URL for the build step.
  - ➕ `tests/unit/money.test.ts`, ➕ `tests/integration/stock.test.ts`, ➕ `tests/integration/sequence.test.ts`. The cases are listed in docs/09 §"Must-have tests".
- **How (refactor needed for testability):** `nextDocNumber(tx, tenantId, storeId, docType, prefix)` reads `new Date()` internally. Add an optional last parameter `now: Date = new Date()` so tests can check the fiscal-year rollover on 31 Mar → 1 Apr.
- **Done when:** CI runs and passes these tests on every PR. The concurrency test (two parallel sales of 6 out of 10 units → exactly one succeeds) passes.

#### A0.5 🔀 Split the sidebar navigation into module files ⏱ 0.5 day
- **Why:** `src/app/components/Sidebar.tsx` (358 lines) holds every menu item. Both lanes add pages every phase.
- **Files:** ➕ `src/app/components/nav/types.ts` (`NavItem { href, label, icon, permission?, children? }`), ➕ `nav/sales.ts`, `nav/inventory.ts`, `nav/purchasing.ts`, `nav/crm.ts`, `nav/compliance.ts`, `nav/gst.ts`, `nav/accounting.ts`, `nav/reports.ts`, `nav/comms.ts`, `nav/settings.ts`, ➕ `nav/index.ts` (ordered array of groups), ✏️ `Sidebar.tsx` (render from config), ✏️ `CommandPalette.tsx` (build its jump list from the same config so it stays in sync).
- **How:** move the existing items 1:1. Add the optional `permission` field now (used by A1.3 to hide items the user can't access).
- **Done when:** the sidebar looks identical; adding a page means editing only your module's nav file.

#### A0.6 Lint debt → make lint blocking ⏱ 1 day (split with Lane B)
- **Progress:** completed in `lane-a/a0-6-make-lint-blocking`. All blocking ESLint errors resolved across Lane A and Lane B files (0 errors across `src`, `tests`, `scripts`). Removed the temporary `CLEAN_PATHS` whitelist script (`scripts/lint-strict.mjs`), updated `package.json` with authoritative `npm run lint:strict` (`eslint --quiet src tests scripts`), and replaced the split informational lint step with a single blocking CI step without `continue-on-error: true`.
- **Why:** 70 lint errors mean CI can't enforce lint (`continue-on-error: true` in `ci.yml`).
- **How:** each lane fixes lint errors **in its own files** (CODEOWNERS), mostly replacing `any` with inferred Drizzle types or `unknown`. Lane B does its half in B0.5. When `npx eslint src` reports 0 errors, Lane A removes `continue-on-error` from `.github/workflows/ci.yml`. Warnings can stay for now.
- **Done when:** the lint step is blocking and green.

#### A0.7 🧪 Sale transaction safety fixes (audit C1, C4) ⏱ 0.5 day
- **Why:** `try/catch` around the GST-document and loyalty steps inside the sale transaction (`src/app/actions/sales.ts:483,496`) doesn't work in Postgres. One failed statement aborts the whole transaction.
- **Files:** ✏️ `src/app/actions/sales.ts`, ✏️ `src/server/domain/sequence.ts`.
- **How:**
  ```ts
  // inside db.transaction(async (tx) => { ... })
  try {
    await tx.transaction(async (sp) => {            // SAVEPOINT
      await createGstDocumentFromSale(sp, { saleId: sale.id, tenantId, storeId });
    });
  } catch (e) {
    console.error("GST document creation failed; sale kept", e); // TODO B2.1: enqueue a retry in the outbox
  }
  ```
  Do the same for `LoyaltyService.earnPoints`. In `nextDocNumber`, throw `DomainError("INVOICE_NO_TOO_LONG")` if the result is longer than 16 characters (Rule 46). Then ✏️ `src/app/actions/settings.ts`: validate `invoicePrefix` so prefix + `/YY-YY/000000` stays ≤ 16, which means a prefix ≤ 3 characters with the current format.
- **Done when:** an integration test that forces `createGstDocumentFromSale` to throw (e.g. by mocking it) still commits the sale.

**Lane A · Phase 0 exit:** fresh-DB reproducibility ✅ · schema split merged ✅ · tests in CI ✅ · lint blocking ✅.

### Lane B · Phase 0

#### B0.1 ⛔ 🔀 API keys for `/api/v1/*` (audit S1, S2: **critical**) ⏱ 1.5 days (after A0.3 merges)
- **Why:** `/api/v1/stock/check` leaks every tenant's catalogue and prices. `/api/v1/orders` lets anyone create orders in any tenant (it defaults to the first tenant).
- **Files:**
  - ✏️ `src/server/db/schema/platform.ts`: add `api_keys` (design in docs/13). Generate a migration.
  - ➕ `src/server/api-auth.ts`:
    ```ts
    import "server-only";
    import crypto from "node:crypto";
    export type ApiScope = "stock.read" | "orders.write" | "orders.read";
    export class ApiAuthError extends Error { constructor(public status: 401 | 403, msg: string) { super(msg); } }

    export async function authenticateApiKey(req: Request, scope: ApiScope) {
      const raw = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (!raw?.startsWith("mf_live_")) throw new ApiAuthError(401, "Missing API key");
      const hash = crypto.createHash("sha256").update(raw).digest("hex");
      const [key] = await db.select().from(schema.apiKeys)
        .where(and(eq(schema.apiKeys.keyHash, hash), isNull(schema.apiKeys.revokedAt))).limit(1);
      if (!key) throw new ApiAuthError(401, "Invalid API key");
      if (!key.scopes.includes(scope)) throw new ApiAuthError(403, `Key lacks scope ${scope}`);
      // fire-and-forget last_used_at (don't block the request)
      void db.update(schema.apiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.apiKeys.id, key.id));
      return { tenantId: key.tenantId, storeId: key.storeId, keyId: key.id };
    }
    export function apiError(e: unknown) { /* map ApiAuthError → NextResponse.json({error}, {status}) else 500 */ }
    ```
  - ✏️ `src/app/api/v1/stock/check/route.ts`: call `authenticateApiKey(req, "stock.read")`. Add `eq(medicines.tenantId, auth.tenantId)` to the `where`. Join batches on `auth.storeId` (require a store-scoped key for stock). Filter out expired batches.
  - ✏️ `src/app/api/v1/orders/route.ts`: `POST` uses `authenticateApiKey(req, "orders.write")`. **Delete** the `body.tenantId` and "first tenant" fallback. `GET` uses `"orders.read"` and filters by `auth.tenantId`. Validate the body with Zod.
  - ✏️ `src/app/actions/external-orders.ts`: `createExternalOrder` must not accept `tenantId` from callers. Split it into `createExternalOrderForTenant(tenantId, input)` (server-only domain function, used by the API) and the session-based action.
  - ✏️ `src/proxy.ts`: add `"/api/v1"` and `"/api/webhooks"` as **prefix** matches that skip the cookie redirect. These routes authenticate themselves. Remove `/api/chat` from `publicRoutes`; it already checks the session, and it should get a 401 JSON response rather than a redirect, so handle `/api/*` with a 401 instead of a redirect.
  - ➕ `src/app/dashboard/settings/api-keys/page.tsx` + `ApiKeysClient.tsx` + actions in ➕ `src/app/actions/api-keys.ts` (create → show the full key once; list shows `prefix…`; revoke). Permission `settings.manage`.
- **Done when:** both endpoints return 401 without a key. A key for tenant T1 can't see T2's data (integration test 🧪).

#### B0.2 WhatsApp webhook signature verification (audit S4) ⏱ 0.5 day
- **Files:** ✏️ `src/app/api/webhooks/whatsapp/route.ts`, ✏️ `src/env.ts` (add optional `WHATSAPP_APP_SECRET`).
- **How:**
  ```ts
  export async function POST(req: NextRequest) {
    const raw = await req.text();                              // raw body, needed for the HMAC
    const sig = req.headers.get("x-hub-signature-256") ?? "";
    const expected = "sha256=" + crypto.createHmac("sha256", env.WHATSAPP_APP_SECRET!).update(raw).digest("hex");
    const ok = sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!ok) return new NextResponse("Invalid signature", { status: 401 });
    await WhatsAppService.handleIncomingWebhook(JSON.parse(raw));
    return NextResponse.json({ status: "ok" });
  }
  ```
  In `GET`, delete `|| token === "mediflow_wa_webhook"`. Don't echo internal error messages back to the caller; return a generic 400.
- **Done when:** a unit test with a known secret, body and signature passes, and a tampered body fails 🧪.

#### B0.3 Make the e-invoice simulator impossible to mistake for real (audit S5) ⏱ 0.5 day
- **Files:** ✏️ `src/server/domain/e-invoice.ts`, ✏️ `src/env.ts`, ✏️ `src/app/dashboard/gst/e-invoice/EInvoiceClient.tsx`, ✏️ `src/app/dashboard/sales/[id]/print/page.tsx`.
- **How:** rename `NICIRPProvider` → `SimulatedIRPProvider` (`name = "SIMULATOR"`). Add `EINVOICE_MODE: z.enum(["disabled","simulator","sandbox","production"]).default("disabled")` to env. `generateEInvoiceForDocument` throws unless the mode is `simulator`, and later `sandbox` or `production` with a real provider (B5.1). The UI shows a red "SIMULATED – NOT VALID" badge, and the print page prints "SIMULATED IRN – NOT A VALID E-INVOICE" if the provider was the simulator. Store the provider name in `e_invoice_logs.request_payload.provider`.
- **Done when:** with the default env, e-invoice actions return a clear "e-invoicing not configured" error.

#### B0.4 🔀 Encrypt third-party secrets at rest (audit S6) ⏱ 1 day (after A0.3)
- **Files:** ➕ `src/server/crypto.ts`, ✏️ `src/env.ts` (`APP_ENCRYPTION_KEY`: base64, 32 bytes, required in production), ✏️ `src/server/domain/whatsapp.ts`, ✏️ `src/server/domain/sms.ts`, ✏️ `src/app/actions/whatsapp.ts`, ✏️ `src/app/actions/sms.ts`, ➕ `scripts/encrypt-existing-secrets.ts`.
- **How:**
  ```ts
  // src/server/crypto.ts — AES-256-GCM; output "v1:<iv b64>:<tag b64>:<ciphertext b64>"
  export function encryptSecret(plain: string): string { /* randomBytes(12) iv, createCipheriv("aes-256-gcm", key, iv) */ }
  export function decryptSecret(stored: string): string { /* if !stored.startsWith("v1:") return stored (legacy plaintext) */ }
  ```
  Encrypt in `saveWhatsAppConfig` / `saveSmsConfig`, and decrypt only where the token is used to call the provider. `get*Config` actions return `accessToken: mask(token)` (`••••1a2b`), **never** the real value. The save action ignores a masked value, meaning "unchanged". The script re-saves existing rows encrypted.
- **Done when:** the DB shows `v1:` values and the settings UI never receives a real secret 🧪 (encrypt → decrypt round trip, and tamper detection).

#### B0.5 GST 2.0 rates and regulatory constants (audit C2) ⏱ 0.5 day + lint share
- **Files:** ➕ `src/lib/regulatory.ts` (content in docs/05 §5). ✏️ `src/server/db/schema/catalog.ts`: `gstRateBp … .default(500)` 🔀 (Lane A file, one-line change; ask overxpowered to review). Generate a migration. ✏️ the new-medicine form `src/app/dashboard/inventory/new/page.tsx`: GST select from `GST_RATES_BP`, default 5%. ✏️ `src/app/actions/inventory.ts` (`createMedicine`): reject rates not in `GST_RATES_BP`, after agreeing with Lane A. Plus a **lint share**: fix lint errors in Lane B's files (A0.6).
- **Done when:** new medicines default to 5% and invalid rates are rejected. The re-rate tool for existing items comes in B1.6.

#### B0.6 Environment validation, `.env.example`, README fixes (audit C7) ⏱ 0.5 day
- **Files:** ✏️ `src/env.ts`, ➕ `.env.example`, ✏️ `README.md`.
- **How:** extend the Zod schema with every variable the code reads (docs/08 table). AI keys are optional (`z.string().optional()`). `APP_ENCRYPTION_KEY` and `CRON_SECRET` are required when `NODE_ENV === "production"` (use `.superRefine`). Replace direct `process.env.X` reads in `src/app/api/chat/route.ts`, `src/server/ai.ts` and `src/app/api/webhooks/whatsapp/route.ts` with `env.X`. In the README, fix `GOOGLE_GENERATIVE_AI_API_KEY` → `GEMINI_API_KEY`, remove `SESSION_SECRET`, fix the clone URL, replace `drizzle-kit push` with `npm run db:migrate`, and link to `docs/`.
- **Done when:** the app fails fast at boot with a clear message when a required variable is missing.

#### B0.7 Repo hygiene (audit C6, C9) ⏱ 0.5 day
- **Files:** 🗑️ `scripts/migrate-tenant.ts`. Fix `scripts/Indian-Medicine-Dataset`: either add `.gitmodules` with the dataset's real upstream URL (`git rm --cached scripts/Indian-Medicine-Dataset && git submodule add <url> scripts/Indian-Medicine-Dataset`), or remove the gitlink and add ➕ `scripts/fetch-dataset.ts`, which downloads the CSV to a git-ignored folder. Prefer the latter for licence clarity, and check the dataset's licence. 🗑️ `test-chat.mjs` at the repo root if it's a scratch file, or move it to `scripts/`.
- **Done when:** a fresh clone plus documented commands seeds the medicine dataset.

#### B0.8 Collect real Marg exports (non-code, start now; needed in Phase 4) ⏱ ongoing
- Ask 2–3 pharmacy contacts for **anonymised** Marg exports: item master, batch stock, customers, suppliers, outstanding. Store them privately, not in the repo. Note which Marg version and menu produced each file. This unblocks B4.2.

**Lane B · Phase 0 exit:** no unauthenticated data access ✅ · webhook verified ✅ · secrets encrypted ✅ · GST 2.0 default ✅ · env validated ✅.

### Phase 0 integration checkpoint (end of week 2)
- [ ] Both developers rebuilt their local DB from migrations.
- [ ] CI: typecheck, lint, test and build are all blocking and green on `main`.
- [ ] Branch guard green. **Kapil:** renamed `master` → `main`, set merge-commit-only, and enabled protection if the plan allows (docs/07 one-time setup).
- [ ] Security spot-check: `curl -X POST localhost:3000/api/v1/stock/check -d '{"query":"dolo"}'` → 401.

---

## Phase 1 · Platform & correctness (Weeks 3–6)

**Goal:** permissions actually enforced, staff accounts manageable, GST and compliance math provably right.

**Contracts on day 1–2:** 🤝 A1.1/A1.2 (`requirePermission`, `protectedAction`) and 🤝 B1.2 (`determineTaxContext`).

### Lane A · Phase 1

#### A1.1 ⛔ 🤝 RBAC core ⏱ 1.5 days
- **Why:** `src/lib/permissions.ts` defines permissions and roles, but nothing checks them (audit S3). A cashier can currently post purchases, change settings and read P&L.
- **Files:** ➕ `src/server/rbac.ts`, ➕ `src/server/errors.ts`, ✏️ `src/lib/permissions.ts` (add `store.manage`, `store.switch_any`, `inventory.transfer_receive`, `report.all_stores`, `api_key.manage` 🔀).
- **How:**
  ```ts
  // src/server/errors.ts
  export class DomainError extends Error { constructor(public code: string, message: string) { super(message); } }
  export class ForbiddenError extends DomainError { constructor(public permission: string) { super("FORBIDDEN", `Missing permission: ${permission}`); } }

  // src/server/rbac.ts
  import "server-only";
  import { cache } from "react";
  export interface AuthCtx {
    tenantId: string; storeId: string; userId: string;
    user: { id: string; name: string; email: string; pharmacistRegNo: string | null };
    permissions: ReadonlySet<Permission>;
    allowedStoreIds: "all" | string[];
  }

  /** Loads session + membership + permissions once per request (React cache). */
  export const getAuthCtx = cache(async (): Promise<AuthCtx> => {
    const { session, user } = await requireAuth();
    const [m] = await db.select().from(schema.memberships)
      .where(and(eq(schema.memberships.tenantId, session.tenantId), eq(schema.memberships.userId, user.id))).limit(1);
    if (!m || m.status !== "active") throw new ForbiddenError("membership.active");
    const rows = await db.select({ p: schema.rolePermissions.permission }).from(schema.rolePermissions)
      .where(eq(schema.rolePermissions.roleId, m.roleId));
    return {
      tenantId: session.tenantId, storeId: session.storeId, userId: user.id,
      user: { id: user.id, name: user.name, email: user.email, pharmacistRegNo: user.pharmacistRegNo },
      permissions: new Set(rows.map((r) => r.p as Permission)),
      allowedStoreIds: m.allStores ? "all" : m.storeIds,
    };
  });

  export async function requirePermission(p: Permission): Promise<AuthCtx> {
    const ctx = await getAuthCtx();
    if (!ctx.permissions.has(p)) throw new ForbiddenError(p);
    return ctx;
  }
  export const can = (ctx: AuthCtx, p: Permission) => ctx.permissions.has(p);

  /** Creates the 7 system roles + their role_permissions for a tenant. Idempotent. */
  export async function seedSystemRoles(tx: DbOrTx, tenantId: string) {
    for (const r of SYSTEM_ROLES) {
      const [role] = await tx.insert(schema.roles)
        .values({ tenantId, key: r.key, name: r.name, description: r.description, isSystem: true })
        .onConflictDoUpdate({ target: [schema.roles.tenantId, schema.roles.key], set: { name: r.name } })
        .returning({ id: schema.roles.id });
      await tx.insert(schema.rolePermissions)
        .values(r.permissions.map((permission) => ({ roleId: role.id, permission })))
        .onConflictDoNothing();
    }
  }
  ```
  Never expose `AuthCtx.user.passwordHash`; note that it isn't selected into the DTO above.
- **Done when:** unit tests for `can` pass, plus an integration test: a cashier's `requirePermission("purchase.create")` throws 🧪.

#### A1.2 ⛔ 🤝 `protectedAction` wrapper ⏱ 1 day
- **Files:** ✏️ `src/server/action.ts`.
- **How:**
  ```ts
  import { createSafeActionClient } from "next-safe-action";
  export const actionClient = createSafeActionClient({
    handleServerError(e) {
      if (e instanceof DomainError) return e.message;        // safe, user-facing
      console.error("[action]", e);
      return "Something went wrong. Please try again.";
    },
  });
  export const protectedAction = (permission: Permission) =>
    actionClient.use(async ({ next }) => next({ ctx: await requirePermission(permission) }));
  ```
  Calling convention (document it in docs/06): client components call actions via `useAction(action)` from `next-safe-action/hooks`, or `await action(input)`, and read `{ data, serverError, validationErrors }`. Actions take **one object** argument (Zod schema), not positional arguments.
  Merge A1.1 and A1.2 together as the **contract PR** in week 3, then migrate modules.
- **Done when:** one module (`racks.ts`) is migrated as the reference example, with its client call sites updated.

#### A1.3 Apply RBAC to Lane A modules + seed roles ⏱ 3 days
- **Progress:** done already as part of A1.1/A1.2: system roles are seeded at registration (`registerAction`), in `db:seed`, and by a backfill that runs after every `db:migrate` (`src/server/roles.ts`; it replaces the SQL data migration this task originally planned, because the templates live in TypeScript). `racks.ts` is the reference action. `forbidden.tsx` + `requirePagePermission` exist. **Also done (A1.3 complete):** all Lane A actions use `requirePermission`/`checkPermission` (stock, inventory, accounting, sales, settings), every Lane A page/layout calls `requirePagePermission`, the sidebar and command palette hide what the user cannot use, `createSaleInvoice` validates qty/discount/amount server-side and supports an optional discount ceiling (`tenants.settings.maxDiscountBp`, enforced with `sale.discount_override`; a settings screen arrives in A3.1), and `createMedicine` defaults to 5% GST and rejects invalid rates. Lane B's pages/actions are guarded in B1.5.
- **Files:** ✏️ `src/app/actions/{auth,sales,stock,inventory,racks,accounting,settings}.ts`, plus their client call sites; ✏️ `src/app/actions/auth.ts` (`registerAction` calls `seedSystemRoles(tx, tenant.id)` and assigns the `owner` role, replacing the bare role insert at `auth.ts:104–116`); ➕ a migration with a **data backfill** (for every tenant, create the system roles and permissions, and point existing memberships whose role key is `owner` at the seeded owner role); ✏️ `src/app/components/Sidebar.tsx` (hide nav items whose `permission` the user lacks; pass the permission list from `dashboard/layout.tsx` as a prop; it's a small string array, which is fine); ✏️ Lane A pages: Server Components call `await requirePermission("x.view")` at the top; ➕ `src/app/dashboard/forbidden.tsx` or an inline "no access" component (or enable `experimental.authInterrupts` and use `forbidden()`; read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/forbidden.md` first; it's experimental).
- **Permission mapping (Lane A actions):**
  | Action | Permission |
  |---|---|
  | `createSaleInvoice`, `searchPosItems`, `findSubstitutes` | `sale.create` |
  | `getSales`, `getSaleById` | `sale.view` |
  | discount above the store limit (new setting `maxDiscountBp`) | `sale.discount_override` |
  | `addOpeningStock`, `adjustBatchStock` | `inventory.adjust` |
  | `getBatches` | `inventory.view` |
  | `createMedicine`, `createCategory`, `createManufacturer`, racks CRUD | `medicine.manage` |
  | `getMedicines` | `medicine.view` |
  | accounting reads | `accounting.view` |
  | `updateStoreSettings` | `settings.manage` |
- **Done when:** the tenant-isolation and RBAC test (A1.7) passes for every Lane A action.

#### A1.4 Users, roles & store access UI ⏱ 2.5 days
- **Why:** a chain owner must create staff logins, assign roles and restrict them to branches.
- **Files:** ✏️ `schema/platform.ts`: ➕ `user_invites (id, tenant_id, email, role_id, all_stores, store_ids, token_hash, expires_at, accepted_at, created_by)`; migration. ➕ `src/server/domain/users.ts` (`inviteUser`, `acceptInvite`, `updateMembership`, `suspendMember`). ➕ `src/app/actions/users.ts` (permission `user.manage`). ➕ `src/app/dashboard/settings/users/page.tsx` + `UsersClient.tsx` (table: name, email, role, stores, status; invite modal; edit role and stores; suspend). ➕ `src/app/invite/[token]/page.tsx` (accept: set name and password → create user and membership → sign in). ➕ `src/app/dashboard/settings/roles/page.tsx`: read-only view of system roles and permissions in v1; custom roles are a stretch goal.
- **How:** the invite link is shown for copying in v1 (no email infrastructure yet). Later B5.4 can send it via WhatsApp. Store only `sha256(token)`. The owner can't remove their own `owner` role if they are the last owner.
- **Done when:** the owner invites a cashier, the cashier signs in, sees only POS and allowed pages, and only their allowed stores.

#### A1.5 Login hardening and correct store selection (audit S7) ⏱ 1 day
- **Files:** ✏️ `schema/platform.ts`: ➕ `login_attempts (id bigserial, email_lower, ip, success bool, created_at)` with an index on `(email_lower, created_at)`; ➕ `memberships.last_store_id`. ✏️ `src/app/actions/auth.ts`.
- **How:**
  - Before verifying the password, count failures for this email in the last 15 minutes. If there are 10 or more, return "Too many attempts, try again in 15 minutes". Always record the attempt. Use the same generic error for "no such user" and "wrong password" (already the case).
  - Store choice: `last_store_id` if it's still allowed, else the first store in `membership.storeIds`, else (for `allStores`) the first active store of the tenant. Login fails cleanly if the user has no allowed store.
  - Users with multiple memberships (tenants): pick the most recent for now. A tenant picker is a stretch goal.
  - ➕ "Change password" in ➕ `src/app/dashboard/settings/profile/page.tsx`. It invalidates other sessions.
- **Done when:** tests pass for the lockout and for store selection respecting `store_ids` 🧪.

#### A1.6 Audit log ⏱ 1.5 days
- **Files:** ➕ `src/server/audit.ts`, ➕ `src/app/dashboard/settings/audit/page.tsx` (permission `audit.view`; filters by user, entity and date), ✏️ the Lane A actions listed below.
- **How:**
  ```ts
  export async function writeAudit(tx: DbOrTx, ctx: Pick<AuthCtx,"tenantId"|"storeId"|"userId">, e: {
    action: "create"|"update"|"delete"|"cancel"|"login"|"price_change"|"stock_adjust"|"permission_change";
    entityType: string; entityId?: string; oldValue?: unknown; newValue?: unknown; reason?: string;
  }) { await tx.insert(schema.auditLogs).values({ ...e, tenantId: ctx.tenantId, storeId: ctx.storeId, userId: ctx.userId }); }
  ```
  Call it **inside the same transaction** for: stock adjustments, medicine price, GST or schedule changes, store settings changes, role and membership changes, sale cancel and return (Phase 2), and discount overrides. Lane B adds calls in its modules (B1.5).
- **Done when:** adjusting stock shows an audit row with old and new quantity and the reason.

#### A1.7 🧪 Tenant-isolation and RBAC test suite ⏱ 1.5 days
- **Files:** ➕ `tests/integration/isolation.test.ts`, ➕ `tests/setup/auth.ts` (helper to run a server action as a given user: mock `requireAuth` or `getAuthCtx` via `vi.mock("@/server/rbac")` to return a chosen ctx).
- **How:** a table-driven list `[{ name, call: (ids) => action(...), permission }]`. For each entry: (1) a user without the permission gets a `serverError`; (2) a user of tenant T2 calling with T1's IDs gets not found or an empty result. Lane B appends its actions in B1.5.
- **Done when:** CI runs the suite and every listed action passes.

### Lane B · Phase 1

#### B1.1 Use `regulatory.ts` everywhere ⏱ 0.5 day
- Replace magic numbers in `src/server/domain/gst.ts` (e.g. the B2CL threshold `25000000` at `gst.ts:90`; verify the current threshold value), `compliance.ts` and `e-invoice.ts` with the named constants from `src/lib/regulatory.ts`.

#### B1.2 🤝 Inter-state GST determination (audit C3) ⏱ 1.5 days
- **Why:** `createSaleInvoice` hard-codes `isInterState = false` (`sales.ts:316`). B2B sales to customers in other states must charge IGST.
- **Files:** ✏️ `src/server/domain/gst.ts`: add and export
  ```ts
  export interface TaxContext { supplyType: "B2B" | "B2C"; placeOfSupply: string; isInterState: boolean; }
  /** Pure: decides place of supply & inter-state for a sale. */
  export function determineTaxContext(input: {
    storeStateCode: string; storeGstin?: string | null;
    customerGstin?: string | null; customerStateCode?: string | null;
  }): TaxContext
  ```
  Rules: if the customer has a GSTIN, it's B2B, the place of supply is the GSTIN's first 2 digits, and inter-state means it differs from the store's state. Otherwise it's B2C and the place of supply is the store's state (counter sale), so it's never inter-state.
  ✏️ `schema/crm.ts`: ➕ `customers.state_code` (B owns crm); migration. ✏️ the customer forms: state picker auto-filled from the GSTIN.
  🤝 Lane A wires it into the sale (A2.1): `computeSaleTotals(lines, ctx.isInterState)`, and sets `sales.is_inter_state`.
- **Done when:** unit tests cover all four combinations, plus an invalid GSTIN 🧪.

#### B1.3 🧪 GST test suite ⏱ 2 days
- **Files:** ➕ `tests/unit/gst.test.ts`, ➕ `tests/integration/gstr1.test.ts`, ➕ `tests/fixtures/gstr1-expected.json`.
- **How:** test `isValidGstin` with the real mod-36 checksum (implement it if it's missing; verify the current implementation at `gst.ts:57`), `extractStateCodeFromGstin` and `determineSupplyType`. For `buildGstr1Data`, seed 5 sales (B2B intra, B2B inter, B2C small, B2CL, a credit note once B2.6 lands), build the JSON and compare it with the fixture. Check the payload keys against the GST portal's published GSTR-1 JSON schema (`b2b`, `b2cl`, `b2cs`, `cdnr`, `hsn`, `doc_issue`).
- **Done when:** the suite is green and the fixture has been validated once in the GST offline tool.

#### B1.4 🧪 Compliance hardening ⏱ 2 days
- **Files:** ✏️ `src/server/domain/compliance.ts`, ✏️ `src/app/actions/compliance.ts`, ➕ `tests/unit/compliance.test.ts`, ➕ `tests/integration/dispensing.test.ts`.
- **How:**
  - Tests for `validateDispensingCompliance` covering each schedule.
  - When a sale references `prescriptionId`, increment `prescription_items.quantity_dispensed` and set the prescription's `status` to `partially_dispensed` or `fully_dispensed`. Block dispensing more than prescribed for H1/X. Expose 🤝 `applyPrescriptionDispensing(tx, { prescriptionId, lines })` for Lane A to call from the sale (A2.1).
  - Prescription validity: reject when `validUntil < today`.
  - **No deletes:** make sure no action deletes `dispensing_logs` or `prescriptions`. Cancellations set `status = 'cancelled'`.
  - Register export as a printable page per register and date range (➕ `src/app/dashboard/compliance/[register]/print/page.tsx`) showing licence number, pharmacist, and the columns required by the rules (doc 05).
- **Done when:** an inspector-ready H1 register prints for a chosen month.

#### B1.5 Apply RBAC to Lane B modules ⏱ 3 days (after A1.2 merges)
- **Files:** every Lane B action file (CODEOWNERS) and its client call sites; Lane B pages (`requirePermission` at the top of each page).
- **Permission mapping (Lane B):**
  | Area | Permission |
  |---|---|
  | purchases create / view / return | `purchase.create` / `purchase.view` / `purchase.return` |
  | suppliers | `supplier.view` / `supplier.manage` |
  | customers, groups, loyalty adjust | `customer.view` / `customer.manage` |
  | prescriptions, doctors, registers | `prescription.approve` (create/approve), `report.view` (registers read) |
  | GST pages, e-invoice actions | `gst.view` (read), `accounting.post` (generate or cancel e-invoice) |
  | reports, dashboard, exports | `report.view`, `report.export`, `dashboard.view` |
  | WhatsApp, SMS settings | `settings.manage`; sending manual messages: `customer.manage` |
  | AI chat route | `ai.use` (✏️ `src/app/api/chat/route.ts`: use `getAuthCtx()` and check `ai.use`) |
  | CSV export routes (`src/app/api/export/*`) | `report.export` |

  Add `writeAudit` calls for supplier changes, prescription edits, e-invoice cancel and loyalty adjustments. Append Lane B actions to the A1.7 isolation suite.
- **Done when:** the isolation suite covers Lane B actions and is green.

#### B1.6 GST re-rate tool ⏱ 1.5 days
- **Why:** existing catalogues (including the seeded dataset) carry 12% from before GST 2.0.
- **Files:** ➕ `src/app/dashboard/gst/rates/page.tsx` + `RerateClient.tsx`, ➕ action `bulkUpdateGstRates` in `src/app/actions/gst.ts` (permission `medicine.manage`).
- **How:** filter medicines by current rate and HSN prefix (3003/3004). Preview the count. Set a new rate from `GST_RATES_BP`. Write one audit row per batch of changes. **Only the master** is changed; historical `sale_items` and `purchase_items` keep their stored rate.
- **Done when:** all 12% items with HSN 3004 move to 5% in one action, with an audit trail.

#### B1.7 Purchase hardening (added after the 20 Oct 2026 test-guide review) ⏱ 2 days
- **Why:** `createPurchaseInvoice` (`src/app/actions/purchases.ts`) stores the totals the browser sends (`taxableAmount`, `totalAmount`, `discountAmount`) and writes the plain rate as the batch cost, ignoring free quantity. Same class of bug that A1.3 fixed for sales. See B_TEST_GUIDE B-2.0 / B-2.0a.
- **Files:** ✏️ `src/app/actions/purchases.ts` (convert to `protectedAction("purchase.create")` with a Zod schema; never read amounts from input), ✏️ `src/server/domain/` (extract `createPurchase(tx, ctx, input)` like `createSale`), ➕ `tests/integration/purchase-totals.test.ts`.
- **How:** recompute with `computePurchaseTotals` / `computePurchaseLine` (already tested in `src/lib/money.ts`); set `batches.purchase_rate` and `stock_movements.unit_cost` to the **landed unit cost** (taxable ÷ (qty + free)) and fill `purchase_items.landed_unit_cost`; use `determineTaxContext`-style logic for inter-state purchases (`igst`, today hard-coded 0); reject negative qty/rate and GST rates not in `GST_RATES_BP`.
- **Done when:** a tampered request cannot change totals or the journal; a 10+1 purchase gives a unit cost of taxable ÷ 11.

**Phase 1 exit (both lanes):** a cashier login can't do manager things (verified manually and by tests) · invites work · audit log populated · GST and compliance test suites green · inter-state contract merged.

---

## Phase 2 · Close the transaction loop (Weeks 7–10)

**Goal:** every real-world counter and back-office event has a correct flow: split payments, holds, cancels, returns, shift closing, purchase orders, supplier returns and payments, reliable messaging.

**Contracts on day 1–3:**
- 🤝 B2.1 `enqueue(tx, type, payload)`
- 🤝 B2.5 `LoyaltyService.redeemPoints(tx, …)` / `reverseForSale(tx, …)`
- 🤝 B2.6 `createGstDocumentFromReturn` / `cancelGstDocumentForSale`
- 🤝 A2.9 `postPayment(tx, ctx, …)`

### Lane A · Phase 2

#### A2.1 ⛔ Extract the sale domain service ⏱ 2 days
- **Why:** `createSaleInvoice` (≈300 lines in an action) must be reusable by offline sync (Phase 4), held-bill completion and tests.
- **Files:** ➕ `src/server/domain/sales/create-sale.ts`, ➕ `src/server/domain/sales/types.ts` (Zod `SaleInput`), ✏️ `src/app/actions/sales.ts` (thin `protectedAction("sale.create")` wrapper), ➕ `tests/integration/create-sale.test.ts`.
- **How:**
  ```ts
  export const SaleInput = z.object({
    clientSaleId: z.string().uuid().optional(),      // for idempotency (offline, double-click)
    customerId: z.string().uuid().optional(),
    lines: z.array(z.object({ batchId: z.string().uuid(), qty: z.number().int().positive(), discountBp: z.number().int().min(0).max(10000) })).min(1),
    billDiscountPaise: z.number().int().min(0).default(0),
    payments: z.array(z.object({ method: z.enum(["cash","upi","card","credit","bank"]), amount: z.number().int().positive(), reference: z.string().max(64).optional() })),
    redeemPoints: z.number().int().min(0).default(0),
    compliance: ComplianceDetailsSchema.optional(),
    medicalRepId: z.string().uuid().optional(),
    prescriptionId: z.string().uuid().optional(),
  });
  export interface CreateSaleOptions { source: "pos" | "offline" | "external_order"; allowNegativeStock?: boolean; invoiceNo?: string; now?: Date }
  export async function createSale(tx: Tx, ctx: AuthCtx, input: SaleInput, opts: CreateSaleOptions): Promise<{ saleId: string; invoiceNo: string; total: number }>
  ```
  Steps inside: load batches **with `tenant_id` and `store_id`** → expiry and stock checks → compliance (Lane B `validateDispensingCompliance`) → tax context (🤝 B1.2 `determineTaxContext`) → `computeSaleTotals(lines, isInterState, billDiscount)` → number → header → movements → items → dispensing logs → payments (A2.2) → journal → prescription dispensing (🤝 B1.4) → **savepoint** for the GST doc → loyalty earn/redeem (🤝 B2.5) → `enqueue(tx, "whatsapp.receipt", …)` (🤝 B2.1) instead of the synchronous `sendWhatsAppReceipt`.
  Use the server-side `user.pharmacistRegNo` (ctx) instead of the `as unknown as` cast at the current `sales.ts:437`. Pass the manufacturer name to dispensing logs (it's currently `null`): join `manufacturers`.
- **Done when:** every existing POS behaviour still works and the integration test covers a full sale (stock decremented, journal balanced, GST doc created, H1 log written).

#### A2.2 Split-tender payments ⏱ 1.5 days
- **Files:** `domain/sales/create-sale.ts`, `src/app/dashboard/sales/pos/*` (payment panel), ✏️ `src/server/domain/accounting.ts` (`postSaleJournalEntry` takes `payments[]` and debits each method's account: Cash, Bank/UPI clearing, Card clearing, Customer receivable for credit).
- **Rules:**
  - The sum of payments must be ≥ 0 and ≤ the total. Any remaining amount is credit, which requires a `customerId` **and** the `customer.credit` permission **and** must stay within `customers.credit_limit` (0 = no credit allowed). Overpayment in cash returns change, which is recorded as `change_returned` in `sales.notes` or a new column `sales.change_paise`.
  - UPI and card require a `reference` once B5 integrations exist; it's optional now.
- **UI:** `F8` opens the payment panel. Rows: Cash / UPI / Card / Credit with amounts. "Exact" button. Shows change due.
- **Done when:** a bill paid ₹300 cash + ₹200 UPI shows 2 `sale_payments` rows and a balanced journal 🧪.

#### A2.3 Held (parked) bills ⏱ 1 day
- **Progress:** completed in `lane-a/a2-3-held-bills`. Domain service `src/server/domain/sales/held.ts` implements `holdSale`, `listHeldSales`, `resumeHeldSale`, `discardHeldSale` with live stock & expiry revalidation. Integrated into POS counter UI with `F6` (hold) and `F7` (list/resume), stock shortage and expiry alerts, aged (> 24h) badges, and atomic cleanup upon checkout. Verified by unit & integration tests.
- **Files:** ➕ `src/server/domain/sales/held.ts` (`holdSale`, `listHeld`, `resumeHeld`, `discardHeld`), ✏️ POS UI (`F6` hold, `F7` list held).
- **How:** insert `sales` with `status = 'held'`, no invoice number, `held_payload = { lines, customerId, … }`, and **no stock movement**. Resume loads it into the cart and deletes the held row on completion. Held bills older than 24 h show a warning.

#### A2.4 Sale cancellation ⏱ 1.5 days
- **Progress:** completed in `lane-a/a2-4-sale-cancellation`. Domain service `src/server/domain/sales/cancel-sale.ts` implements `cancelSale` with same-day IST window validation, exact batch inventory restoration (`type: sale_return`, `refType: sale_cancel`), exact reversing double-entry journal entry, statutory Schedule H/H1/X dispensing log preservation with cancellation annotation, GST document voiding in GSTR-1 (`cancelGstDocumentForSale`), loyalty points reversal, and immutable audit logging. Integrated with `cancelSaleAction` (`sale.cancel`), invoice detail page UI button (`Alt + C`) and accessible confirmation modal. Verified by unit & integration tests.
- **Files:** ➕ `src/server/domain/sales/cancel-sale.ts`, action `cancelSale` (`sale.cancel`), button on `src/app/dashboard/sales/[id]/page.tsx`.
- **Rules:** allowed only on the **same business day** and before any return. The reason is required. Cancelling reverses stock (`type: "sale_return"`, `refType: "sale_cancel"`), posts a **reversing journal entry** (don't delete the original), sets `status = 'cancelled'`, `cancelled_at` and `cancel_reason`, calls 🤝 B2.6 `cancelGstDocumentForSale`, calls 🤝 B2.5 loyalty reversal, writes an audit row, and marks dispensing logs with a cancellation note (never deletes them). The invoice number stays used; it's reported as cancelled in GSTR-1's document summary.
- **Done when:** after a cancel, stock, ledger and GST report are back to their pre-sale state 🧪.

#### [x] A2.5 Sale returns & credit notes ⏱ 3 days
- **Progress:** completed in `lane-a/a2-5-sale-returns`. Domain service `src/server/domain/sales/return-sale.ts` implements `returnSale` and `getReturnableSaleDetails` with enforced returnable caps (`qty - returned_qty`), proportional recalculation of discounts & GST rates via `computeSaleLine`, permanent sequential Credit Note numbering `nextDocNumber(..., "sale_return", "CN")` (Rule 46, <= 16 chars), exact batch restoration with automated statutory expiry quarantine (`hold`), balanced double-entry General Ledger Credit Note entry (`refType: "sale_return"`), GSTR-1 credit note creation via `createGstDocumentFromReturn`, proportional loyalty points reversal, and immutable audit logging. Integrated with `createSaleReturnAction` and `getReturnableSaleAction` (`sale.return`), return form UI (`Alt + R` / `Alt + S`), returns register (`/dashboard/sales/returns`), and printable credit note preview (`/dashboard/sales/returns/[id]/print`) supporting thermal 80mm and A4 formats. Verified by integration tests.
- **Files:** ➕ `src/server/domain/sales/return-sale.ts`, ➕ actions `createSaleReturn` and `getReturnableItems` (`sale.return`), ➕ `src/app/dashboard/sales/[id]/return/page.tsx` + `ReturnForm.tsx`, ➕ `src/app/dashboard/sales/returns/page.tsx` (list), ➕ `src/app/dashboard/sales/returns/[id]/print/page.tsx` (credit note print).
- **How:** select items and quantities, capped at `qty - returned_qty`. Use the original line's **rate, discount and tax** proportionally; recompute with `computeSaleLine` for the returned quantity and the original rate. Number from `nextDocNumber(…, "sale_return", "CN")`. Stock goes back into the **same batch** (`type: "sale_return"`); if the batch is expired, put it on hold (`batches.status = 'hold'`) for supplier return. Journal: Dr Sales Returns, Dr Output GST, Cr Cash/Bank/Receivable (by `refund_method`). Update `sale_items.returned_qty` and `sales.returned_amount`. Call 🤝 B2.6 `createGstDocumentFromReturn` (credit note) and 🤝 B2.5 loyalty reversal for the returned value.
- **Done when:** a partial return of 1 of 3 strips gives correct stock, journal and a credit note in GSTR-1 CDNR or B2C adjustments 🧪.

#### [x] A2.6 Cash register (shifts) ⏱ 2 days
- **Progress:** completed in `lane-a/a2-6-cash-register`. Domain service `src/server/domain/cash-sessions.ts` implements `openShift`, `closeShift`, `getCurrentShift`, `computeExpectedCash`, `getXReport`, `getZReport`, and `getShiftHistory`. Enforces `cash_sessions_one_open_uq` unique index (only 1 open shift per store). Reconciles expected drawer cash ($Expected = Opening + Cash\ Sales + Receipts - Returns - Cancels - Payouts$). Interactive denomination tally counter for Indian banknotes (₹500, ₹200, ₹100, ₹50, ₹20, ₹10, ₹5, ₹2, ₹1, coins) with keyboard navigation (`Enter` next note, `F4` open, `F8` close). Printable mid-shift snapshot X-Report and closing audit Z-Report in both 80mm thermal slip and A4 formats with cashier and manager signature blocks. POS billing counter integration with `requireShift` tenant/store enforcement and active shift status indicator. Guarded by permission `register.manage`. Verified by integration tests.
- **Files:** ➕ `src/server/domain/cash-sessions.ts`, ➕ `src/lib/cash-register.ts`, ➕ `src/app/actions/cash-sessions.ts`, ➕ `src/app/dashboard/sales/register/page.tsx` + `RegisterClient.tsx`, ➕ `src/app/dashboard/sales/register/x-report/print/page.tsx`, ➕ `src/app/dashboard/sales/register/z-report/[id]/print/page.tsx`, ✏️ `src/app/dashboard/sales/pos/page.tsx`, ✏️ `src/server/domain/sales/create-sale.ts`, ➕ `tests/integration/cash-sessions.test.ts`.
- **How:** opening records the opening cash. Expected cash = opening + cash payments − cash refunds − cash payouts (A2.9 `direction=out, method=cash`) during the shift. Closing records actual cash, the difference and notes. ➕ X-report (mid-shift summary) and Z-report (closing summary) as print pages. The one-open-shift-per-store index already exists.
- **Permission:** `register.manage`.

#### [x] A2.7 POS refactor + loyalty redemption UI ⏱ 3 days
- **Progress:** completed in `lane-a/a2-7-pos-refactor`. Refactored monolithic 2,543-line POS counter into modular subcomponents under `src/app/dashboard/sales/pos/_components/` (`SearchBar.tsx`, `CartTable.tsx`, `CustomerPicker.tsx`, `CompliancePanel.tsx`, `PaymentPanel.tsx`, `TotalsBar.tsx`, `SubstitutesModal.tsx`, `PromiseOrderModal.tsx`, `HeldBillsModal.tsx`), decoupled data layer with `PosDataSource` interface in `_data/posData.ts`, extracted state reducer into `_state/usePosCart.ts`, and implemented keyboard shortcut coordinator `_state/usePosShortcuts.ts` with strict dual ergonomics (100% Marg ERP keyboard accelerators + 100% mouse-driven visual controls). Added counter Loyalty Points redemption: surfaces customer redeemable points (`LoyaltyService.getRedeemable`), enables entering points to redeem in payment panel with rupee discount preview, enforces row-level locking (`SELECT ... FOR UPDATE`), updates customer balance, creates immutable `redeem` loyalty transaction, and deducts loyalty discount from bill total with balanced General Ledger entries. Every modular file is strictly under 300 lines, and `page.tsx` is reduced to 250 lines. Verified by integration tests.
- **Why:** `src/app/dashboard/sales/pos/page.tsx` is 1,427 lines with about 40 `useState`s. Offline mode (Phase 4) needs a clean data layer.
- **Files:** ➕ `src/app/dashboard/sales/pos/_components/` (`SearchBar.tsx`, `CartTable.tsx`, `CustomerPicker.tsx`, `CompliancePanel.tsx`, `PaymentPanel.tsx`, `SubstitutesModal.tsx`, `PromiseOrderModal.tsx`, `TotalsBar.tsx`), ➕ `_state/usePosCart.ts` (`useReducer`: `ADD_LINE`, `SET_QTY`, `SET_DISCOUNT`, `REMOVE`, `SET_CUSTOMER`, `SET_PAYMENTS`, `RESET`), ➕ `_state/usePosShortcuts.ts`, ➕ `_data/posData.ts` (an interface `PosDataSource { search(q), substitutes(generic), customers(q) }` with an online implementation calling server actions; Phase 4 adds an offline one), ✏️ `page.tsx` (≤ 150 lines: layout plus composition).
- **Loyalty:** the customer picker shows the points balance (🤝 B2.5 `getRedeemablePoints`). The payment panel gets a "Redeem points" field and the server validates it.
- **Done when:** behaviour is unchanged, the E2E smoke (A2.8) passes, and every file is under 300 lines.

#### [x] A2.8 🧪 Playwright E2E smoke ⏱ 1 day
- **Progress:** completed in `lane-a/a2-8-playwright-e2e`. Implemented end-to-end browser automation test suite using `@playwright/test` running against a real Next.js production build (`npm run build && npm run start`) connected to a dedicated PostgreSQL test database. Configured `playwright.config.ts` with Next.js 16 App Router lifecycle, timeout, sequential worker execution for DB predictability, and artifact reporting. Created deterministic reset & seed harness `scripts/seed-e2e.ts` with strict database safety guard (refusing non-local or non-test databases) that initializes schema, migrations, system roles, store, admin & cashier credentials, active cash register shift, stocked batches, and customer. Implemented `tests/e2e/pos.spec.ts` covering authentication login, POS counter 2-item billing, split-tender settlement (Cash + UPI) with statutory round-off, sequential invoice numbering (`INV/...`), and full database persistence verification across page reloads. Tested dual ergonomics keyboard accelerators (`F8` split modal, `Esc` dismiss). Added dedicated `e2e` CI job in `.github/workflows/ci.yml` running with PostgreSQL 16 container and Chromium browser installation.
- **Files:** ➕ `playwright.config.ts` (webServer: `npm run build && npm run start` with the test DB), ➕ `tests/e2e/pos.spec.ts` (login → POS → bill 2 items with split payment → invoice page totals), ✏️ `ci.yml` (a separate job `e2e` on PRs to main; install browsers with `npx playwright install --with-deps chromium`). Read `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md`.

#### [x] A2.9 🤝 Receipts & payments vouchers (accounting API) ⏱ 2 days
- **Progress:** completed in `lane-a/a2-9-accounting-vouchers`. Implemented authoritative accounting voucher domain service in `src/server/domain/payments.ts` (`postPayment`, `getPaymentAllocations`, `getBillAllocations`, `listRecentPayments`). Created `payment_allocations` table in `src/server/db/schema/accounting.ts` with strict foreign key (`onDelete: "restrict"`), tenant-aware indexes `(tenant_id, payment_id)` and `(tenant_id, ref_type, ref_id)`, and generated migration `0011_first_king_cobra.sql`. Implemented deterministic deadlock-free locking order (`sort((a,b) => a.refId.localeCompare(b.refId))`) with `SELECT ... FOR UPDATE` row locks across multiple bills. Generates balanced double-entry General Ledger journal entries (Dr Cash/Bank, Cr Accounts Receivable for receipts; Dr Accounts Payable, Cr Cash/Bank for supplier payments; Dr Expense Account, Cr Cash/Bank for direct expenses). Accurately updates `sales.paid_amount`, `sales.credit_amount`, and `purchases.paid_amount`. Handles party advances/credits cleanly when `amount > sum(allocations)` without dummy allocation records. Refactored `recordSupplierPayment` in `src/server/domain/suppliers.ts` to delegate directly to `postPayment`. Added server actions in `src/app/actions/payments.ts` and enhanced Receipts UI in `src/app/dashboard/accounting/receipts/ReceiptsClient.tsx` showing bill balances and customer balances after receipt. Verified with comprehensive integration tests in `tests/integration/payments.test.ts`.
- **Why:** Lane B needs supplier payments (B2.4). Bank reconciliation needs `payments` rows. Customer credit needs receipts.
- **Files:** ➕ `src/server/domain/payments.ts`:
  ```ts
  export async function postPayment(tx: Tx, ctx: AuthCtx, p: {
    direction: "in" | "out"; partyType: "customer" | "supplier" | "expense"; partyId?: string; expenseAccountId?: string;
    method: "cash" | "upi" | "card" | "bank"; amount: number; reference?: string; paymentDate: string; note?: string;
    allocations?: { refType: "sale" | "purchase"; refId: string; amount: number }[];   // bill-wise settlement
  }): Promise<{ paymentId: string; paymentNo: string }>
  ```
  It creates the `payments` row (number via `nextDocNumber(…, "payment_in" | "payment_out")`), a journal (Dr Cash/Bank, Cr Customer for receipts; Dr Supplier, Cr Cash/Bank for payments), and updates `sales.paid_amount`/`credit_amount` or `purchases.paid_amount` for allocations. ➕ `payment_allocations` table in `schema/accounting.ts`.
  ➕ `src/app/dashboard/accounting/receipts/page.tsx` (receive from customer, pick outstanding bills). Lane B builds the supplier-payment UI on top of this (B2.4).
- **Done when:** receiving ₹500 against a credit bill reduces the customer's outstanding and the bill's `credit_amount` 🧪.

#### [x] A2.10 🤝 Pharmacy unit conversion engine (Strip & loose tablet cutting) ⏱ 1.5 days
- **Progress:** completed in `lane-a/a2-10-unit-conversion`. Added `unitsPerPack`, `packUnit`, and `looseUnit` configuration and validation to catalog master data action `createMedicine` and `src/app/dashboard/inventory/new/page.tsx` with dynamic visual conversion helper (`1 Strip = 10 Tablets`). Refactored POS `CartTable.tsx` and `usePosCart.ts` to enforce single authoritative calculation source of truth via pure `computeSaleLine` with instant quantity normalization ($0 \le \text{looseQty} < \text{unitsPerPack}$) and keyboard navigation. Enhanced invoice presentation across 80mm thermal slip (`formatItemQuantityCompact`), A4 GST tax invoice (`formatItemQuantity`), and invoice details page (`/dashboard/sales/[id]`) showing explicit unit breakdowns (e.g. `3 Tablets @ ₹10.00` or `1 Strip + 4 Tablets`), effective unit rates, and pack conversion formulas. Safeguarded sale returns in `return-sale.ts` with immutable snapshot preservation and cumulative proportional rounding to eliminate rounding drift across repeated partial returns. Verified with 10 unit tests in `tests/unit/unit-conversion.test.ts`, integration tests in `tests/integration/medicine-packaging.test.ts`, `tests/integration/create-sale.test.ts`, and `tests/integration/return-sale.test.ts`.
- **Why:** In Indian retail pharmacies, customers routinely purchase loose tablets or partial strips (e.g., 3 tablets from a 10-tablet strip). Selling only full strips is a blocker for any chemist migrating from Marg.
- **Files:** ✏️ `schema/catalog.ts` (numeric `units_per_pack`, `loose_unit`, `pack_unit`), ✏️ `src/server/domain/sales/create-sale.ts`, ✏️ `src/app/dashboard/sales/pos/*` (loose quantity input).
- **How:**
  - `medicines` maintains an integer conversion factor (`units_per_pack: integer`, e.g. 10 or 15).
  - The POS input accepts either full packs or loose units (e.g. `1 pack + 3 loose` or `1.3`).
  - Pricing is proportional: $\text{unit\_price} = \text{pack\_rate} / \text{units\_per\_pack}$.
  - Stock movements and batch `qty_on_hand` are tracked in base units (tablets) or normalized units without floating point loss.
- **Done when:** selling 3 loose tablets from a ₹100 10-tablet strip bills ₹30, deducts exactly 3 units from batch stock, and prints clearly on the invoice 🧪.

#### A2.11 🤝 Auto-FEFO batch allocation ⏱ 1 day
- **Why:** Chemists must liquidate older stock first to prevent expiry losses. Manually picking batches at the counter causes human error.
- **Files:** ✏️ `src/server/domain/sales/create-sale.ts`, ✏️ `src/app/dashboard/sales/pos/page.tsx`.
- **How:**
  - When a medicine is added to the cart, the system automatically allocates the batch with the earliest valid expiry date (`expiry_date > today`) with available stock.
  - If the nearest-expiry batch has insufficient stock, it splits across the next FEFO batch.
  - Manual batch override requires explicit selection and logs an audit trail if an older batch was skipped.
- **Done when:** adding an item auto-picks the earliest expiry batch by default without manual clicks 🧪.

#### A2.12 ⌨️ Marg ERP keyboard parity & counter ergonomics ⏱ 1 day
- **Why:** Pharmacy cashiers accustomed to Marg ERP 9+ and Marg Books expect rapid, 100% keyboard-only counter operations without touching the mouse.
- **Files:** ✏️ `src/app/dashboard/sales/pos/page.tsx`, ✏️ `src/app/components/CommandPalette.tsx`, ✏️ `USER_MANUAL.md`.
- **How:**
  - `Ctrl + F1` (or `?`): Show in-counter keyboard shortcut cheat sheet popup.
  - Cart row keyboard navigation: `Delete` key deletes active/selected line item; `+` / `-` keys increment/decrement pack or loose quantity.
  - Global ERP navigation hotkeys: `Alt + N` (New Sale Counter), `Alt + P` (New Purchase Bill), `Alt + M` (Sales Register / Modify Bill), `Alt + I` (Item / Batch Stock lookup), `Alt + L` (Ledgers / Customers).
  - Floating counter calculator (`Alt + F12` or `Ctrl + K calc`).
- **Done when:** a cashier can navigate from any screen to sale counter, add items, adjust quantities, hold/resume, and complete checkout without touching the mouse 🧪.

### Lane B · Phase 2

#### B2.1 ⛔ 🤝 Outbox worker & cron endpoint ⏱ 2 days
- **Why:** WhatsApp, SMS, e-invoice and reminders must run **after** the DB commit, retry on failure, and never block the POS (audit C8). The `outbox_events` table already exists.
- **Files:** ➕ `src/server/jobs/outbox.ts`, ➕ `src/server/jobs/handlers/index.ts` (registry), ➕ `handlers/whatsapp-receipt.ts`, ➕ `handlers/reminder-send.ts`, ➕ `handlers/gst-doc-retry.ts`, ➕ `src/app/api/cron/outbox/route.ts`, ➕ `src/app/api/cron/reminders/route.ts`, ✏️ `src/env.ts` (`CRON_SECRET`).
- **How:**
  ```ts
  // contract (merge first):
  export type OutboxType = "whatsapp.receipt" | "sms.send" | "reminder.send" | "gst.doc_retry" | "einvoice.generate";
  export async function enqueue(tx: DbOrTx, tenantId: string, type: OutboxType, payload: Record<string, unknown>) {
    await tx.insert(schema.outboxEvents).values({ tenantId, type, payload });
  }
  // worker:
  export async function processOutbox(limit = 25) {
    return db.transaction(async (tx) => {
      const rows = await tx.execute(sql`
        SELECT * FROM outbox_events WHERE status = 'pending' AND attempts < 8
        ORDER BY id LIMIT ${limit} FOR UPDATE SKIP LOCKED`);          // safe with several workers
      for (const ev of rows.rows) {
        try { await handlers[ev.type](ev); /* status done, processed_at */ }
        catch (e) { /* attempts+1, last_error, status stays pending (or failed at max) */ }
      }
    });
  }
  ```
  Exponential backoff: add `next_attempt_at` to `outbox_events` (migration) and filter on it. The cron route checks `Authorization: Bearer ${env.CRON_SECRET}` and calls `processOutbox`. Scheduling: Vercel Cron, a system cron with `curl`, or GitHub Actions `schedule` (decided in A6.3).
  🤝 Lane A replaces the synchronous `sendWhatsAppReceipt` with `enqueue(tx, …, "whatsapp.receipt", { saleId })` in A2.1. Use a real receipt URL from B5.4; until then send without a link.
- **Done when:** a sale with the WhatsApp provider down still completes instantly, and the receipt is sent on the next cron run after the provider recovers 🧪.

#### B2.2 Purchase orders ⏱ 3 days
- **Files:** ➕ `src/server/domain/purchasing/purchase-orders.ts` (`createPO`, `approvePO`, `markSent`, `cancelPO`, `receiveAgainstPO`), ➕ `src/app/actions/purchase-orders.ts` (`purchase.create`, `purchase.approve`), ➕ `src/app/dashboard/purchases/orders/page.tsx` (list + status filter), `new/page.tsx`, `[id]/page.tsx`, `[id]/print/page.tsx`, ✏️ `nav/purchasing.ts`.
- **How:** PO number from `nextDocNumber(…, "purchase_order", "PO")`. Status flow: draft → approved (needs `purchase.approve` if the total is over a store threshold) → sent (print/PDF, or WhatsApp via outbox) → partially received / received / cancelled. **GRN from PO:** "Receive" opens the existing new-purchase form pre-filled with PO lines. On save, set `purchases.purchase_order_id` and increment `purchase_order_items.received_qty`. Link promise orders: when a PO containing a promised medicine is received, set those promise orders to `fulfilled`-ready and notify (outbox `sms.send`).
- **Done when:** PO → partial GRN → second GRN → PO shows "received" 🧪.

#### B2.3 Purchase returns / debit notes (incl. expiry & breakage returns) ⏱ 2.5 days
- **Files:** ➕ `src/server/domain/purchasing/purchase-returns.ts`, ➕ actions (`purchase.return`), ➕ `src/app/dashboard/purchases/returns/{page,new/page,[id]/print/page}.tsx`, ➕ `src/app/dashboard/purchases/expiry-returns/page.tsx` (lists expired and near-expiry batches grouped by supplier → one-click return draft).
- **How:** return quantities are capped at what's still on hand in that batch. Stock movement `type: "purchase_return"`. Journal: Dr Supplier, Cr Purchases, Cr Input GST. The GST debit note document via 🤝 own function `createGstDocumentFromPurchaseReturn`. Number `DN/…`.

#### B2.4 Supplier ledger & payments UI ⏱ 2 days (after A2.9 contract)
- **Files:** ➕ `src/app/dashboard/suppliers/[id]/page.tsx` (profile, edit, ledger: purchases, returns and payments with running balance; outstanding bills with due dates from `credit_days`), ➕ `src/app/dashboard/suppliers/[id]/pay/page.tsx` (calls Lane A's `postPayment` with `direction: "out"` and allocations), ✏️ `src/app/actions/suppliers.ts` (`updateSupplier`, `getSupplierLedger`).
- **Done when:** paying a supplier against two bills marks them settled, and the bank reconciliation can match the payment.

#### B2.5 🤝 Loyalty redemption & reversal service ⏱ 1.5 days
- **Files:** ✏️ `src/server/domain/loyalty.ts`.
- **How:** make every method take `tx` and read config with `tx` (today `getConfig` uses the global `db`). Contract:
  ```ts
  static async getRedeemable(tx, tenantId, customerId): Promise<{ points: number; valuePaise: number }>
  static async redeemPoints(tx, { tenantId, customerId, points, saleId }): Promise<{ valuePaise: number }>   // throws if < min or > balance
  static async reverseForSale(tx, { tenantId, saleId, fraction }): Promise<void>  // cancel = 1, partial return = returned/total
  ```
  Use `SELECT … FOR UPDATE` on the customer row when changing `loyalty_points`. Replace `tx: any` (`loyalty.ts:22`) with `Tx`. Earned points are calculated on the amount actually paid, excluding the redeemed value.
- **Done when:** earn → redeem → return → balances are correct 🧪.

#### B2.6 🤝 GST documents for cancellations & returns ⏱ 1.5 days
- **Files:** ✏️ `src/server/domain/gst.ts`: add `cancelGstDocumentForSale(tx, saleId)` (sets the status to `cancelled`; GSTR-1 excludes it from tables but includes it in the document summary as cancelled) and `createGstDocumentFromReturn(tx, { returnId })` (`doc_type = 'credit_note'`, linked to the original invoice number and date for CDNR and CDNUR). Update `buildGstr1Data` to include credit notes. Tests: extend B1.3 🧪.

#### B2.7 Automated reminders via cron ⏱ 1 day
- **Files:** ✏️ `src/server/domain/reminders.ts` (`processDueReminders` enqueues `reminder.send` instead of sending directly), `src/app/api/cron/reminders/route.ts` (daily). Refill reminders are auto-created on sale for chronic medicines: a medicine flag `is_chronic` or the category, plus the days of supply from prescription `duration_days`. Respect the customer's opt-out (B5.6).

#### B2.8 🤝 Pharma purchase scheme engine (10+1 free, trade/cash discounts) ⏱ 2 days
- **Why:** In Indian pharma supply chains, distributors sell medicines with free goods (e.g. `10+1 free`, `10+2 free`, `100+15`) and layered Trade Discounts (TD%) and Cash Discounts (CD%). The true landed cost per unit must be calculated accurately across paid + free units.
- **Files:** ✏️ `schema/purchases.ts`: ➕ `free_qty`, `scheme_type`, `trade_discount_bp`, `cash_discount_bp`, ✏️ `src/server/domain/purchases.ts`, ✏️ `src/app/dashboard/purchases/new/page.tsx`.
- **How:**
  - Support `billedQty` and `freeQty` per line.
  - Total units received into batch = $\text{billedQty} + \text{freeQty}$.
  - Landed cost per unit = $(\text{taxableAmount} - \text{cashDiscount}) / (\text{billedQty} + \text{freeQty})$.
  - Accounting journal: Input GST is calculated on the taxable amount according to GST valuation rules.
- **Done when:** a purchase of 10 strips @ ₹100 + 1 free with 5% GST creates 11 strips in stock with landed cost ₹90.91 and balanced accounts 🧪.

**Phase 2 exit:** split-tender, hold, cancel and return all work end to end · shift close report · PO → GRN → return → supplier payment loop · messages go through the outbox · Playwright smoke in CI.

---

## Phase 3 · Multi-store chain (Weeks 11–14)

**Goal:** a 3-branch chain plus a warehouse runs on one tenant: switch branches, move stock, buy centrally, see consolidated numbers. Design: [docs/11-multi-store-design.md](docs/11-multi-store-design.md).

**Contracts:** 🤝 A3.4 transfer events → B3.4 `createGstDocumentFromTransfer` · 🤝 A3.3 `getStoreMedicineSettings` → B3.2 reorder engine.

### Lane A · Phase 3

#### A3.1 Store management ⏱ 2 days
- **Files:** ✏️ `schema/platform.ts`: ➕ `stores.kind` (`retail | warehouse`, default `retail`), ➕ `stores.settings jsonb` (`requireShift`, `maxDiscountBp`, `printFormat`, `defaultPaymentMethod`); migration. ➕ `src/server/domain/stores.ts` (`createStore`, `updateStore`, `deactivateStore`), ➕ `src/app/actions/stores.ts` (`store.manage`), ➕ `src/app/dashboard/settings/stores/{page,new/page,[id]/page}.tsx`.
- **Validation:** `code` is unique per tenant and ≤ 4 characters. The `invoicePrefix` length rule comes from A0.7. `stateCode` is a valid 2-digit GST state code, auto-derived from the GSTIN if one is given. The GSTIN is validated with Lane B's `isValidGstin`. The drug licence number is required for retail stores.
- On create: seed `doc_sequences` lazily (already lazy). Grant access to owners automatically (`allStores`).

#### A3.2 Store switcher ⏱ 1.5 days
- **Files:** ➕ `src/app/actions/session.ts` (`switchStore(storeId)`), ➕ `src/app/components/StoreSwitcher.tsx`, ✏️ `Topbar.tsx`, ✏️ `dashboard/layout.tsx` (pass the store list and current store), ✏️ `src/server/auth.ts` (`updateSessionStore(sessionId, storeId)`), ✏️ `memberships.last_store_id` (from A1.5).
- **How:** validate access (`allowedStoreIds`), update `sessions.store_id` and `memberships.last_store_id`, then `revalidatePath("/dashboard", "layout")`. The POS shows the branch name prominently, so cashiers don't bill in the wrong branch. Hotkey `Ctrl+Shift+S`.

#### [x] A3.3 🤝 Per-store medicine settings ⏱ 2 days
- **Progress:** completed in `lane-a/a3-3-store-medicine-settings`. Added `store_medicine_settings` table to `schema/catalog.ts` with composite PK `(store_id, medicine_id)`, tenant and rack indexes, check constraints, and sparse backfill migration (`0013_mysterious_wolfpack.sql`) linking legacy racks only to their owning store. Deprecated `medicines.rack_id` with `@deprecated` annotation. Implemented authoritative domain service in `src/server/domain/catalog/store-settings.ts` with bulk resolver `getStoreMedicineSettings` (contract for Lane B Task B3.2 reorder suggestions engine) providing pure fallback to catalog defaults without N+1 queries. Implemented `updateStoreMedicineSettings` enforcing active store ownership, cross-store rack rejection, and transactional audit logging (`store_medicine_settings_update`). Connected `assignMedicineToRack` and `deleteRack` actions, POS counter medicine search in `searchPosItems`, and created `BranchSettingsDialog` / `BranchSettingsButton` on `/dashboard/inventory` with branch price override indicators. Verified by unit and integration tests.
- **Why:** reorder levels, racks and sometimes prices differ per branch. `medicines.rack_id` is wrong for chains, because racks are per store.
- **Files:** ✏️ `schema/catalog.ts`: ➕ `store_medicine_settings (tenant_id, store_id, medicine_id, reorder_level, max_stock, rack_id, sale_price_override, PK(store_id, medicine_id))`; migration with a **backfill** (for each store, copy `medicines.reorder_level`, `max_stock`, and `rack_id` where the rack belongs to that store). ➕ `src/server/domain/catalog/store-settings.ts` (`getStoreMedicineSettings(tx, storeId, medicineIds)` falling back to the medicine defaults). ✏️ racks actions (`assignMedicineToRack` writes the store settings), POS search (rack from store settings), inventory pages.
- Keep `medicines.rack_id` for one release (deprecated comment), then drop it in Phase 6.

#### A3.4 🤝 Stock transfers ⏱ 4 days
- **Files:** ✏️ `schema/inventory.ts`: ➕ `stock_transfers`, `stock_transfer_items` (columns in docs/11); migration. ➕ `src/server/domain/transfers.ts`:
  ```ts
  createTransferDraft(tx, ctx, { toStoreId, lines: { batchId, qty }[] })
  dispatchTransfer(tx, ctx, transferId)     // transfer_out movements, number "TR/…", status dispatched; emits gst hook
  receiveTransfer(tx, ctx, transferId, received: { itemId, receivedQty }[])  // find/create dest batch, transfer_in
  cancelTransfer(tx, ctx, transferId, reason)
  ```
  ➕ `src/app/actions/transfers.ts` (`inventory.transfer`, `inventory.transfer_receive`), ➕ `src/app/dashboard/inventory/transfers/{page,new/page,[id]/page,[id]/print/page}.tsx`, ✏️ `nav/inventory.ts`.
- **Rules:**
  - Batch suggestions are FEFO. You can't transfer expired stock except to a warehouse (for supplier return).
  - The destination batch matches on `(store_id, medicine_id, batch_no)`, using the unique index `batches_store_med_batch_uq`. If it exists with a different expiry or MRP, **reject** and show an explanation.
  - **GST:** compare `from.gstin` and `to.gstin`. If they're equal, `doc_kind = delivery_challan`. If they differ, `doc_kind = tax_invoice`, and call 🤝 B3.4 `createGstDocumentFromTransfer(tx, transferId)` at dispatch; the destination also books it as a purchase for ITC. If the value is over ₹50,000, set the flag "e-way bill required" (B5.2 generates it).
  - The receiving store sees an "Incoming transfers" badge (notification on dispatch).
- **Done when:** warehouse → branch transfer with partial receipt keeps both stores' stock and the in-transit report correct 🧪.

#### A3.5 Warehouse mode ⏱ 1 day
- POS (`/dashboard/sales/pos`) refuses when `store.kind === 'warehouse'` with a friendly message. The sidebar hides POS and sales for warehouse sessions. Purchases and transfers work. Stock reports at warehouse level work.

#### A3.6 Physical stock count (stretch) ⏱ 2 days
- ➕ `stock_counts`, `stock_count_items` (expected vs counted per batch). Count sheet by rack. Posting writes `adjustment` movements with reason "stock count CNT/…" and an audit row.

### Lane B · Phase 3

#### B3.1 Chain-wide reports ⏱ 3 days
- **Files:** ✏️ `src/server/domain/reports.ts` (every generator takes `storeIds: string[] | "all"` instead of reading `session.storeId`), ✏️ `src/app/actions/reports.ts`, ✏️ `src/app/components/ReportShell.tsx` (➕ store multi-select, shown only with `report.all_stores`), ➕ `src/app/dashboard/reports/chain/page.tsx` (owner dashboard: sales, gross margin, stock value at cost, near-expiry value, low-stock count per store; trend chart).
- Follow the **dataviz guidance** for charts (consistent palette, accessible).
- **Done when:** the owner sees all branches and a branch manager sees only theirs.

#### B3.2 Reorder suggestions engine ⏱ 3 days
- **Files:** ➕ `src/server/domain/purchasing/reorder.ts`, ➕ `src/app/dashboard/purchases/reorder/page.tsx`.
- **How:**
  ```
  for each (store, medicine):
    onHand        = Σ batches.qty_on_hand (non-expired, status active)
    inTransit     = Σ dispatched transfer items to this store
    onOrder       = Σ open PO items (qty - received_qty)
    avgDaily      = Σ sale qty last 30 days / 30
    leadTime      = supplier.lead_time_days (preferred supplier = last purchased from)
    reorderLevel  = store_medicine_settings.reorder_level   (🤝 A3.3)
    suggested     = max(0, ceil(avgDaily × (leadTime + 7)) + reorderLevel − onHand − inTransit − onOrder)
  ```
  The UI groups suggestions by supplier: select → "Create PO" (B2.2) or "Request from warehouse" (creates a transfer draft via Lane A's `createTransferDraft`). Respect `max_stock`.

#### B3.3 Central purchasing ⏱ 2 days
- PO for a warehouse with a "distribution plan" (quantity per branch) → after GRN, a one-click "Create transfers" per branch (Lane A API). Or a split PO: one screen creates N POs, one per branch, same supplier.

#### B3.4 🤝 Per-GSTIN GST and transfer invoices ⏱ 2.5 days
- **Files:** ✏️ `src/server/domain/gst.ts` (`createGstDocumentFromTransfer`; GSTR-1 and 2 builders take `gstin` and aggregate every store with that GSTIN), ✏️ `src/app/dashboard/gst/GstPeriodSelector.tsx` (➕ GSTIN picker), ✏️ GST pages.
- **Done when:** a chain with stores in two states produces two separate, correct GSTR-1 files, and the inter-GSTIN transfer appears as a B2B supply in one and as inward supply in the other.

#### B3.5 Expiry redistribution suggestions ⏱ 1.5 days
- ➕ `src/app/dashboard/reports/expiry-redistribution/page.tsx`: batches expiring in 30–120 days at store X, where another store Y sells that medicine faster, with a suggested quantity. "Create transfer" button (Lane A API). This is a strong owner-facing feature.

#### B3.6 🤝 Expiry claim & quarantine dump stock lifecycle ⏱ 2 days
- **Why:** Pharmacies must isolate expired/broken medicines so they cannot be sold, and generate formal debit claims against the supplying distributor.
- **Files:** ✏️ `schema/inventory.ts`: ➕ `quarantine_batches`, ➕ `expiry_claims`, ✏️ `src/server/domain/inventory/expiry-claims.ts`, ➕ `src/app/dashboard/inventory/quarantine/page.tsx`.
- **How:**
  - One-click transfer of expired batches into a non-saleable quarantine status (`status: "quarantined"`).
  - Supplier-wise claim generation: group quarantined stock by supplier, generate Debit Notes (`DN/EXP/…`), update accounts payable ledger (Dr Supplier, Cr Purchase Returns).
  - Settle claims: record whether the distributor issued a credit note (reducing payable balance) or replacement stock.
- **Done when:** expired batch is quarantined, cannot be billed in POS, and a supplier debit note is generated and tracked 🧪.

#### B3.7 🤝 Physical stocktake & rack audit sessions ⏱ 2 days
- **Why:** Discrepancies between system stock and physical shelf stock are a major pain point. Pharmacies perform weekly/monthly rack audits.
- **Files:** ➕ `src/server/domain/inventory/stocktake.ts`, ➕ `src/app/dashboard/inventory/stocktake/{page,new/page,[id]/page}.tsx`.
- **How:**
  - Create audit session: full store or selected racks (e.g. `Rack A-1` to `Rack A-5`).
  - Blind count mode (staff enters physical count without seeing system numbers to prevent bias).
  - Discrepancy report: calculates variance (shortage/excess), potential financial impact at cost and MRP.
  - Owner approval: creates immutable `stock_movements` (type `audit_adjustment`) and balanced accounting entries (Loss on inventory shortage).
- **Done when:** physical count variance produces an audited stock movement and balanced ledger adjustment on sign-off 🧪.

**Phase 3 exit:** the demo chain (warehouse + 3 branches, 2 GSTINs) runs a full week of scripted operations, and the consolidated numbers reconcile with per-store numbers.

---

## Phase 4 · Offline POS & onboarding import (Weeks 15–18)

**Goal:** billing survives internet loss (design: [docs/10](docs/10-offline-pos-design.md), [ADR 0003](docs/adr/0003-offline-pos-custom-sync.md)), and new customers can bring their Marg data (design: [docs/12](docs/12-data-migration.md)).

**First:** accept ADR 0003 (change its status in a PR), or write a superseding ADR.

### Lane A · Phase 4

#### A4.1 Devices & device auth ⏱ 2 days
- **Files:** ✏️ `schema/platform.ts`: ➕ `devices (id, tenant_id, store_id, code char(2), name, token_hash, last_seen_at, revoked_at, created_by, created_at)`, unique on `(store_id, code)`; migration. ➕ `src/server/domain/devices.ts` (`registerDevice` → returns a one-time token; `revokeDevice`; `authenticateDevice(req)` → `{ tenantId, storeId, deviceId, code }`). ➕ `src/app/dashboard/settings/devices/page.tsx` (`settings.manage`).

#### A4.2 Sync-ready schema ⏱ 1 day
- ✏️ Add `updated_at` to `batches`, `customers`, `doctors`, `schemes`, `store_medicine_settings`. Add a Postgres trigger `set_updated_at()` in the migration so every UPDATE bumps it, including updates made by `recordStockMovement`. Add indexes `(store_id, updated_at)` / `(tenant_id, updated_at)`.

#### A4.3 Sync API ⏱ 3 days
- **Files:**
  - ➕ `src/app/api/sync/pull/route.ts`: `GET ?since=&cursor=`. Paged (5,000 rows), gzip. Returns medicines (tenant), batches (store, non-expired), customers (tenant, active), doctors, active schemes, store settings, and `serverTime`.
  - ➕ `src/app/api/sync/sales/route.ts`: `POST { sales: OfflineSale[] }` (max 50 per request). Per sale, in its own transaction: idempotency key insert → `createSale(tx, deviceCtx, input, { source: "offline", allowNegativeStock: true, invoiceNo })` (A2.1) → store the response. Returns per-sale `{ clientSaleId, status: "created"|"duplicate"|"rejected", saleId?, error? }`.
  - ➕ `src/app/api/sync/reserve-numbers/route.ts`: `POST { count }` atomically advances the device's sequence (`doc_type = "sale:dev<code>"`) by `count` and returns the range.
  - ✏️ `src/server/domain/stock.ts`: `allowNegative?: boolean`. When the resulting balance is negative, allow it and enqueue/insert a `notifications` row `stock_conflict`.
  - ✏️ `src/server/domain/sequence.ts`: `formatInvoiceNo({ storeCode, deviceCode, fiscalYear, seq })` validated to ≤ 16 characters (docs/10 §1).
  - ✏️ `src/proxy.ts`: treat `/api/sync` as self-authenticating (bearer device token).
- **Device ctx:** `authenticateDevice` builds an `AuthCtx`-like object. The cashier who billed offline is recorded via `createdBy` from the payload, checked to be a member allowed in this store.

#### A4.4 Browser offline DB & sync engine ⏱ 4 days
- **Files:** `npm i dexie` 🔀 (tiny separate PR). ➕ `src/offline/db.ts`:
  ```ts
  import Dexie, { type Table } from "dexie";
  export class PosDB extends Dexie {
    medicines!: Table<OfflineMedicine, string>;
    batches!: Table<OfflineBatch, string>;          // indexes: medicineId, expiryDate
    customers!: Table<OfflineCustomer, string>;     // index: phone
    pendingSales!: Table<PendingSale, string>;      // clientSaleId; status: pending|syncing|synced|rejected
    numberBlocks!: Table<{ id: string; next: number; end: number; fy: string }, string>;
    meta!: Table<{ key: string; value: unknown }, string>;   // cursor, deviceToken, storeId
    constructor() { super("mediflow-pos"); this.version(1).stores({
      medicines: "id, name, genericName, barcode", batches: "id, medicineId, expiryDate",
      customers: "id, phone, name", pendingSales: "clientSaleId, status, createdAt",
      numberBlocks: "id", meta: "key" }); }
  }
  ```
  ➕ `src/offline/sync.ts` (pull loop every 60 s while online; push pending on the `online` event and every 15 s; exponential backoff; Web Locks API so only one tab syncs), ➕ `src/offline/invoice-series.ts` (take the next number from the local block; reserve more when fewer than 50 remain), ➕ `src/offline/search.ts` (local search: name/generic prefix and substring over IndexedDB; barcode exact), ➕ `src/offline/offline-sale.ts` (computes totals with the **same** `src/lib/money.ts` functions, decrements the local batch quantity, prints).
  Client-side tax uses the same `computeSaleTotals`. The server recomputes on sync and **flags** differences over ₹1 instead of rejecting.

#### A4.5 PWA shell ⏱ 2 days
- **Files:** ➕ `src/app/manifest.ts` (name, icons, `start_url: "/dashboard/sales/pos"`, `display: "standalone"`), ➕ `public/icons/icon-192.png`, `icon-512.png`, ➕ `public/sw.js` (precache the POS shell and static assets on install; network-first for navigations with cache fallback for the POS route; no caching of `/api/*`), ➕ `src/app/dashboard/sales/pos/_offline/RegisterSW.tsx` (registers `/sw.js` in production only). Read `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` and the `headers` config for `sw.js` (`Cache-Control: no-cache`, `Service-Worker-Allowed`).

#### A4.6 POS offline mode ⏱ 3 days
- ✏️ POS components use `PosDataSource` (A2.7) with an `OfflinePosDataSource` when `!navigator.onLine` or a request fails. ➕ The status chip "Online · synced 2 min ago" / "Offline · 7 bills pending". Disabled offline: returns, credit beyond the known limit, loyalty redemption. ➕ A "Pending bills" drawer with retry and export JSON.

#### A4.7 Conflict handling UI ⏱ 1 day
- ➕ `src/app/dashboard/inventory/conflicts/page.tsx`: lists `stock_conflict` notifications with actions (adjust, transfer, change batch).

#### A4.8 🧪 Offline E2E ⏱ 1 day
- ➕ `tests/e2e/offline.spec.ts`, scenario in docs/10 "Test plan".

#### A4.9 🤝 Desktop POS App (Tauri, SQLite & Hardware Print Bridge) ⏱ 3 days
- **Why:** Chrome browser popups block fast counter billing. Chemists with dot-matrix printers (Epson LX-300) and thermal printers require direct, silent raw printing and zero-latency local SQLite billing.
- **Files:** ➕ `desktop/` (Tauri 2.x shell wrapping the React POS), ➕ `src/desktop/hardware-bridge.ts`, ➕ `src/desktop/print-service.ts`.
- **How:**
  - Tauri native wrapper for Windows and Linux.
  - Local durable storage in SQLite (WAL mode) synced with the backend via `/api/sync/*`.
  - Native print manager with direct ESC/POS (thermal) and Epson ESC/P (dot-matrix 80-col) printer commands.
  - Direct USB barcode scanner input and automatic cash drawer kick.
- **Done when:** bills print silently to an 80-col dot-matrix printer or thermal printer in under 1 second without browser print preview dialogs 🧪.

### Lane B · Phase 4

#### [x] B4.1 Import data model & domain ⏱ 2 days
- **Files:** ➕ `src/server/db/schema/import.ts` (`import_jobs`, `import_job_rows`; docs/12) + `index.ts` line 🔀; migration. ➕ `src/server/domain/import/index.ts` (`createJob`, `addRows(jobId, rows[])`, `validateJob`, `commitJob`).

#### [x] B4.2 Presets & normalisers ⏱ 3 days (needs B0.8 samples)
- **Files:** ➕ `src/server/domain/import/normalize.ts` (dates `DD/MM/YYYY`, `MM/YY` → end of month; money "₹1,234.50" → paise; GST "12%" → 1200 with the GST 2.0 conversion offer; phone → 10 digits; GSTIN uppercase and validation; schedule text "H1", "Sch H" → enum), ➕ `match.ts` (medicine matching: barcode → normalised name + pack + manufacturer, with trigram `similarity()` > 0.6 as a "possible match"), ➕ `presets/marg.ts`, `presets/gofrugal.ts`, `presets/generic.ts` (header synonym maps built **from the real samples**), ➕ `tests/unit/import-normalize.test.ts`, ➕ `tests/fixtures/marg-items.synthetic.csv` (synthetic data only, no real customer data).

#### [x] B4.3 Import wizard UI ⏱ 3 days
- **Files:** ➕ `src/app/dashboard/import/page.tsx` (job list, "New import"), ➕ `ImportWizard.tsx` (steps: entity → upload → map → validate → commit), ➕ `MappingStep.tsx` (auto-mapped from the preset; dropdown per column), ➕ `ReviewStep.tsx` (error rows with inline fix or skip; ambiguous matches as "create new / match"), ➕ `src/app/dashboard/import/[jobId]/page.tsx` (progress, report, download error CSV). Parse CSV in the browser with PapaParse; for XLSX use ExcelJS (🔀 separate dependency PR; check the licence and advisories). Send 1,000-row chunks to `addRows`.
- Permission: `settings.manage`.

#### [x] B4.4 Commit + opening balances ⏱ 2 days (🤝 Lane A)
- Opening stock → `recordStockMovement(type: "opening")`, creating batches. Opening balances of customers and suppliers → 🤝 Lane A provides `postOpeningBalance(tx, ctx, { partyType, partyId, amount, asOf })` in `src/server/domain/accounting.ts` (A writes it in week 15; it's small). Commit runs in 500-row transactions and updates the job totals. Re-runs are idempotent through `external_ref`.

#### B4.5 🧪 Import integration tests ⏱ 1 day
- A synthetic 2,000-item file plus 3,000 batches imports in under 2 minutes locally. A re-run creates nothing new. The stock ledger and trial balance are consistent afterwards.

#### B4.6 🤝 Distributor electronic bill import (Pharmarack, Retailio, Marg CSV) ⏱ 2 days
- **Why:** Distributors supply retail pharmacies with electronic invoices (CSV/EDI). Typing 50 lines manually wastes hours daily and introduces batch/expiry typos.
- **Files:** ➕ `src/server/domain/import/presets/pharmarack.ts`, `presets/retailio.ts`, ✏️ `src/app/dashboard/purchases/new/page.tsx` ("Import distributor bill" button).
- **How:**
  - Parse distributor invoice lines: Product, Batch, Expiry, Pack, Billed Qty, Free Qty, PTR, MRP, Scheme, GST %, HSN.
  - Automatic medicine match against catalog (barcode first, then name + pack + manufacturer). Unmatched items allow one-click master creation.
  - Automatically populates the New Purchase GRN form with verified quantities and schemes.
- **Done when:** a 40-item Pharmarack CSV imports into a draft purchase bill in 3 seconds with zero manual typing 🧪.

**Phase 4 exit:** a 2-hour offline drill (unplug the router, bill 30 sales from 2 devices, reconnect) gives zero lost bills and unique numbers · a Marg sample from a real shop imports end to end.

---

## Phase 5 · Finance completeness & real integrations (Weeks 19–22)

**Goal:** an accountant can close a month in MediFlow, and the integrations stop being simulators.

### Lane A · Phase 5

#### A5.1 Expenses ⏱ 1.5 days
- ➕ `src/app/dashboard/accounting/expenses/{page,new/page}.tsx` using `postPayment({ direction: "out", partyType: "expense", expenseAccountId })`. Expense categories are accounts of type `expense` (seeded: Rent, Salary, Electricity, Transport, Misc), and the user can add more.

#### A5.2 Day book & account ledgers ⏱ 2 days
- ➕ `src/app/dashboard/accounting/day-book/page.tsx` (all journal entries for a date, drill-down to the source document). ➕ `src/app/dashboard/accounting/ledger/[accountId]/page.tsx` (running balance; party filter for customer and supplier sub-ledgers). Export via `report.export`.

#### A5.3 Credit control & receivables ageing ⏱ 2 days
- Enforce `customers.credit_limit` in `createSale`, with an override requiring `customer.credit` + `sale.discount_override`-style manager approval. Family groups (`customer_groups.credit_limit`) are pooled limits; 🤝 Lane B's `FamilyLedgerService` exposes `getGroupOutstanding`. ➕ `src/app/dashboard/accounting/receivables/page.tsx` (0–30 / 31–60 / 61–90 / 90+ days ageing) with a "Send payment reminder" action (Lane B outbox `whatsapp.payment_reminder`).

#### A5.4 Period lock ⏱ 1.5 days
- ✏️ `schema/accounting.ts`: ➕ `accounting_periods (tenant_id, gstin?, period 'YYYY-MM', locked_at, locked_by)`. Every domain function that posts with a date checks `assertPeriodOpen(tx, ctx, date)`. Locking a month needs `accounting.post` + an owner role. Reason: after GST filing, nothing may change that month's figures.

#### A5.5 Opening balances & accounting tests ⏱ 1.5 days
- `postOpeningBalance` (from B4.4) plus a UI for manual entry. 🧪 Invariant tests: every entry balances; after a random sequence of 200 operations (sales, returns, purchases, payments, transfers) the trial balance is zero and stock value per the ledger equals Σ batch quantity × cost.

#### A5.6 Year-end ⏱ 1.5 days
- Fiscal-year rollover checks: sequences reset on 1 April (already keyed by FY; test it). A closing-stock valuation report as of 31 March (FIFO/landed cost from batches) for the CA. Reset of the near-expiry and returns cycle is unaffected.

#### A5.7 🤝 Mobile Management App (React Native / Expo) ⏱ 3 days
- **Why:** Pharmacy owners are on the move. They require mobile real-time sales visibility, low stock alerts, remote credit approvals, and delivery fulfillment.
- **Files:** ➕ `mobile/` (React Native / Expo project), ➕ `src/app/api/v1/mobile/*` (lightweight authenticated REST endpoints for owner dashboard & approvals).
- **How:**
  - Owner Dashboard: live counter sales across all chain branches, today's gross margin, cash vs digital collections.
  - Multi-Branch Stock Lookup: instant barcode search showing batch-level inventory at each store.
  - Remote Approvals: push notification for customer credit overrides or purchase orders exceeding limits.
  - Doorstep Delivery: delivery boy marks prescription delivered, collects payment via UPI dynamic QR.
- **Done when:** owner can view live multi-branch sales on mobile and approve a credit override remotely 🧪.

### Lane B · Phase 5

#### B5.1 Real e-invoicing via a GSP (sandbox first) ⏱ 4 days
- **Decision needed (open question Q2):** choose a GSP or ASP vendor (pricing, sandbox access, API quality).
- **Files:** ✏️ `src/server/domain/e-invoice.ts`: an `IRPProvider` interface already exists. ➕ `src/server/domain/einvoice-providers/<vendor>.ts` (auth token caching, `generateIRN`, `cancelIRN` within 24 h, `getIRNDetails`). Credentials per tenant are encrypted (B0.4). ✏️ `env.ts` `EINVOICE_MODE=sandbox|production`. The print page shows the **real signed QR** and IRN for B2B invoices. Generation runs via outbox `einvoice.generate` after the sale for B2B customers when the tenant's AATO is over ₹5 Cr (tenant setting). Enforce the 30-day window for AATO ≥ ₹10 Cr.
- **Done when:** the sandbox returns a valid IRN and the QR decodes to the signed JWT.

#### B5.2 E-way bill ⏱ 2 days
- For transfers between GSTINs and B2B deliveries over ₹50,000. Vehicle number and distance input. Store the result on `gst_documents.e_way_bill_*`.

#### B5.3 GSTR-2B / IMS import & purchase reconciliation ⏱ 3 days
- ➕ `src/app/dashboard/gst/gstr2b/page.tsx`: upload the GSTR-2B JSON downloaded from the portal → parse → match against `purchases` by supplier GSTIN + invoice number + date + taxable amount (with tolerance) → statuses matched / mismatch / missing in books / missing in 2B → export an action list for the IMS accept or reject on the portal. Store imports in `gst_2b_imports`, `gst_2b_lines`. Re-verify the current IMS rules (docs/05) before building.

#### B5.4 WhatsApp production + public receipt link ⏱ 2.5 days
- ➕ `src/app/r/[token]/page.tsx`: a **public** read-only receipt page using a signed, unguessable token (`receipt_tokens` table or an HMAC of the sale id with expiry). It shows only the invoice data, no other customer data. Meta template registration flow for `invoice_receipt`, `refill_reminder` and `payment_reminder`. Handle delivery-status webhooks (`sent`, `delivered`, `read`, `failed` → `whatsapp_messages.status`). Respect the 24-hour session window.

#### B5.5 SMS DLT compliance ⏱ 1 day
- ✏️ `schema/comms.ts`: ➕ `sms_templates (tenant_id, name, body, dlt_template_id, sender_id, category)`. Providers send the DLT template id. Block sends whose template isn't registered.

#### B5.6 DPDP consent & data-subject tools ⏱ 2.5 days
- ✏️ `schema/crm.ts`: ➕ `customer_consents (customer_id, purpose 'transactional'|'marketing'|'reminders', granted bool, source, captured_by, captured_at)`. Consent capture on customer creation at the POS (one tap) and on the first WhatsApp message. Marketing and reminders require consent; transactional receipts follow the pharmacy's notice. ➕ `src/app/dashboard/customers/[id]/privacy/page.tsx`: export the customer's data as JSON, and an **erasure** request that anonymises the name, phone and address on non-statutory records but keeps statutory registers (with a note explaining why). Add a privacy notice template to settings. Get a lawyer's review before launch (open question Q5).

#### B5.7 🤝 Regulatory compliance & drug license renewal alerts ⏱ 1.5 days
- **Why:** Running a retail pharmacy with an expired Drug License (Form 20/21) or expired Chief Pharmacist council registration leads to immediate sealing and cancellation by state drug inspectors.
- **Files:** ✏️ `schema/platform.ts` (store licenses & pharmacist registrations), ➕ `src/server/domain/compliance/license-tracker.ts`, ➕ `src/app/dashboard/compliance/licenses/page.tsx`.
- **How:**
  - Track Drug License Form 20, 21, 20B, 21B validity dates per store.
  - Track Pharmacist State Pharmacy Council registration number and renewal validity.
  - Track FSSAI registration number and expiry date.
  - Automatic 60-day, 30-day, and 7-day advance warnings in Topbar and owner dashboard.
- **Done when:** an upcoming license expiry triggers clear dashboard alerts and notification reminders 🧪.

**Phase 5 exit:** month-end close demo: receipts and payments → bank reconciliation → GSTR-1 and 2B reconciliation → period lock. A sandbox IRN on a B2B invoice. Opt-out respected by reminders.

---

## Phase 6 · Hardening & launch (Weeks 23–26)

**Goal:** a paying pilot chain runs MediFlow in production.

### Lane A · Phase 6

#### A6.1 Observability ⏱ 2 days
- Structured logs with `pino` (request id, tenant id; **no PII**). Error tracking (Sentry or an equivalent; free tier) via `instrumentation.ts` and `instrumentation-client.ts`. Read `node_modules/next/dist/docs/01-app/02-guides/instrumentation.md`. ➕ `src/app/api/health/route.ts` (DB ping, outbox backlog size, last cron run).

#### A6.2 Performance ⏱ 2.5 days
- Seed 50k medicines, 200k batches and 1M movements (extend `scripts/generate-stock.ts`). Targets: POS search p95 under 150 ms, sale commit p95 under 400 ms, report pages under 2 s. Use `EXPLAIN ANALYZE` and add missing indexes (e.g. `batches (store_id, medicine_id) WHERE qty_on_hand > 0`, `sales (tenant_id, store_id, completed_at)`). Load-test the sale endpoint with k6 (20 concurrent cashiers). Check the pg Pool size (`max: 10` in `db/index.ts`) against the hosting limits.

#### A6.3 Deployment ⏱ 3 days
- **Decision needed (open question Q1): hosting.** Options: a managed Node host (Railway, Render, Fly.io) or a VPS with Docker, plus managed Postgres (Neon, Supabase, AWS RDS, or a Mumbai region for latency and data residency). Vercel works for the app but needs a separate cron and Postgres, and long-running sync batches must fit the function timeouts.
- ➕ `Dockerfile` (multi-stage, `output: "standalone"` in `next.config.ts`; read `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`), ➕ `.github/workflows/deploy.yml` (on push to `main` after CI: run `db:migrate`, then deploy), environments `staging` and `production`. Set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` for multi-instance. Backups: daily plus PITR, and a restore drill documented in ➕ `docs/runbooks/restore.md`. Cron for `/api/cron/outbox` (every minute) and `/api/cron/reminders` (daily 09:00 IST).

#### A6.4 Security headers & review ⏱ 1.5 days
- CSP, frame-ancestors, referrer policy (read `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`). Re-run the docs/13 checklist across all routes. `npm audit` in CI. Revoke and rotate any keys that were ever committed (scan with `gitleaks`).

#### A6.5 POS polish & resilience ⏱ 2 days
- Error boundaries (`error.tsx`) per module. The POS never loses the cart on error (persist the cart in IndexedDB). Printer setup guide (80 mm thermal driver settings) and a test print. Keyboard-only audit of the billing flow.

#### A6.6 Drop deprecated columns ⏱ 0.5 day
- Remove `medicines.rack_id` (replaced in A3.3) and any other deprecated items, in a migration.

### Lane B · Phase 6

#### B6.1 AI assistant hardening ⏱ 3 days
- ✏️ `src/app/api/chat/route.ts`: remove `// @ts-nocheck`; move tools into ➕ `src/server/ai/tools/*.ts`, each typed and each calling **domain functions** (not raw SQL) with `ctx`, so tenant scoping and permissions are reused. Each tool declares its `permission`, and tools the user lacks aren't offered to the model. **Write tools** (`add_medicine`, future `create_po_draft`) return a *proposal*; the UI shows "Confirm" before executing (log to `ai_actions` with `status: pending_confirmation → confirmed`). Log every tool call to `ai_actions` (model, latency). Rate-limit per user.

#### B6.2 AI chores (stretch) ⏱ 2 days
- Tools: `draft_purchase_order` (uses B3.2), `expiry_redistribution` (B3.5), `explain_gst_mismatch` (B5.3). Each one produces drafts only, which a human confirms.

#### B6.3 Onboarding wizard ⏱ 2.5 days
- ➕ `src/app/onboarding/*`. After register: business details (legal name, GSTIN → state) → first store (licence number, invoice prefix with live 16-char check) → import data (B4) or the seed catalogue → invite staff (A1.4) → print a test bill. Fixes register's `stateCode: "00"`.

#### B6.4 Inspector & CA exports ⏱ 1.5 days
- One-click "Inspection pack" per store and date range: H, H1, X and narcotics registers as PDF/CSV, purchase invoices of scheduled drugs, and the pharmacist on duty. A "CA pack" per month: GSTR-1 JSON, sales and purchase registers, trial balance, P&L, stock valuation.

#### B6.5 User help ⏱ 1.5 days
- ➕ `src/app/dashboard/help/*` or `docs/user/`: short task-based guides (first bill, returns, transfers, GST filing, offline mode). Link them from the `?` shortcuts modal.

#### B6.6 Pilot ⏱ ongoing
- Recruit a pilot chain (open question Q4). Run in parallel with their existing software for 2 weeks and reconcile daily totals. Collect feedback into GitHub issues labelled `pilot`.

**Phase 6 exit = "v1 sellable"** (criteria in docs/01): a pilot chain runs a month with no fallback · offline drill passed · GSTR-1 accepted · import under 1 hour · CI with unit, integration and E2E tests guarding money, stock and tax.

---

## Cross-lane dependency map

```
Phase 0:  A0.1 ─► A0.3 ─┬─► B0.1, B0.4, B0.5 (need split schema)
                        └─► everyone merges main
Phase 1:  A1.1+A1.2 (🤝 rbac) ─► A1.3, B1.5
          B1.2 (🤝 tax ctx) ─────► A2.1
          B1.4 (🤝 Rx dispensing) ► A2.1
Phase 2:  B2.1 (🤝 outbox) ───────► A2.1 (receipt), A5.3 (reminders)
          B2.5 (🤝 loyalty) ──────► A2.1, A2.4, A2.5, A2.7
          B2.6 (🤝 GST docs) ─────► A2.4, A2.5
          A2.9 (🤝 postPayment) ──► B2.4, A5.1, B4.4
Phase 3:  A3.3 (🤝 store settings) ► B3.2
          A3.4 (🤝 transfers) ────► B3.2, B3.3, B3.4, B3.5
Phase 4:  A2.1 createSale ────────► A4.3 sync
          A (🤝 postOpeningBalance) ► B4.4
Phase 5:  B0.4 crypto ─────────────► B5.1 credentials
```

When you start a phase, list your 🤝 items in the Monday sync and merge them by Wednesday.

---

## Future Scope & Multi-Platform Delivery Strategy

While MediFlow is engineered as a modern, high-performance Next.js application, its delivery architecture is designed for multi-platform deployment catering to diverse retail pharmacy operational environments:

### 1. Cloud Web SaaS (Browser-Hosted)
- **Deployment:** Hosted cloud application accessible via any modern browser (Chrome, Edge, Firefox, Safari).
- **Use Case:** Instant multi-device access without local installation, branch performance monitoring, head-office analytics, remote accountant access, and inventory checks from any location.

### 2. Native Windows Desktop Executable (`.exe` / `.msi`)
- **Packaging:** Standalone downloadable desktop executable packaged via Tauri with a local Rust sidecar.
- **Capabilities:**
  - **Offline-First Billing:** Full counter operation continues uninterrupted during internet loss using a local SQLite cache and bidirectional sync (Phase 4).
  - **Direct Hardware Integration:** Raw USB and serial ESC/POS thermal printer support, hardware cash drawer kick triggers, and high-speed barcode scanner buffer.
  - **Zero-Latency Counter Ops:** Maximizes counter throughput for high-volume pharmacies accustomed to legacy desktop ERP speed.

### 3. Native macOS Desktop Application (`.dmg`) [Future Scope]
- **Packaging:** Native macOS desktop bundle (Apple Silicon M-series & Intel x86_64).
- **Capabilities:**
  - Apple menu bar integration and native system notification dispatch.
  - Cross-platform Marg ERP keyboard parity: automatic mapping for Mac keyboards (`Option ⌥` for `Alt`, `Cmd ⌘ + Enter` for `End`, `Fn + F1–F12` function key handling).
  - Offline-first local SQLite cache with cloud sync.

### 4. Mobile Companion Application (iOS & Android) [Future Scope]
- **Target Audience:** Pharmacy owners, managing directors, and traveling store supervisors.
- **Core Capabilities in Scope:**
  - **Executive Real-Time Dashboard:** Live tracking of daily sales, profit margins, active cash register shifts, and tender breakdowns across all branches.
  - **Inventory Audits & Mobile Scanner:** Use phone camera as a high-speed barcode scanner for periodic shelf stock audits, discrepancy logging, and batch verification.
  - **Alerts & Push Notifications:** Immediate push notifications for near-expiry batches, critical stock-outs, and pending promise orders.
  - **Customer Credit ("Khata") & Reminders:** View customer balances and dispatch automated WhatsApp/SMS payment reminders directly from mobile.
  - **Purchase Order & GRN Approvals:** Review and authorize purchase orders and distributor bills on the go.

---

## Open questions (decide before the phase that needs them)

| # | Question | Needed by | Owner |
|---|---|---|---|
| Q1 | Hosting provider and region (data residency, cost, cron support) | Phase 6 (staging by Phase 3 is better) | A |
| Q2 | GSP/ASP vendor for e-invoice and e-way bill | Phase 5 | B |
| Q3 | Pricing model (per store per month? per device?), which affects device and store limits in the schema | Phase 3 | both |
| Q4 | Pilot chain: who, how many branches, which states? | Phase 4 (for import samples) | both |
| Q5 | Legal review: DPDP notice and consent text; register retention per state | Phase 5 | B |
| Q6 | GitHub plan: does Kapil upgrade to Pro (or move to an org on the Team plan) to enable branch protection on the private repo? | Phase 0 | Kapil |
| Q7 | Medicine dataset licence (`Indian-Medicine-Dataset`): may we ship it to customers? | Phase 0 (B0.7) | B |

## Progress tracker

Tick items in PRs. One line per task, in the same order as above.

**Phase 0** — A: [x] A0.1 [x] A0.2 [x] A0.3 [x] A0.4 [x] A0.5 [x] A0.6 [x] A0.7 · B: [x] B0.1 [x] B0.2 [x] B0.3 [x] B0.4 [x] B0.5 [x] B0.6 [x] B0.7 [x] B0.8
**Phase 1** — A: [x] A1.1 [x] A1.2 [x] A1.3 [x] A1.4 [x] A1.5 [x] A1.6 [x] A1.7 · B: [x] B1.1 [x] B1.2 [x] B1.3 [x] B1.4 [x] B1.5 [x] B1.6 [x] B1.7
**Phase 2** — A: [x] A2.1 [x] A2.2 [x] A2.3 [x] A2.4 [x] A2.5 [x] A2.6 [x] A2.7 [x] A2.8 [x] A2.9 [x] A2.10 [x] A2.11 [x] A2.12 · B: [x] B2.1 [x] B2.2 [x] B2.3 [x] B2.4 [x] B2.5 [x] B2.6 [x] B2.7 [x] B2.8
**Phase 3** — A: [x] A3.1 [x] A3.2 [ ] A3.3 [ ] A3.4 [ ] A3.5 [ ] A3.6 · B: [x] B3.1 [x] B3.2 [x] B3.3 [x] B3.4 [x] B3.5 [x] B3.6 [x] B3.7
**Phase 4** — A: [ ] A4.1 [ ] A4.2 [ ] A4.3 [ ] A4.4 [ ] A4.5 [ ] A4.6 [ ] A4.7 [ ] A4.8 [ ] A4.9 · B: [ ] B4.1 [ ] B4.2 [ ] B4.3 [ ] B4.4 [ ] B4.5 [ ] B4.6
**Phase 5** — A: [ ] A5.1 [ ] A5.2 [ ] A5.3 [ ] A5.4 [ ] A5.5 [ ] A5.6 [ ] A5.7 · B: [ ] B5.1 [ ] B5.2 [ ] B5.3 [ ] B5.4 [ ] B5.5 [ ] B5.6 [ ] B5.7
**Phase 6** — A: [ ] A6.1 [ ] A6.2 [ ] A6.3 [ ] A6.4 [ ] A6.5 [ ] A6.6 · B: [ ] B6.1 [ ] B6.2 [ ] B6.3 [ ] B6.4 [ ] B6.5 [ ] B6.6

---

## Appendix: effort sanity check

Summing the ⏱ estimates: Lane A ≈ 85 days (P0 5 · P1 12 · P2 17 · P3 12.5 · P4 17 · P5 10 · P6 11.5); Lane B ≈ 78 days (P0 5.5 · P1 10.5 · P2 13.5 · P3 12 · P4 11 · P5 15 · P6 10.5). At 10–15 h/week (≈3.3–5 "roadmap days" per week) the 26 weeks give 87–130 days per person. **Phase 2 (Lane A) and Phase 4 (Lane A) are the tightest**: about 4.3 days/week. Estimates for unfamiliar work are usually optimistic, so treat the slack as reserved for that, not as spare time. If both of you can only do ~10 h/week, plan to **cut**: A3.6, B3.3, B3.5, B5.2, B6.2 and A6.6 (all "stretch" or deferrable), which saves about 12 days per lane.
