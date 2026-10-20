# A_TEST_GUIDE: manual test guide for Lane A (overxpowered)

> **Owner:** overxpowered · **Covers:** every phase and subphase of Lane A in [ROADMAP.md](ROADMAP.md): platform, RBAC, POS/sales, inventory & stock, accounting core, offline POS, ops.
> **Companion:** [B_TEST_GUIDE.md](B_TEST_GUIDE.md) (Lane B). Tests that cross lanes are listed at the end of both guides.
> **Last updated:** 20 Oct 2026, at the end of **A1.3** (`lane-a/overxpowered`). **Keep this file current:** see "Maintaining this guide".

---

## 0. How to use this guide

### Status legend (per test)
| Mark | Meaning |
|---|---|
| ✅ | Built and verified. Run it; it should pass. |
| ⏳ | **Not built yet.** The steps are written from the roadmap's "Done when" criteria so you can test the moment the task lands. Adjust button labels to the final UI. |
| ❗ | **Known to fail today** (a documented bug or gap). A pass means somebody fixed it. |

### Perspectives
Every phase has two kinds of tests:
- 👤 **User perspective:** what a pharmacist, cashier or owner sees and does in the browser.
- 🛠 **Developer perspective:** commands, SQL, tests, code behaviour, permissions and integrations.

### Test format
Each test has an ID (`A-<phase>.<number>`), the **phase/subphase/feature**, **steps**, and an **expected result**. Mark the result in the PR description or your notes as **PASS**, **FAIL** (with what you saw) or **BLOCKED**.

### Maintaining this guide
This guide is part of the definition of done:
1. **Every PR that changes behaviour updates this file in the same PR:** tick ⏳ → ✅ for tasks that land, rewrite steps whose UI changed, add tests for new behaviour, and remove tests for removed behaviour.
2. Update the "Last updated" line and the counts in 0.4 / 1-D2 if they changed.
3. The PR template has a checkbox for it. Reviewers check it.
4. Anything that affects the other lane (a contract, a shared file) also goes in the cross-lane section of both guides.

---

## 0.1 Environment setup (once)

```bash
git clone https://github.com/kapilkurchaniya/mediflow.git && cd mediflow
npm install                          # also installs the git pre-push hook
git config mediflow.lane a           # Kapil: b
git switch lane-a/overxpowered
```

Postgres (pick one):
```bash
docker compose up -d db              # normal Docker
# if Docker bridge networking fails on your machine:
docker run -d --name mediflow-db --network host -e POSTGRES_USER=mediflow -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_DB=mediflow postgres:16 -c port=5433 -c listen_addresses=127.0.0.1
docker exec mediflow-db psql -p 5433 -U mediflow -d mediflow -c "create database mediflow_test"
```

`.env` (git-ignored):
```
DATABASE_URL=postgres://mediflow@localhost:5432/mediflow        # use port 5433 for the host-network container
```
`.env.test` (git-ignored): `cp .env.test.example .env.test` and fix the port if needed (database name must contain "test").

Build the database, seed the demo pharmacy and one login per role, and run:
```bash
npm run db:reset                     # wipe local DB -> migrate -> seed owner -> seed role users
npm run dev                          # http://localhost:3000
```

### 0.2 Test accounts (created by `npm run db:reset`, local only)
| Role | Email | Password | Can do (summary) |
|---|---|---|---|
| Owner | `admin@apollo.com` | `admin123` | everything |
| Store Manager | `manager@apollo.com` | `manager123` | everything except users, settings, stores, API keys, all-store reports |
| Pharmacist | `pharmacist@apollo.com` | `pharmacist123` | billing, returns, medicines, customers, prescriptions |
| Cashier | `cashier@apollo.com` | `cashier123` | billing, view stock/customers |
| Purchase Manager | `purchase_manager@apollo.com` | `purchase_manager123` | suppliers, purchasing, medicines, reports |
| Accountant | `accountant@apollo.com` | `accountant123` | accounting, GST, reports (no billing) |
| Auditor | `auditor@apollo.com` | `auditor123` | read-only reports, accounting, audit log |

Tip: use one normal window per role, or private windows, so sessions don't overwrite each other.

### 0.3 Resetting between tests
`npm run db:reset` returns to a known state (about 20 s). Do it before a long session or when a test leaves data you don't want.

### 0.4 Quick health check (run first, 🛠)
```bash
npm run typecheck && npm run lint:strict && npm test
```
**Expected:** all three exit 0. `npm test` shows `Test Files 12 passed` and `Tests 141 passed` (the numbers grow as tests are added; **no failures** is what matters).

---

# PHASE 0 · Foundation & safety (A0.1 – A0.7) ✅

### A-0.1 · A0.1 Catch-up migration
**🛠 Feature:** a database built only from migrations has every table.
1. `npm run db:reset`.
2. `psql "$DATABASE_URL" -Atc "select count(*) from information_schema.tables where table_schema='public'"` (docker: `docker exec mediflow-db psql -p 5433 -U mediflow -d mediflow -Atc "..."`).
3. `ls drizzle` and `cat drizzle/meta/_journal.json | grep tag`.

**Expected:** the script prints `✓ database wiped`, `✓ migrations applied`, `✓ system roles synced for 1 tenant(s)`; the count is **58**; `drizzle/` contains `0000_init`, `0001_catch_up`, `0002_gst_default_5pct` (more later).

### A-0.2 · A0.1 No drift between schema and migrations
**🛠** `npx drizzle-kit generate --name should_not_exist`

**Expected:** `No schema changes, nothing to migrate`. If it creates a file, delete it (`git clean -f drizzle`) and tell the author of the schema change to commit a migration.

### A-0.3 · A0.2 `db:*` scripts
**🛠**
1. `npm run db:reset` works (see A-0.1).
2. `DATABASE_URL=postgres://u:p@db.example.com:5432/x npm run db:reset`
3. `DATABASE_URL=postgres://u:p@db.example.com:5432/x npm run db:seed-users`
4. `npm run db:migrate` on an already-migrated DB.

**Expected:** (2) and (3) print `Refusing to ... non-local database (host: db.example.com)` and change nothing. (4) prints `✓ migrations applied` and `✓ system roles synced`, no errors, no duplicates.

### A-0.4 · A0.3 Schema split
**🛠**
1. `ls src/server/db/schema` and `wc -l src/server/db/schema/*.ts`.
2. `grep -c "export \* from" src/server/db/schema/index.ts`.
3. `ls src/server/db/schema.ts` (the old file).

**Expected:** 12 module files (`platform catalog inventory sales accounting purchasing compliance gst crm comms banking ai`) plus `_helpers.ts` and `index.ts`; 12 export lines; the old `schema.ts` **does not exist**.

### A-0.5 · A0.4 Test harness runs against a real database
**🛠**
1. `npm test`.
2. `DATABASE_URL=postgres://mediflow@localhost:5432/mediflow npm test` (a database name **without** "test").

**Expected:** (1) all files pass, and `psql -l` afterwards shows **no** leftover `mediflow_test_*` databases. (2) fails immediately with `Refusing to run tests against database "mediflow"`.

### A-0.6 · A0.4 The concurrency tests have teeth (optional, advanced 🛠)
1. Open `src/server/domain/stock.ts`, temporarily remove `.for("update")` (the row lock).
2. `npx vitest run tests/integration/stock.test.ts`.
3. **Restore the file** (`git checkout src/server/domain/stock.ts`).

**Expected:** with the lock removed, at least `CONCURRENCY: 20 parallel single-unit sales...` and `LEDGER REPLAY...` **fail**; with the lock restored they pass. This proves the tests guard the lock.

### A-0.7 · A0.5 Sidebar split (👤)
**Feature:** navigation menu.
1. Log in as **owner**. Read the left menu.
2. Click every link once.
3. Press `Ctrl+K` (command palette). Type `purchase`, then `customer`, then `expiry`.

**Expected:**
- Menu sections in order: *(Overview, New bill)*, **Operations** (Sales & invoices, Omnichannel orders, Purchases (GRN), Promise orders), **Compliance (Rx)** (4 items), **Inventory** (Item master, Batches & stock, Racks & shelves, Trade schemes, Bulk import), **GST & Tax** (5), **Finance** (Accounting, Bank reconciliation, Reports & Analytics, MR commissions), **Comms & Alerts** (2), **Directory** (Suppliers, Customers, Family groups, Medical reps (MR), Loyalty rewards), and *Settings* pinned at the bottom. **31 links** in the sections, plus *Settings* pinned at the bottom (32 clickable items; the logo also links to the dashboard).
- No link gives a 404.
- The palette shows the same destinations plus quick links: **Record purchase**, **Add customer**, **Near-expiry batches**, and the actions *Toggle sidebar*, *Keyboard shortcuts*, *Ask MediFlow AI*.

### A-0.8 · A0.5 Nav config is safe to extend (🛠)
`npx vitest run tests/unit/nav.test.ts`

**Expected:** passes. To see the guard work: in `src/app/components/nav/sales.ts` change a `href` to `/dashboard/typo`, re-run → the test `every link points at a page that exists` **fails** and names the link. Revert.

### A-0.9 · A0.6 Strict lint ratchet (🛠)
1. `npm run lint:strict` → exit 0.
2. Add `export const x: any = 1;` to `tests/unit/money.test.ts`, run again, then remove the line.

**Expected:** (1) passes. (2) exits **1** with `Unexpected any`. (Whole-repo `npm run lint` still reports Lane B's pending errors; that is expected until they are fixed.)

### A-0.10 · A0.7 Optional sale steps cannot take the sale down (🛠)
`npx vitest run tests/integration/sale-resilience.test.ts`

**Expected:** all pass, including `a failing GST-document step does NOT take the sale down with it` and `a failing loyalty step...`. (Before the fix these returned `success` while the sale was silently rolled back.)

### A-0.11 · A0.7 Invoice number limit and bill prefix (👤)
**Feature:** GST Rule 46: invoice numbers ≤ 16 characters.
1. Log in as **owner** → **Settings**. Set *Bill / Invoice Serial Prefix* to `BILL` → Save.
2. Set it to `ab1` → Save.
3. Set it to `A/B` → Save.
4. Set it back to `INV` → Save.
5. Make a sale (see A-1.20) and read the invoice number on the invoice page.

**Expected:** (1) error: *Bill prefix can be at most 3 characters (GST allows 16 characters in total per invoice number).* The input itself stops at 3 characters. (2) saved as `AB1`. (3) error: *Use only capital letters and digits for the bill prefix.* (5) the number looks like `INV/26-27/000001` (**16 characters**; the middle part is the financial year, 1 April to 31 March).

### A-0.12 · A0.7 The numbering service refuses a too-long number (🛠)
`npx vitest run tests/integration/sequence.test.ts`

**Expected:** passes, including `refuses to issue a sale number longer than 16 characters`, `50 parallel bills get 50 distinct, consecutive numbers`, `the series restarts on 1 April`.

### A-0.13 · A0.7 Money and tax arithmetic (🛠)
`npx vitest run tests/unit/money.test.ts tests/unit/invoice-no.test.ts`

**Expected:** pass. Spot-check by hand: ₹105 inclusive at 5% GST → taxable ₹100, CGST ₹2.50, SGST ₹2.50.

---

# PHASE 1 · Platform & correctness (A1.1 – A1.7)

## A1.1 / A1.2 RBAC core and `protectedAction` ✅

### A-1.1 · A1.1 System roles exist with the right permissions (🛠)
```sql
select r.key, count(rp.*) as permissions
from roles r left join role_permissions rp on rp.role_id = r.id
group by r.key order by 1;
```
**Expected:** `accountant 12 · auditor 11 · cashier 9 · manager 32 · owner 38 · pharmacist 15 · purchase_manager 13` (one tenant after `db:reset`). If a role template in `src/lib/permissions.ts` changes, these numbers change; update them here.

### A-1.2 · A1.1 Roles heal themselves on migrate (🛠)
1. `delete from role_permissions where permission='medicine.view' and role_id=(select id from roles where key='cashier');`
2. Log in as cashier → open **Item master** (`/dashboard/inventory`): you get the *no access* page (see A-1.6).
3. Run `npm run db:migrate`.
4. Reload the page.

**Expected:** step 3 prints `✓ system roles synced for 1 tenant(s)`; the cashier's permission count is **9** again and the page opens.

### A-1.3 · A1.1 Legacy tenants are not locked out (🛠)
Simulates a pharmacy created before permissions existed.
1. Remove all permissions of the owner role: `delete from role_permissions where role_id=(select id from roles where key='owner');`
2. Try to open `/dashboard/settings` as owner (expect no access).
3. `npm run db:migrate`.

**Expected:** after step 3 the owner has **38** permissions and the settings page opens.

### A-1.4 · A1.1 Registration seeds a working owner (👤)
1. Log out. Open `/register` and create a new pharmacy ("Test Pharmacy 2", any new email/password).
2. After the redirect, open **Settings**, **Accounting**, **New bill**.

**Expected:** all three open (the registering user is **Owner** with all permissions). SQL check: `select r.key, count(*) from roles r join role_permissions rp on rp.role_id=r.id where r.tenant_id=(select id from tenants where name='Test Pharmacy 2') group by r.key;` shows the 7 roles.

### A-1.4b · A1.1 Registration is covered by a test (🛠)
`npx vitest run tests/integration/register.test.ts` → the first user of a new pharmacy gets **all 38** permissions and a signed-in session; a duplicate email and missing fields are refused.

### A-1.5 · A1.1 Membership and store checks (🛠)
`npx vitest run tests/integration/rbac.test.ts`

**Expected:** pass: a suspended member is refused; a member with an empty allowed-stores list is refused; a session pointing at another tenant is refused; the context never contains a password hash.

### A-1.6 · A1.2 Friendly "no access" page (👤)
1. Log in as **cashier**.
2. Type `/dashboard/accounting` in the address bar.
3. Type `/dashboard/settings`.

**Expected:** each shows the page *"You don't have access to this page"* with a **Back to dashboard** button, and the browser network tab shows status **403** (not a crash, not a blank page).

### A-1.7 · A1.2 `protectedAction` on the reference module: racks (👤)
**Feature:** `src/app/actions/racks.ts`.
1. Log in as **pharmacist** → **Inventory → Racks & shelves**.
2. Click *Add Rack / Shelf*. Code `r1-s2`, Name `Front shelf` → Save.
3. Add another with code `R1-S2` again.
4. Try saving with an empty code.
5. Edit the rack's name → Save. Then delete it.

**Expected:** (2) the rack appears with code **R1-S2** (upper-cased). (3) error **Rack code 'R1-S2' already exists in this store.** (4) error **Rack code is required (e.g. R1-S2).** (5) the rename shows; delete asks for confirmation and removes the row.

### A-1.8 · A1.2 Server-side enforcement of racks (🛠)
`npx vitest run tests/integration/racks-actions.test.ts`

**Expected:** pass, including: a cashier cannot create a rack; an attacker cannot update/delete a **different pharmacy's** rack ("Rack not found."); cannot attach a medicine to another pharmacy's rack; cannot delete a rack of a **different store** of the same pharmacy.

### A-1.9 · A1.2 Errors map to messages (🛠)
Read `src/server/action.ts`.

**Expected:** `DomainError` (including `ForbiddenError`) shows its own message; any other error is logged as `[server action]` and the user sees *Something went wrong. Please try again.* (never a stack trace or SQL).

### A-1.10 · A1.2 Unique-violation helper (🛠)
`npx vitest run tests/unit/db-errors.test.ts` → pass. **Why it matters:** Drizzle wraps driver errors, so `err.message.includes("constraint_name")` never matches; use `isUniqueViolation(err, "constraint_name")`.

## A1.3 Permissions across all Lane A modules ✅

### A-1.11 · A1.3 Page access matrix (👤)
Log in as each role and open each URL. **✓ = opens, 403 = the no-access page.**

| URL (permission) | owner | manager | pharmacist | cashier | purch. mgr | accountant | auditor |
|---|---|---|---|---|---|---|---|
| `/dashboard` (dashboard.view) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/dashboard/sales` (sale.view) | ✓ | ✓ | ✓ | ✓ | 403 | ✓ | ✓ |
| `/dashboard/sales/pos` (sale.create) | ✓ | ✓ | ✓ | ✓ | 403 | 403 | 403 |
| `/dashboard/inventory` (medicine.view) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/dashboard/inventory/batches` (inventory.view) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/dashboard/inventory/new` (medicine.manage) | ✓ | ✓ | ✓ | 403 | ✓ | 403 | 403 |
| `/dashboard/inventory/batches/new` (inventory.adjust) | ✓ | ✓ | 403 | 403 | 403 | 403 | 403 |
| `/dashboard/inventory/import` (inventory.adjust) | ✓ | ✓ | 403 | 403 | 403 | 403 | 403 |
| `/dashboard/accounting` and sub-pages (accounting.view) | ✓ | ✓ | 403 | 403 | 403 | ✓ | ✓ |
| `/dashboard/settings` (settings.manage) | ✓ | 403 | 403 | 403 | 403 | 403 | 403 |
| `/dashboard/settings/racks` (medicine.manage) | ✓ | ✓ | ✓ | 403 | ✓ | 403 | 403 |

**Expected:** every cell matches. A mismatch is a bug: note the role, the URL and what you saw.

### A-1.12 · A1.3 Menu hides what you cannot use (👤)
1. Log in as **owner**: count the menu links (**31**) and note the sections.
2. Log in as **cashier**: count again.
3. Log in as **accountant**, then **auditor**.
4. For each, press `Ctrl+K` and type `purchase`.

**Expected** (links in the sections, not counting the logo; Settings is a separate pinned link shown only with `settings.manage`):

| Role | Menu links | Sections shown (besides the unlabelled Overview / New bill block) | Settings link |
|---|---|---|---|
| owner | **31** | Operations, Compliance (Rx), Inventory, GST & Tax, Finance, Comms & Alerts, Directory | yes |
| manager | 31 | same as owner | no |
| pharmacist | 17 | Operations, Compliance (Rx), Inventory, Comms & Alerts, Directory | no |
| cashier | **13** | Operations, Inventory, Comms & Alerts, Directory | no |
| purchase_manager | 14 | Operations, Compliance (Rx), Inventory, Finance, Directory | no |
| accountant | 23 | Operations, Compliance (Rx), Inventory, GST & Tax, Finance, Directory | no |
| auditor | 23 | same as accountant | no |

The cashier's palette (`Ctrl+K`) does **not** offer *Record purchase*; the owner's does. Accountant and auditor see *GST & Tax* and *Finance* but not *New bill*. (If you change role templates or nav `permission` fields, update this table; the nav unit tests catch dead ends, not counts.)

### A-1.13 · A1.3 The menu never offers a dead end (🛠)
`npx vitest run tests/unit/nav.test.ts`

**Expected:** pass, including `a page's own permission check agrees with its menu item`.

### A-1.14 · A1.3 Permission matrix over every Lane A action (🛠)
`npx vitest run tests/integration/lane-a-permissions.test.ts`

**Expected:** 41 tests pass. Each Lane A action is refused for a user with **no** permissions and allowed for a user with **exactly** its permission. **When you add an action:** add a row to `CASES` in that file.

### A-1.15 · A1.3 Direct call as the wrong role (🛠, optional)
With the dev server running and logged in as cashier, open the browser console on the POS page and run:
```js
await fetch("/dashboard/inventory/import", { method: "GET" }).then(r => r.status)
```
**Expected:** `403`. (Actions behind a client page also check permissions: `npx vitest` covers this; the page layout is the second line of defence.)

### A-1.16 · A1.3 Sale input is not trusted (🛠)
`npx vitest run tests/integration/sale-resilience.test.ts -t "rejects"`

**Expected:** a negative discount, a discount above 100%, a fractional discount, zero/negative/fractional quantity and a negative amount paid are all rejected with a clear message and **nothing is written** (no sale, stock unchanged).

### A-1.17 · A1.3 Discount ceiling and `sale.discount_override` (👤+🛠)
1. `update tenants set settings = '{"maxDiscountBp": 1000}'::jsonb;` (10%).
2. Log in as **cashier** → **New bill**, add a medicine, set the line discount to **15%**, complete the sale.
3. Set the discount to **10%** and complete.
4. Log in as **owner** (or manager) and bill with **15%**.
5. Reset: `update tenants set settings = '{}'::jsonb;`

**Expected:** (2) error *Discounts above 10% need a manager's approval (permission "sale.discount_override")* and no sale is created. (3) succeeds. (4) succeeds. With **no** ceiling configured, any 0-100% discount works (current default).

### A-1.18 · A1.3 New medicines default to GST 5% (👤)
1. Log in as **owner** → **Item master → New item**.
2. Look at the *GST rate* dropdown.
3. Enter a name (`Test Tab`), save, then check the database: `select name, gst_rate_bp from medicines where name='Test Tab';`

**Expected:** the dropdown is preselected to **5% — Most medicines (GST 2.0)**; the row has `gst_rate_bp = 500`. Submitting a rate outside 0/5/12/18/28% (e.g. by editing the HTML in devtools) shows *Choose a valid GST rate*.

### A-1.19 · A1.3 Accounting no longer crashes on an empty session (🛠)
Delete the session cookie in devtools and reload `/dashboard/accounting`.

**Expected:** you are redirected to **/login** (not a "Cannot read properties of null" crash).

## Baseline features owned by Lane A (existing before the roadmap) ✅

### A-1.20 · POS: a complete cash sale (👤)
**Feature:** `/dashboard/sales/pos`, `createSaleInvoice`.
1. Log in as **cashier**. Open **New bill** (`F2`).
2. Press `/` and search a medicine that has stock (e.g. `para`). Add 2 units.
3. Choose payment **Cash**, amount = total. Complete the sale.
4. Open **Sales & invoices** and the new invoice. Open the **print** view.

**Expected:** the bill total = quantity × price with GST included; an invoice number like `INV/26-27/00000N`; stock reduced by 2; the invoice shows batch number and expiry per line; print view offers thermal/A4. SQL: `select qty_on_hand from batches where id=...` dropped by 2; `select count(*) from stock_movements where type='sale'` increased by 1; `select * from journal_entries order by created_at desc limit 1` exists and its lines balance (`select sum(debit)-sum(credit) from journal_lines where entry_id=...` = **0**).

### A-1.21 · POS: expired and out-of-stock protection (👤)
1. Set a batch to expired: `update batches set expiry_date = current_date - 1 where id=(select id from batches where qty_on_hand>0 limit 1);`
2. Search for that medicine in POS.
3. Try to bill more than the stock on hand.

**Expected:** the expired batch is not offered for sale; billing above the available quantity fails with *Insufficient stock for ... Available: N* and **no stock changes**.

### A-1.22 · POS: Schedule H/H1/X compliance (👤)
1. Mark a medicine `update medicines set schedule='H1', rx_required=true where name ilike 'azee%';`
2. In POS, add it **without** doctor details and try to complete.
3. Add doctor name, doctor registration number, patient name/age/address and a prescription reference → complete.
4. Open **Compliance → Schedule H1**.

**Expected:** (2) blocked with a compliance message. (3) succeeds. (4) a register line exists with patient, doctor, batch, quantity and your pharmacist name. SQL: `select count(*) from dispensing_logs` increased by 1.

### A-1.23 · Inventory: opening stock, adjustments (👤)
1. As **manager**: **Inventory → Batches & stock → Opening stock**. Pick a medicine, batch `TEST1`, expiry next year, qty 50, rates → Save.
2. Open **Batches & stock**; use *near expiry* filter.
3. *(No screen yet: `adjustBatchStock` has no page, a stock-adjustment UI is part of later work.)* Verify the ledger rule by SQL after any sale or opening stock.

**Expected:** (1) batch `TEST1` shows qty 50 and a `stock_movements` row of type `opening`. (3) for **every** batch the **sum of its movements equals its quantity**: `select b.id from batches b where b.qty_on_hand <> (select coalesce(sum(qty_change),0) from stock_movements m where m.batch_id=b.id);` returns **no rows**. (Adjustment behaviour itself is covered by `tests/integration/stock.test.ts`.)

### A-1.24 · Accounting views are consistent (👤)
After the POS sale from A-1.20, as **accountant**:
1. **Accounting & Day Book** → today's range. 2. **Trial Balance**. 3. **Profit & Loss**. 4. **Balance Sheet**. 5. **Cash flow**.

**Expected:** the sale appears in the day book; trial-balance total debits = total credits; P&L shows sales revenue ≈ taxable amount; balance sheet balances (assets = liabilities + equity).

### A-1.25 · Settings (👤)
As **owner**: **Settings**: change store name, GSTIN, drug licence no., address → Save; reload.

**Expected:** values persist; the name shows in the sidebar's store box; invoice print shows the licence number.

### A-1.26 · Auth basics (👤)
1. Log out; open `/dashboard` → redirected to `/login`.
2. Log in with a wrong password; then correctly.
3. Register a new pharmacy (A-1.4).

**Expected:** (1) redirect to login with `?redirect=`. (2) *Invalid email or password*, then the dashboard. Session cookie `mediflow_session` is `HttpOnly`; the database stores only a hash: `select id from sessions limit 1` shows a 64-character hex string that is **not** the cookie value.

## A1.4 – A1.7 (⏳ planned)

### A-1.27 ⏳ A1.4 Users, roles and store access UI
1. As **owner**: **Settings → Users** → *Invite user* (cashier, all stores). Copy the invite link.
2. Open the link in a private window; set a name and password.
3. Log in as the new user.
4. As owner, suspend that user; the user tries to use the app.
5. As owner, try to remove the last owner.

**Expected:** (2)-(3) the new user is a **Cashier** (14 menu links). (4) the suspended user is refused (403/redirect). (5) refused: *There must be at least one owner.* DB: `user_invites.token_hash` holds a hash, never the raw token. Invites expire.

### A-1.28 ⏳ A1.5 Login hardening and store selection
1. Enter a wrong password 10 times for one email.
2. Try the correct password.
3. Give a user `all_stores=false` with only store B, log in.
4. Change password in **Settings → Profile**.

**Expected:** (1)-(2) *Too many attempts, try again in 15 minutes* even with the right password; each attempt is a row in `login_attempts`. (3) the session starts in store B (never in another store). (4) other sessions of that user are signed out.

### A-1.29 ⏳ A1.6 Audit log
1. As owner, adjust stock by -3 with a reason; change a medicine price; change a role.
2. Open **Settings → Audit log** (auditor can too).

**Expected:** one row per action with user, time, entity, **old and new values** and the reason; filters by user/entity/date work; a cashier cannot open the page (403).

### A-1.30 ⏳ A1.7 Tenant isolation and RBAC suite
`npx vitest run tests/integration/isolation.test.ts`

**Expected:** a table-driven test covering **every action of both lanes**: without the permission → refused; with another pharmacy's ids → "not found"/empty. It must list every exported action; adding an action without adding it here should fail the build (review rule).

---

# PHASE 2 · Close the transaction loop (A2.1 – A2.9) ⏳

> Lane B's outbox (B2.1), loyalty (B2.5) and GST-document (B2.6) contracts are used here: see cross-lane tests (X-*).

### A-2.1 ⏳ A2.1 Sale domain service extracted
**🛠** `grep -n "export async function createSale" src/server/domain/sales/create-sale.ts`; `src/app/actions/sales.ts` is a thin wrapper.
**Expected:** all A-1.20 – A-1.22 and `sale-resilience` tests still pass; `tests/integration/create-sale.test.ts` covers a full sale (stock decremented, journal balanced, GST doc created, H1 log written, receipt queued in the outbox, **not** sent synchronously).

### A-2.2 ⏳ A2.2 Split-tender payments
1. POS: bill ₹500. Pay **₹300 cash + ₹200 UPI** (`F8` opens the payment panel).
2. Pay ₹400 cash on a ₹500 bill for a **customer without credit permission**.
3. Pay ₹400 + credit ₹100 for a customer within their credit limit, then over it.
4. Overpay in cash.

**Expected:** (1) `sale_payments` has 2 rows (cash 30000, upi 20000 paise) and the journal debits Cash and the UPI/bank account separately and balances. (2) refused (credit needs a customer and `customer.credit`). (3) allowed inside the limit; refused above it. (4) the change due is shown and recorded.

### A-2.3 ⏳ A2.3 Held (parked) bills
1. Add items, press `F6` (hold). 2. Start another bill and complete it. 3. `F7` list held bills, resume, complete.

**Expected:** a held bill has `status='held'`, **no invoice number and no stock movement**; resume restores the cart; completing it assigns the next invoice number. Held bills older than 24 h show a warning.

### A-2.4 ⏳ A2.4 Cancel a sale (same day)
1. Cancel a completed bill with a reason. 2. Try to cancel yesterday's bill. 3. Try to cancel a bill that has a return.

**Expected:** (1) `status='cancelled'`, stock restored (movement `sale_return`), a **reversing journal entry** (original not deleted), GST document cancelled, loyalty points reversed, an audit row, dispensing log kept with a cancellation note; the invoice number stays used. (2)-(3) refused with a clear reason.

### A-2.5 ⏳ A2.5 Sale returns / credit notes
1. Sell 3 strips; return 1. 2. Try to return 3 more. 3. Return from an expired batch.

**Expected:** (1) stock +1 in the **same batch**, credit note number `CN/26-27/000001`, refund journal balanced, `sale_items.returned_qty=1`, credit note appears in GSTR-1 (CDNR/B2C adjustments). (2) refused (only 2 left to return). (3) the batch goes on hold for supplier return.

### A-2.6 ⏳ A2.6 Cash register (shifts)
1. Without an open shift (setting `requireShift` on) try to bill. 2. Open a shift with ₹1,000. 3. Make a ₹500 cash sale and a ₹200 UPI sale. 4. Close with the counted cash. 5. Try to open a second shift in the same store.

**Expected:** (1) blocked with *Open the register to start billing*. (3)-(4) expected cash = 1,000 + 500 (UPI excluded) and the difference is shown; X/Z report pages print. (5) refused (one open shift per store).

### A-2.7 ⏳ A2.7 POS refactor and loyalty redemption
1. Re-run A-1.20 – A-1.22 and A-2.2/2.3 (no behaviour change). 2. Pick a customer with points; redeem 10 points.

**Expected:** identical behaviour to before the refactor; every file under `pos/` is below 300 lines (`wc -l`); redeemed value reduces the bill, and the customer's balance drops (see X-3).

### A-2.8 ⏳ A2.8 Playwright smoke
`npx playwright test tests/e2e/pos.spec.ts` → login → POS → 2-item bill with split payment → invoice totals correct. Runs in CI as a separate job.

### A-2.9 ⏳ A2.9 Receipts and payments (`postPayment`)
1. Credit sale ₹800 to a customer. 2. **Accounting → Receipts**: receive ₹500 against that bill.

**Expected:** a `payments` row (direction `in`), a balanced journal (Dr Cash/Bank, Cr Customer), the bill's `credit_amount` becomes 300, the customer's outstanding drops by 500.

---

# PHASE 3 · Multi-store chain (A3.1 – A3.6) ⏳

### A-3.1 ⏳ A3.1 Store management
As owner, **Settings → Stores → New**: create *Branch 2* (code ≤ 4 chars, state code, valid GSTIN, licence number).

**Expected:** invalid GSTIN, duplicate code, code longer than 4 characters, and a prefix that breaks the 16-character rule are refused; a valid store is created; owners get access to it automatically.

### A-3.2 ⏳ A3.2 Store switcher
1. As owner switch to Branch 2 (`Ctrl+Shift+S`). 2. As a user limited to Branch 1, try to switch to Branch 2.

**Expected:** (1) the POS banner shows the branch name; stock, sales and reports now show Branch 2 data; next login starts in the last used store. (2) refused.

### A-3.3 ⏳ A3.3 Per-store medicine settings
Set reorder level 10 for a medicine in Branch 1 and 40 in Branch 2; assign different racks.

**Expected:** each branch shows its own values; a medicine without a branch setting falls back to the item-master default; the backfill migration copied existing values.

### A-3.4 ⏳ A3.4 Stock transfers
1. Warehouse → Branch 1: create, **dispatch** 100 units, then **receive** 95. 2. Transfer between two stores with **different GSTINs**. 3. Try to transfer expired stock to a branch.

**Expected:** (1) dispatch: source stock -100 (`transfer_out`), the in-transit report shows 100; receive: destination batch +95 (`transfer_in`), a 5-unit discrepancy to resolve; stock never goes negative; numbering `TR/26-27/...`. (2) a **tax invoice** is generated (Lane B hook); same GSTIN → delivery challan; value over ₹50,000 flags *e-way bill required*. (3) refused (allowed only into a warehouse).

### A-3.5 ⏳ A3.5 Warehouse mode
Open POS while in the warehouse store.

**Expected:** a friendly refusal; POS and Sales are hidden from that store's menu; purchases and transfers work.

### A-3.6 ⏳ A3.6 Physical stock count (stretch)
Count a rack: enter counted quantities and post.

**Expected:** differences become `adjustment` movements with reason `stock count CNT/...` and an audit row; totals reconcile.

---

# PHASE 4 · Offline POS (A4.1 – A4.8) ⏳

> Design: [docs/10-offline-pos-design.md](docs/10-offline-pos-design.md).

### A-4.1 ⏳ A4.1 Devices
**Settings → Devices → Register device** returns a token **once**; revoke it.
**Expected:** DB stores only `token_hash`; a revoked device gets 401 on sync; the code (01-99) is unique per store.

### A-4.2 ⏳ A4.2 Sync-ready schema
`\d batches` shows `updated_at` and the trigger; updating a row (including through a stock movement) bumps `updated_at`.

### A-4.3 ⏳ A4.3 Sync API (🛠)
```bash
curl -H "Authorization: Bearer <device token>" "localhost:3000/api/sync/pull?since=1970-01-01T00:00:00Z"
curl -X POST -H "Authorization: Bearer <device token>" -d @sale.json localhost:3000/api/sync/sales   # run twice
```
**Expected:** pull returns only this store's rows and a cursor; a **second push of the same sale returns `duplicate`** and creates no second sale; a sale that drives stock negative is **recorded** with a `stock_conflict` notification; a bad device token → 401; reserve-numbers advances the device series without gaps.

### A-4.4 ⏳ A4.4 Browser offline database and sync engine
In devtools → Application → IndexedDB `mediflow-pos`: tables `medicines, batches, customers, pendingSales, numberBlocks, meta` exist and fill after the first sync (50k medicines in about 15 MB, paged).

### A-4.5 ⏳ A4.5 PWA shell
Install the app (browser *Install* icon). Check `/manifest.webmanifest` and the service worker in devtools.
**Expected:** installable; start page is the POS; after one online visit the POS shell loads with the network off.

### A-4.6 ⏳ A4.6 / A4.8 Offline billing drill (👤, the key test)
1. Online: open POS, wait for *Online · synced*.
2. Devtools → Network → **Offline**. Bill **3 sales** (one with split payment, one for an H1 medicine with compliance details). Reload the page. Bill a 4th.
3. Switch back **Online**.
4. Try offline: a sale **return**, a **credit** sale above the customer's last-known limit, loyalty redemption.

**Expected:** (2) the chip shows *Offline · N bills pending*; each bill prints with a number from the **device series** (≤ 16 chars, unique); the page survives the reload. (3) the badge falls to 0 within seconds and **4 sales** exist on the server with unique numbers, correct stock and balanced journals; no duplicates if you toggle online/offline repeatedly. (4) these are disabled/refused offline with an explanation. The automated version: `npx playwright test tests/e2e/offline.spec.ts`.

### A-4.7 ⏳ A4.7 Stock conflicts screen
Create a conflict (two devices sell the last strip, one offline). **Inventory → Conflicts** lists it with actions (adjust, transfer, change batch).

---

# PHASE 5 · Finance completeness (A5.1 – A5.6) ⏳

### A-5.1 ⏳ A5.1 Expenses
**Accounting → Expenses → New** (Rent ₹10,000 cash).
**Expected:** a balanced journal (Dr Rent, Cr Cash); P&L shows the expense; the day book lists it.

### A-5.2 ⏳ A5.2 Day book and ledgers
Open the **Day book** for a date and an account ledger.
**Expected:** every entry drills down to its source document; running balances; customer/supplier sub-ledgers filter by party; export needs `report.export`.

### A-5.3 ⏳ A5.3 Credit control and receivables ageing
1. Set a customer's credit limit ₹1,000; sell ₹1,500 on credit. 2. Open **Accounting → Receivables**.

**Expected:** (1) refused unless a manager overrides. (2) buckets 0-30 / 31-60 / 61-90 / 90+ days; *Send payment reminder* queues a WhatsApp message (Lane B outbox); a **family group** uses a pooled limit.

### A-5.4 ⏳ A5.4 Period lock
Lock last month (owner). Try to post a sale/receipt/expense dated in that month.
**Expected:** refused with *period is locked*; unlocking needs the owner.

### A-5.5 ⏳ A5.5 Opening balances and accounting invariants
`npx vitest run tests/integration/accounting-invariants.test.ts`
**Expected:** after 200 random operations (sales, returns, purchases, payments, transfers) the trial balance is **zero** and stock value per ledger = Σ batch qty × cost; opening-balance entries post once per party.

### A-5.6 ⏳ A5.6 Year-end
Run sales on 31 Mar and 1 Apr (test DB with an injected date). **Expected:** the series restarts at 000001 on 1 April; a closing-stock valuation report as of 31 March exists.

---

# PHASE 6 · Hardening & launch (A6.1 – A6.6) ⏳

### A-6.1 ⏳ A6.1 Observability
`curl localhost:3000/api/health` → `{ db: "ok", outboxBacklog: N, lastCronRun: ... }`. Force an error; it appears in the error tracker with a request id and **no patient data** in logs.

### A-6.2 ⏳ A6.2 Performance (seed 50k medicines, 200k batches, 1M movements)
**Expected (targets):** POS search p95 < 150 ms; sale commit p95 < 400 ms; report pages < 2 s; the k6 run with 20 concurrent cashiers shows no errors, and no duplicate/skipped invoice numbers.

### A-6.3 ⏳ A6.3 Deployment and backups
1. Push to `main`: the deploy workflow runs migrations then deploys to staging. 2. Follow `docs/runbooks/restore.md` to restore last night's backup into a scratch database.
**Expected:** staging works end to end; the restore drill succeeds and the row counts match.

### A-6.4 ⏳ A6.4 Security headers and review
`curl -I https://staging.../dashboard` shows CSP, `X-Frame-Options: DENY`, `Referrer-Policy`. `npm audit` shows no critical issues; `gitleaks detect` is clean.

### A-6.5 ⏳ A6.5 POS resilience
Throw an error inside the POS (devtools); the **cart survives** (restored from IndexedDB). Complete a bill with the keyboard only. Test print on an 80 mm thermal printer.

### A-6.6 ⏳ A6.6 Deprecated columns dropped
`\d medicines` has no `rack_id`; racks still work (per-store settings).

---

# Cross-lane integration tests

| ID | Status | What | Steps | Expected |
|---|---|---|---|---|
| X-1 | ✅ | Sale → GST document | Make a sale (A-1.20); `select * from gst_documents where ref_type='sale' order by created_at desc limit 1;` | One document with the sale's taxable/CGST/SGST totals. |
| X-2 | ✅ | Sale → loyalty points | Sale for a customer with an active loyalty config; `select points, balance_after from loyalty_transactions order by created_at desc limit 1;` | A row of type `earn`; a failure in this step never loses the sale (A-0.10). |
| X-3 | ⏳ | Loyalty redemption at POS | A-2.7 | Points deducted, bill reduced; reversed on cancel/return. |
| X-4 | ⏳ | Receipt via outbox | Sale with a customer phone while the WhatsApp provider is down | Sale completes instantly; `outbox_events` has a `whatsapp.receipt` row that is sent on the next cron run (B2.1). |
| X-5 | ⏳ | Inter-state sale | Sale to a customer with a GSTIN of another state (B1.2) | IGST only; `sales.is_inter_state=true`; GSTR-1 lists it under B2B. |
| X-6 | ⏳ | Prescription dispensing | Sell against a prescription (B1.4) | `prescription_items.quantity_dispensed` increases; status becomes `partially_dispensed`/`fully_dispensed`; more than prescribed is refused for H1/X. |
| X-7 | ⏳ | Supplier payment | B2.4 pays a supplier through `postPayment` (A2.9) | Balanced journal; bill settled; the payment appears for bank reconciliation. |
| X-8 | ⏳ | Transfer → GST | A-3.4 between two GSTINs | Tax invoice created by Lane B's `createGstDocumentFromTransfer`. |
| X-9 | ⏳ | Import → opening stock/balances | B4.4 | Opening stock via `recordStockMovement(opening)`; opening-balance journals via `postOpeningBalance`. |

---

# Appendix: handy commands

```bash
npm run db:reset                 # clean local DB + users
npm run db:migrate               # apply migrations + sync system roles
npm run db:seed-users            # (re)create role logins
npm run db:studio                # browse the DB
npm test                         # all tests    |  npx vitest run tests/unit   (no DB needed)
npm run typecheck && npm run lint:strict
NEXT_TELEMETRY_DISABLED=1 npx next build   # needs DATABASE_URL, APP_ENCRYPTION_KEY and CRON_SECRET to START (next start)
```
Production-mode run (`next start`) additionally needs `APP_ENCRYPTION_KEY` (any base64 string) and `CRON_SECRET` in `.env`; otherwise every page returns 500 with *Invalid environment variables*.

**Reporting a failure:** note the test ID, the role, the URL, what you expected and saw, plus the server console output.
