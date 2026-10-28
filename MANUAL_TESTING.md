# MediFlow Manual Testing Guide

The one guide for testing everything in MediFlow by hand: every screen, every flow, every business rule, every permission. It replaces the separate Lane A and Lane B guides.

- **Last verified against code:** 29 Oct 2026, branch `lane-a/overxpowered` after merging `origin/main` (Lane B PRs #12 and #13).
- **Automated checks at that point:** `typecheck` ✅ · `lint:strict` ✅ · `npm test` ✅ **28 files / 441 tests** (after A1.7).
- **Using the app rather than testing it?** Read [USER_MANUAL.md](USER_MANUAL.md).

---

## Contents

1. [How to use this guide](#1-how-to-use-this-guide)
2. [Setup (do this first)](#2-setup-do-this-first)
3. [Starter data](#3-starter-data)
4. [What is built, partial or missing](#4-what-is-built-partial-or-missing)
5. [Accounts, access and security](#5-accounts-access-and-security)
6. [Inventory](#6-inventory)
7. [Billing counter (POS) and sales](#7-billing-counter-pos-and-sales)
8. [Suppliers and purchases](#8-suppliers-and-purchases)
9. [Customers, loyalty, reps, schemes, orders](#9-customers-loyalty-reps-schemes-orders)
10. [Prescriptions and legal registers](#10-prescriptions-and-legal-registers)
11. [GST](#11-gst)
12. [Accounting and reports](#12-accounting-and-reports)
13. [WhatsApp, SMS, reminders, background jobs](#13-whatsapp-sms-reminders-background-jobs)
14. [AI assistant](#14-ai-assistant)
15. [Settings and external API](#15-settings-and-external-api)
16. [End-to-end scenarios](#16-end-to-end-scenarios)
17. [Not built yet: confirm it is absent](#17-not-built-yet-confirm-it-is-absent)
18. [Known issues (expected failures)](#18-known-issues-expected-failures)
19. [Developer and automated checks](#19-developer-and-automated-checks)
20. [Result sheet and reporting](#20-result-sheet-and-reporting)

---

## 1. How to use this guide

### 1.1 Test format
Every test has an **ID**, a one-line **goal**, the **role** to log in as, **steps**, and **expected results**. Work top to bottom inside a section; later tests reuse data from earlier ones.

```
### POS-2 · Cash sale                              ← ID and title
Goal: a normal bill updates stock, numbering and accounts.
Role: cashier
Steps:  1. … 2. …
Expect: • … • …
```

### 1.2 Marks
| Mark | Meaning |
|---|---|
| ✅ | Built. It should pass. |
| 🟡 | Partly built, or the backend exists but nothing in the app uses it yet. The test says what to expect today. |
| ❗ | **Known bug.** The test describes correct behaviour; today it is expected to fail. A pass means someone fixed it. |
| ⏳ | **Not built.** Don't test it; only confirm it's absent (§17). |

### 1.3 Perspectives
- 👤 **User test:** done in the browser as a role.
- 🛠 **Dev check:** a command, SQL query or automated test. Skip these if you only test through the UI.

### 1.4 Recording results
Write **PASS**, **FAIL** (what you saw), or **BLOCKED** (why) in the sheet in §20. A failure on a ❗ item that matches its description is a *known* issue, not a new bug.

### 1.5 Tips
- Use **one private window per role** so sessions don't overwrite each other.
- `npm run db:reset` brings you back to a clean state in about 20 seconds.
- Money is stored as integer paise; the screen shows rupees. Percentages are stored as basis points (500 = 5%).

---

## 2. Setup (do this first)

### 2.1 Start everything
```bash
docker start mediflow-db            # host-network DB on port 5433 (or: docker compose up -d db)
npm install
cp .env.example .env                # first time only. DATABASE_URL must match your DB port (5433 here)
cp .env.test.example .env.test      # for automated tests; DB name must contain "test"
npm run db:migrate                  # after every pull: applies migrations 0000–0005, heals roles
npm run db:reset                    # OR: wipe LOCAL db, migrate, seed owner + 7 role logins
npm run dev                         # http://localhost:3000
```
Optional `.env` keys: `GEMINI_API_KEY` / `GROQ_API_KEY` (AI), `EINVOICE_MODE=simulator`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `APP_ENCRYPTION_KEY`, `CRON_SECRET`.

If the login page shows *Failed query … AggregateError*, the database isn't reachable: start the container and check the port in `DATABASE_URL`.

### 2.2 Test accounts (created by `db:reset` / `db:seed-users`)
| Role | Email | Password |
|---|---|---|
| Owner | `admin@apollo.com` | `admin123` |
| Store Manager | `manager@apollo.com` | `manager123` |
| Pharmacist | `pharmacist@apollo.com` | `pharmacist123` |
| Cashier | `cashier@apollo.com` | `cashier123` |
| Purchase Manager | `purchase_manager@apollo.com` | `purchase_manager123` |
| Accountant | `accountant@apollo.com` | `accountant123` |
| Auditor | `auditor@apollo.com` | `auditor123` |

### 2.3 Health check (🛠, 1 minute)
```bash
npm run typecheck && npm run lint:strict && npm test
```
**Expect:** all exit 0; `Test Files 28 passed`, `Tests 441 passed` (numbers grow; "no failures" is what matters).

### 2.4 Real medicines (optional)
```bash
npx tsx scripts/fetch-dataset.ts && npx tsx scripts/seed-dataset.ts && npx tsx scripts/generate-stock.ts
```
Otherwise create the few items in §3 by hand.

---

## 3. Starter data

Create this once; the tests refer to these names. **Do step 0 first.**

**0. Fix the store's state (important).** Log in as **owner → Settings**. Set **State code = `27`** and **GSTIN = `27GSPTE0985F1Z5`** (a valid Maharashtra GSTIN), drug licence `DL-TEST-1`, bill prefix `INV`. Save.
> The seeded store uses the text `MH` as its state, but tax logic compares 2-digit codes. Without this step an intra-state purchase may wrongly come out as IGST.

**Items** (Inventory → Item master → New item; GST 5% unless stated; MRP = sale price):
| Short name | Name | Schedule | MRP | Notes |
|---|---|---|---|---|
| **PARA** | `Test Para 650` | None | ₹105 | generic `Paracetamol 650 mg`, HSN `30049099` |
| **AZI** | `Azithro Test 500` | **H1** | ₹210 | generic `Azithromycin 500 mg` |
| **COUGH** | `Cough Test Syrup` | **H** | ₹60 | |
| **OLD12** | `Old Rate Tab` | None | ₹100 | create at 5%, then run `update medicines set gst_rate_bp=1200 where name='Old Rate Tab';` and set HSN `3004…` (used in the re-rate test) |
| **NOSTOCK** | `No Stock Tab` | None | ₹50 | never add stock |

**Stock** (Inventory → Batches & stock → Opening stock, as owner/manager):
| Item | Batch | Expiry | Qty | Purchase rate |
|---|---|---|---|---|
| PARA | `P1` | 1 year ahead | 100 | ₹60 |
| PARA | `P0` | ~20 days ahead | 10 | ₹60 |
| AZI | `A1` | 1 year ahead | 30 | ₹120 |
| COUGH | `C1` | 1 year ahead | 30 | ₹35 |
| OLD12 | `O1` | 1 year ahead | 20 | ₹60 |
| PARA | `PX` | **expired**: create with any future date, then `update batches set expiry_date=current_date-1 where batch_no='PX';` | 5 | ₹60 |

**People**
| Name | Where | Details |
|---|---|---|
| **S1** `Same State Distributors` | Directory → Suppliers → New | GSTIN `27GSPTE0985F1Z5`, credit days 30 |
| **S2** `Other State Pharma` | same | GSTIN `24AAACC1206D1ZM` (Gujarat) |
| **Ravi** | Directory → Customers → Add | phone `9876543210` |
| **Clinic** `Shree Clinic` | same | GSTIN `33AABCT1332L1ZL` (Tamil Nadu) |
| **Dr Verma** | Compliance → Doctor master | reg no `MCI-2018-9921` |
| **Rep Rahul** | Directory → Medical reps | company `Sun Pharma`, commission `2`% |

---

## 4. What is built, partial or missing

| Area | Status | Notes |
|---|---|---|
| Login, register, sessions | ✅ | No lockout, no change-password, no invites (⏳) |
| Roles & permissions (all pages/actions) | 🟡 | Lane A and most Lane B guarded. Gaps: API-keys page/actions, Omnichannel orders pages, a few actions (§18) |
| Item master, racks, batches, opening stock, bulk import, schemes | ✅ | No stock-adjust screen (⏳) |
| POS: search, cart, discount, one payment method, H/H1/X compliance, print | ✅ | No split tender, hold, cancel, returns, cash shift (⏳) |
| Sale side-effects: stock ledger, numbering, journal, GST doc, register, loyalty, inter-state IGST, receipt queued in the outbox | ✅ | Built as one reusable service (`createSale`, A2.1) |
| Suppliers, purchase (GRN) with landed cost, IGST, server totals | ✅ | No purchase orders/returns/payments (⏳) |
| Customers, family groups, loyalty earn + adjust, medical reps, omnichannel & promise orders | ✅ | Redeem points at POS ⏳ |
| Compliance registers, doctors, prescriptions, printable register | ✅ | Sales call prescription dispensing when a prescription id is sent, but the POS screen has no prescription picker yet 🟡 |
| GST pages, GSTR-1 JSON, re-rate tool | ✅ | E-invoice is a **simulator** only; no "SIMULATED" badge ❗ |
| Audit log screen (who changed what: stock, store settings, medicines, discount overrides) | ✅ | Role/membership and login rows arrive with A1.4 / A1.5 |
| Receipts: record money from a customer against unpaid bills; `postPayment` for supplier/expense payments | ✅ | Customer receipts have a screen; supplier payments have no screen yet (Lane B, B2.4). Credit sales are not possible at the POS yet (A2.2) |
| Accounting statements, bank reconciliation | ✅ | No expenses, payment vouchers, period lock (⏳) |
| WhatsApp/SMS settings, templates, inbox, reminders (simulated) | ✅ | Outbox + cron built; reminders and sale receipts use the outbox. Nothing runs the cron on a schedule yet 🟡 |
| API keys + `/api/v1/*` | 🟡 | Works; the key-management page lacks a permission check ❗ |
| AI assistant | ✅ | Needs an AI key; permission enforced |
| Multi-store, offline POS, import wizard, expenses, real e-invoice, … | ⏳ | §17 |

---

## 5. Accounts, access and security

### AUTH-1 · Sign in, wrong password, redirect ✅
Goal: basic login works and protects pages.
1. Logged out, open `/dashboard`.
2. Sign in as `admin@apollo.com` with a **wrong** password.
3. Sign in with the right password.
4. While signed in, open `/login`.

Expect: (1) redirected to `/login?redirect=…`; (2) *Invalid email or password* (same message for unknown email); (3) lands on `/dashboard`; (4) redirected to `/dashboard`.

### AUTH-2 · Register a new pharmacy ✅
1. Log out, open `/register`, create **Test Pharmacy 2** with a new email.
2. Open **Settings**, **Accounting**, **New bill**.
3. Register again with the same email; also try empty fields.

Expect: (2) all open: you are **Owner** with all 38 permissions; the new pharmacy has no items or stock. (3) refused with a message.
🛠 `select r.key, count(*) from roles r join role_permissions rp on rp.role_id=r.id where r.tenant_id=(select id from tenants where name='Test Pharmacy 2') group by r.key;` → the 7 roles.

### AUTH-3 · Session handling ✅
1. Delete the `mediflow_session` cookie in devtools; reload `/dashboard/accounting`.
2. Check the cookie flags (`HttpOnly`).
3. 🛠 `select id from sessions limit 1;`

Expect: (1) redirect to `/login`, no crash. (2) `HttpOnly`. (3) a 64-hex id that is **not** the cookie value (only a hash is stored).

### AUTH-4 · Logout ✅
Press the **Sign out** icon (bottom of sidebar). Expect: redirected to login; `/dashboard` now requires sign-in again.

### RBAC-1 · "No access" page ✅
Role: cashier. Open `/dashboard/accounting` and `/dashboard/settings`.
Expect: *"You don't have access to this page"* with **Back to dashboard**; the Network tab shows **403**; no crash or blank page.

### RBAC-2 · Page access matrix ✅
Log in as each role and open each URL. **✓** opens, **403** shows the no-access page. (Generated from the real role templates.)

| URL (permission) | owner | mgr | pharm | cashier | purch | acct | audit |
|---|---|---|---|---|---|---|---|
| `/dashboard` (dashboard.view) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/sales`, `/sales/<id>`, `/sales/<id>/print`, `/sales/promise-orders` (sale.view) | ✓ | ✓ | ✓ | ✓ | 403 | ✓ | ✓ |
| `/sales/pos` (sale.create) | ✓ | ✓ | ✓ | ✓ | 403 | 403 | 403 |
| `/inventory`, `/inventory/batches` (medicine.view / inventory.view) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/inventory/new`, `/settings/racks` (medicine.manage) | ✓ | ✓ | ✓ | 403 | ✓ | 403 | 403 |
| `/inventory/batches/new`, `/inventory/import` (inventory.adjust) | ✓ | ✓ | 403 | 403 | 403 | 403 | 403 |
| `/accounting` and sub-pages incl. bank-reconciliation (accounting.view) | ✓ | ✓ | 403 | 403 | 403 | ✓ | ✓ |
| `/purchases`, `/purchases/<id>`, `/settings/schemes` (purchase.view) | ✓ | ✓ | 403 | 403 | ✓ | ✓ | ✓ |
| `/purchases/new` (purchase.create) | ✓ | ✓ | 403 | 403 | ✓ | 403 | 403 |
| `/suppliers` (supplier.view) | ✓ | ✓ | ✓ | 403 | ✓ | ✓ | ✓ |
| `/suppliers/new` (supplier.manage) | ✓ | ✓ | 403 | 403 | ✓ | 403 | 403 |
| `/customers`, `/customers/groups`, `/customers/<id>/loyalty`, `/settings/medical-reps` (customer.view) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/customers/new`, `/settings/loyalty`, `/whatsapp`, `/reminders` (customer.manage) | ✓ | ✓ | ✓ | ✓ | 403 | 403 | 403 |
| `/compliance`, `/schedule-h`, `/schedule-h1`, `/narcotics`, `/<register>/print` (report.view) | ✓ | ✓ | 403 | 403 | ✓ | ✓ | ✓ |
| `/compliance/prescriptions`, `/compliance/doctors` (prescription.approve) | ✓ | ✓ | ✓ | 403 | 403 | 403 | 403 |
| `/gst` and every sub-page incl. `/gst/rates` (gst.view) | ✓ | ✓ | 403 | 403 | 403 | ✓ | ✓ |
| `/reports` and sub-pages (report.view) | ✓ | ✓ | 403 | 403 | ✓ | ✓ | ✓ |
| `/settings`, `/settings/sms`, `/settings/whatsapp`, `/whatsapp/templates` (settings.manage) | ✓ | 403 | 403 | 403 | 403 | 403 | 403 |
| `/settings/audit` (audit.view) | ✓ | ✓ | 403 | 403 | 403 | 403 | ✓ |
| `/accounting/receipts` (accounting.post) | ✓ | ✓ | 403 | 403 | 403 | ✓ | 403 |
| ❗ `/orders`, `/orders/<id>`, `/settings/api-keys` (no check) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Expect: every cell matches, except the last row, which is a known gap (the correct result would be 403 for roles without `sale.view` / `api_key.manage`). Record what you see.

### RBAC-3 · The menu hides what you can't use ✅
Log in as each role, count the sidebar links (not the logo), and press **Ctrl+K**, typing `purchase`.

| Role | Links | Settings link |
|---|---|---|
| owner | **33** | yes |
| manager | 33 | no |
| pharmacist | 17 | no |
| cashier | **13** | no |
| purchase_manager | 14 | no |
| accountant | 24 | no |
| auditor | 24 | no |

Expect: counts match. The cashier's palette has **no** *Record purchase*; the owner's does. Accountant and auditor see *GST & Tax* and *Finance* but no *New bill*.

### RBAC-4 · Permission counts per role 🛠
```sql
select r.key, count(rp.*) from roles r left join role_permissions rp on rp.role_id=r.id group by r.key order by 1;
```
Expect: `accountant 12 · auditor 11 · cashier 9 · manager 32 · owner 38 · pharmacist 15 · purchase_manager 13` per pharmacy (update this line if a role template changes).

### RBAC-5 · Roles heal themselves 🛠
1. `delete from role_permissions where permission='medicine.view' and role_id=(select id from roles where key='cashier' limit 1);` → cashier gets the no-access page on Item master.
2. `npm run db:migrate` → prints `✓ system roles synced for N tenant(s)`; the page opens again.
3. Delete **all** owner permissions, try `/dashboard/settings` (blocked), run `db:migrate`, retry (opens; owner has 38).

### RBAC-6 · Server-side enforcement 🛠
`npx vitest run tests/integration/lane-a-permissions.test.ts tests/integration/lane-b-permissions.test.ts tests/integration/rbac.test.ts`
Expect: pass. Each action is refused for a user with **no** permissions and allowed with exactly its permission; a suspended member, an empty allowed-store list, or a session from another pharmacy is refused; the auth context never contains a password hash.

### RBAC-7 · Friendly errors 🛠
Read `src/server/action.ts`. Expect: expected failures (`DomainError`) show their own message; anything else is logged as `[server action]` and the user sees *Something went wrong. Please try again.* (never a stack trace or SQL).

### RBAC-8 · Exports and AI need permission ✅
1. As **cashier** open `/api/export/sales`, `/api/export/purchases`, `/api/export/batches`.
2. As **owner/manager/accountant** open them.
3. As a role without `ai.use` (cashier, accountant, auditor) open the AI panel (`Ctrl+J`) and ask anything.
4. Logged out: `curl -i -X POST localhost:3000/api/chat -d '{}'`.

Expect: (1) JSON `Forbidden: Export requires 'report.export' permission.` (2) CSV downloads (only roles with `report.export`: owner, manager, accountant). (3) *Forbidden: AI assistant access requires 'ai.use' permission.* (4) **401** JSON, not a redirect.

### RBAC-9 · Tenant isolation ✅ 🛠 / 👤
1. Register a second pharmacy (AUTH-2). Log in there and open Item master, Customers, Suppliers, Sales, Purchases, Reports, Audit log.
2. Try opening an invoice URL of pharmacy 1 (`/dashboard/sales/<id>`), a supplier and a purchase by id.

Expect: (1) only that pharmacy's own (empty) data. (2) not found / no data.
🛠 `npx vitest run tests/integration/isolation.test.ts`: pharmacy B is signed in as an **owner** (so a refusal can only be isolation, not missing rights) and attacks pharmacy A in three ways: it reads about 30 lists (medicines, customers, suppliers, purchases, sales, registers, orders, reminders, WhatsApp, SMS, bank statements, GST, dashboard, API keys…), it reads and changes about 28 records by A's ids (sales, purchases, suppliers, customers, loyalty, orders, schemes, reps, prescriptions, reminders, bank lines, API keys, e-invoices, racks, stock adjustments, opening stock…), and it tries to create its own records pointing at A's category, manufacturer or rack. Expect: no response contains A's data (a marker string), and a snapshot of A's data is identical afterwards.
✅ Fixed while writing this suite (Lane A): `adjustBatchStock` could change **another pharmacy's** batch, `addOpeningStock` accepted another pharmacy's medicine, and `createMedicine` accepted another pharmacy's category/manufacturer/rack. All three are now refused, and `recordStockMovement` also scopes its row lock by pharmacy and store.
🛠 `npx vitest run tests/integration/racks-actions.test.ts` covers cross-store access for racks.

### RBAC-10 · Every action must check a permission 🟡 🛠
`npx vitest run tests/unit/action-guards.test.ts`
Expect: pass. The test reads every exported server action and fails if one has no permission check, unless it is listed as public by design (sign-in, register, logout, a server-only order helper) or as a **known gap**. Known gaps today (all Lane B, listed in the test with a reason): `enrichMedicineDetails` (**no authentication at all**, anyone could call the AI provider through it), and login-only: `api-keys` (3), `bank-reconciliation` (7), `external-orders` (4), `medical-reps` (4), `promise-orders` (3), `schemes` (5), `inventory-import`, and two GST reads (`getGstRateDistribution`, `previewGstRerate`). When Lane B fixes one, it must delete its line from the test: the last check fails while a listed action is already guarded. Not visible in the UI (see §18).

---

## 6. Inventory

### INV-1 · Create a medicine with the GST 2.0 default ✅
Role: owner. **Inventory → Item master → New item.**
1. Open the form. Check the **GST rate** dropdown without touching it.
2. Fill the sections *Identification*, *Pricing & tax*, *Packaging & compliance*, *Storage location* for PARA (see §3). Save.
3. 🛠 `select name, gst_rate_bp from medicines where name='Test Para 650';`
4. In devtools change an `<option value>` to `7` and save.

Expect: (1) preselected **5% — Most medicines (GST 2.0)**; other options 0% Exempt, 12%, 18%, 28%. (2) item appears in the list. (3) `gst_rate_bp = 500`. (4) *Choose a valid GST rate…*
Also check: the category/manufacturer fields accept a **new** name; the Schedule options are None (OTC), H, H1, X, Narcotic.

### INV-2 · Item master list ✅
Roles: any with `medicine.view`. Search by name, composition, barcode.
Expect: columns **Item, Category, Rack, Pack, HSN / GST, MRP, Sale price, Status**; the list narrows as you type; empty search shows everything; no results shows an empty state.

### INV-3 · Racks and shelves ✅
Role: pharmacist. **Inventory → Racks & shelves → Add Rack / Shelf.**
1. Code `r1-s2`, name `Front shelf` → save.
2. Add `R1-S2` again.
3. Save with an empty code.
4. Edit the name; delete the rack (confirm).
5. Search by code or name.
6. Log in as **cashier** and open `/dashboard/settings/racks`.

Expect: (1) saved as **R1-S2**. (2) *Rack code 'R1-S2' already exists in this store.* (3) *Rack code is required (e.g. R1-S2).* (4) rename shows; delete asks to confirm and removes the row (medicines on it become unassigned). (6) 403.
🛠 `npx vitest run tests/integration/racks-actions.test.ts`.

### INV-4 · Opening stock ✅
Role: manager. **Batches & stock → Opening stock.** Add batch `P1` for PARA (qty 100, rates entered).
Expect: batch appears with quantity 100. 🛠 a `stock_movements` row of type `opening` with `balance_after=100`.
Also: pharmacist/cashier opening `/dashboard/inventory/batches/new` → 403.

### INV-5 · Stock ledger rule 🛠
After any stock change, run:
```sql
select b.id from batches b where b.qty_on_hand <> (select coalesce(sum(qty_change),0) from stock_movements m where m.batch_id=b.id);
```
Expect: **no rows** (every batch's quantity equals the sum of its movements).

### INV-6 · Batches & stock page ✅
Open **Inventory → Batches & stock**.
Expect: top cards **Active batches**, **Stock valuation**, **Expiring ≤ 90 days**; columns **Item, Batch, Expiry, PTR, MRP, Value, On hand**; the **Near expiry** tab (or `?nearExpiry=true`) shows `P0` (≈20 days) and not `P1`; the expired `PX` shows a red **Expired** badge; date filter and **Export** work for roles with export.

### INV-7 · Bulk CSV import ✅
Role: manager. Make a CSV:
```
Medicine,Batch,Expiry,Qty,MRP,Purchase Rate
Test Para 650,IMP1,12/27,40,105,60
Test Para 650,,12/27,10,105,60
Test Para 650,IMP3,13/27,10,105,60
Test Para 650,IMP4,12/27,0,0,60
```
**Inventory → Bulk import**, drop the file.
Expect: row 1 valid (expiry `12/27` becomes the last day of Dec 2027); row 2 **error** *Missing Batch Number*; row 3 **error** *Invalid Expiry Format*; row 4 **warnings** *Quantity is 0*, *MRP is 0*. After import, valid rows exist as batches. Pharmacist/cashier → 403. Headers match loosely (`Item`, `Lot`, `Stock`, `Retail` also work). The optional AI "enrich" step needs an AI key.

### INV-8 · Trade schemes ✅
Role: purchase manager. **Inventory → Trade schemes → New scheme.** Title `Buy 10 Get 1`, free-quantity type, scope = medicine PARA, buy 10, free 1, dates optional. Save, then delete.
Expect: listed with **Scheme Name, Applicability, Terms, Validity, Status**; scope choices medicine / category / supplier each show the matching picker; delete removes it. Cashier → 403.
🟡 A 25 Oct automated run reported the new scheme didn't appear in the list: check this one carefully.

### INV-9 · Search: expired and out-of-stock batches ✅
Role: cashier, in the POS (see POS-1 for the screen).
Expect: searching `Test Para` offers `P1` and `P0` but **never** `PX` (expired); `No Stock Tab` shows an **Out of Stock** badge.

---

## 7. Billing counter (POS) and sales

Role for these tests: **cashier** unless stated. Open **New bill** (F2).

### POS-1 · Screen and shortcuts ✅
Expect: the heading **POS Billing Counter**; left: search + bill table (**Item & Batch, Qty, Rate, Disc %, Total**); right: **Customer**, doctor/Rx section, summary, **Payment Method** (Cash / UPI / Card), **Complete & Print**.
| Key | Does |
|---|---|
| `F2` | clear / new bill (asks to confirm) |
| `F3` or `Ctrl+F` | focus search |
| `F4` | quick-add customer window |
| `↑ ↓ Enter` | pick a search result |
| `Esc` | close modal / results |
| fast digits + `Enter` | barcode scan adds the item |
The speaker icon toggles beeps. **`F6`/`F7`/`F8` must do nothing** (hold/payment are ⏳).

### POS-2 · A complete cash sale and its side-effects ✅
1. Search `para`; add **P1**, qty 2 (PARA at ₹105). Payment **Cash**. **Complete & Print**.
2. Open **Sales & invoices** → the invoice → **Print Thermal 80mm Slip**.

Expect:
- Total = 2 × ₹105 = **₹210**; summary shows Subtotal, Discount, Taxable Value, GST, Round Off, **Net Payable ₹210**.
- Invoice number like `INV/26-27/000001` (16 characters).
- Batch and expiry on each invoice line; print view opens.

🛠 Check the side-effects:
```sql
select qty_on_hand from batches where batch_no='P1';                               -- 98
select type, qty_change, balance_after from stock_movements order by created_at desc limit 1;  -- sale, -2, 98
select * from gst_documents order by created_at desc limit 1;                      -- one document for this sale
select sum(debit)-sum(credit) from journal_lines where entry_id=(select id from journal_entries order by created_at desc limit 1);  -- 0
```

### POS-3 · Tax arithmetic 🛠/👤
Prices include GST.
- **₹105 at 5%** → taxable **₹100**, CGST **₹2.50**, SGST **₹2.50**.
- Bill 10 × PARA (₹1,050): taxable ₹1,000, CGST ₹25, SGST ₹25.
- Bill 3 units: the summary's taxable + CGST + SGST must equal the gross; **Round Off** brings Net Payable to a whole rupee.
🛠 `npx vitest run tests/unit/money.test.ts`. Cross-check the DB: `select taxable_amount, cgst, sgst, igst, total_amount from sales order by created_at desc limit 1;`

### POS-4 · Discounts ✅
1. Put 2 × PARA in the cart; set **Disc %** = 10 on the line.
2. Try −5 and 150.
3. Complete the first one.

Expect: (1) Discount, Taxable and Net Payable update live (2 × ₹105 = ₹210 → ₹189 after 10%; taxable = payable ÷ 1.05). (2) clamped to 0–100 or rejected; never a negative bill. (3) saved with the discount.
🛠 Invalid input is refused server-side: `npx vitest run tests/integration/sale-resilience.test.ts -t "rejects"`: negative/fractional discount, discount above 100%, zero/negative/fractional quantity, negative amount paid all fail with a clear message and **nothing is written**.

### POS-5 · Maximum discount (approval) ✅
1. `update tenants set settings = '{"maxDiscountBp": 1000}'::jsonb;` (10%).
2. As **cashier**, discount 15% → complete. Then 10% → complete.
3. As **owner**, discount 15%.
4. Reset: `update tenants set settings = '{}'::jsonb;`

Expect: (2) 15% blocked with *Discounts above 10% need a manager's approval (permission "sale.discount_override")* and no sale; 10% passes. (3) passes **and leaves an audit row** (`discount_override`, see AUD-2); a discount within the limit leaves none. With no ceiling set, any 0–100% works. (There is no settings screen for this limit yet.)

### POS-6 · Stock protection ✅
1. Add more PARA `P1` than available (e.g. qty 500).
2. Complete.
3. Search `Test Para` and look for `PX`.

Expect: (2) *Insufficient stock for … Available: N*; stock unchanged; no invoice. (3) `PX` (expired) is never offered.

### POS-7 · Substitutes and promise orders ✅
1. Search `No Stock Tab`.
2. Click the **substitutes** (find other brands) icon.
3. Click the **record patient demand** icon; fill **Patient / Customer Name**, **Mobile Number**, **Quantity Needed**, notes → save.

Expect: (2) a window listing in-stock items with the same composition, or *No alternate brands currently in stock*. (3) the request appears in **Operations → Promise orders** (see CRM-7).

### POS-8 · Customer and quick add ✅
1. Open the **Customer** box: choose **Walk-in Customer** and bill; then pick **Ravi**.
2. Press **F4**, add `Sunil Kumar`, phone `9876543210`.

Expect: (1) invoice shows the customer; (2) the new customer appears in Directory → Customers and is selectable.

### POS-9 · Schedule H and H1 compliance ✅
Role: pharmacist.
1. Cart: COUGH (Schedule H) only → complete without a doctor.
2. Enter a doctor name → complete.
3. Cart: AZI (Schedule H1) with doctor name only → complete.
4. Fill doctor name, reg no `MCI-2018-9921`, Rx slip/ref `RX-1`, patient name, age & gender, full address → complete.
5. Open **Compliance → Schedule H1 (Form 35)** and the H register.

Expect: (1) blocked: *Doctor's name is mandatory for Schedule H / Prescription (Rx) medicines in this bill.* (2) succeeds. (3) blocked: *Doctor Medical Council Registration Number is mandatory for Schedule H1 / Schedule X drugs under D&C Rules.* (4) succeeds. (5) a register row per sale with date and bill, medicine and batch, quantity, patient, doctor and pharmacist; 🛠 `select count(*) from dispensing_logs;` grows by 1 per scheduled sale. The compliance warning (amber panel) appears as soon as a scheduled item enters the cart.

### POS-10 · Medical rep on a bill ✅
Pick **Rep Rahul** under *Medical Rep / Consultant*, bill ₹1,000 worth, then open **Finance → MR commissions**.
Expect: a row for the invoice with rate 2% and commission ₹20 (2% of the eligible sale amount).

### POS-11 · Optional steps never lose a sale 🛠
`npx vitest run tests/integration/sale-resilience.test.ts`
Expect: pass, including *a failing GST-document step does NOT take the sale down* and *a failing loyalty step…*. (Postgres would normally abort the whole transaction; savepoints prevent it.)

### POS-12 · Invoice numbers ✅/🛠
1. Make 3 bills in a row.
2. 🛠 `npx vitest run tests/integration/sequence.test.ts tests/unit/invoice-no.test.ts`

Expect: numbers are consecutive, per store, per financial year (`…/26-27/000001`, `000002`, `000003`), length ≤ 16. Tests cover: 50 parallel bills get 50 distinct consecutive numbers; the series restarts on 1 April; a too-long number is refused (`INVOICE_NO_TOO_LONG`).

### POS-13 · Sales list, detail and print ✅
Open **Operations → Sales & invoices**.
Expect: search by invoice no. or customer; columns **Invoice, Customer, Prescribed by, Amount, Status, Actions**; **View Invoice Details** shows **Billed Medicines** (item & composition, batch/expiry, taxable, total); the print slip prints; purchase manager gets 403; **Export** works only for owner/manager/accountant.

### POS-14 · Concurrency 🛠
`npx vitest run tests/integration/stock.test.ts`
Expect: pass: two cashiers each selling 6 of 10 units → exactly one succeeds; 20 parallel single-unit sales of a 12-unit batch sell exactly 12; the ledger always adds up. To see the tests have teeth: temporarily remove `.for("update")` in `src/server/domain/stock.ts`, re-run (two tests must fail), then `git checkout src/server/domain/stock.ts`.

### POS-15 · Inter-state tax on a sale ✅
Role: cashier. Bill ₹1,050 of PARA to the **Clinic** customer (GSTIN `33AABCT1332L1ZL`, another state), then to a customer with GSTIN `27GSPTE0985F1Z5` (same state), then to **Ravi** (no GSTIN).
Expect: Clinic → **IGST ₹50 only**, no CGST/SGST; same-state GSTIN → CGST ₹25 + SGST ₹25; Ravi → CGST + SGST even if his state is another state (a customer without a GSTIN is always intra-state).
🛠 `select is_inter_state, cgst, sgst, igst from sales order by created_at desc limit 3;` and the GSTR-1 B2B table lists the Clinic sale.
Edge: if the store's state is not a 2-digit code (the seed uses `MH`) and the store has no GSTIN, the sale is billed intra-state rather than guessed (do §3 step 0 to get correct IGST). `npx vitest run tests/integration/create-sale.test.ts -t "tax context"` covers all cases.

### POS-16 · Double-click safety 🛠
`npx vitest run tests/integration/create-sale.test.ts -t idempotency`
Expect: pass: the same `clientSaleId` sent twice (even in parallel) creates exactly one sale and one stock deduction. (The POS screen does not send an id yet; held bills and offline sync will.)

---

## 8. Suppliers and purchases

### PUR-1 · Create a supplier ✅
Role: purchase manager. **Directory → Suppliers → New supplier.** Create **S1** and **S2** (§3).
Expect: sections *Basic information*, *Statutory* (GSTIN, drug licence), *Trade terms*; the list shows **Supplier, Contact, GSTIN, Drug licence, Address, Status** and searches by name/phone/GSTIN. Cashier → 403 on the list; pharmacist can view but not create (403 on *New supplier*).

### PUR-2 · Record a purchase with free quantity and landed cost ✅
1. **Purchases → Record Purchase Invoice (GRN).**
2. Supplier **S1**, **Supplier Bill / Invoice No** `SB-001`, **Invoice Date** today.
3. Line: PARA, batch `PB1`, expiry next year, qty **100**, free **10**, rate **₹60** (excl. GST), MRP ₹105, GST 5%. Check the **GRN Invoice Summary**. Save.
4. Open the purchase detail page.
5. Record the **same supplier + invoice no.** again.

Expect:
- (3) a new batch `PB1` with quantity **110** (qty + free).
- Taxable ₹6,000, **CGST ₹150 + SGST ₹150**, no IGST (S1 is in your state).
- (4) *Inward Medicine Batches* lists the line (billed qty, free qty, rate, MRP, GST %, total).
- (5) refused as a duplicate (unique per supplier + invoice number).

🛠 Landed cost: `select qty_on_hand, purchase_rate from batches where batch_no='PB1';` → `110`, **`5455`** paise (₹6,000 ÷ 110 = ₹54.55), **not** 6000. `select unit_cost from stock_movements order by created_at desc limit 1;` also 5455.
🛠 Journal: a balanced purchase entry (Dr Purchases + Input GST, Cr Supplier) in the day book; a `gst_documents` row.

### PUR-3 · Inter-state purchase (IGST) ✅
Record a purchase from **S2** (Gujarat) for the same numbers.
Expect: **IGST ₹300 only**, no CGST/SGST. (If you skipped §3 step 0 and the store state is `MH`, this behaves wrongly: fix the state first.)

### PUR-4 · Server decides the totals ✅/🛠
`npx vitest run tests/integration/purchase-totals.test.ts tests/unit/purchases.test.ts`
Expect: pass: a request with wrong `taxableAmount`/`totalAmount`/discount cannot change what is stored; the journal always equals the recomputed total; negative quantity/rate and GST rates outside the allowed list are rejected; a "10 + 1" deal gives unit cost = taxable ÷ 11.

### PUR-5 · Purchases list and export ✅
Expect: columns **Supplier invoice, Date, Supplier, Taxable, GST, Total, Status**; search by invoice number/supplier; the trash icon removes a line on the form; **Export** CSV for owner/manager/accountant only. Pharmacist and cashier get 403; accountant and auditor can view but **not** create.

---

## 9. Customers, loyalty, reps, schemes, orders

### CRM-1 · Customers ✅
**Directory → Customers → Add customer.** Create **Ravi** and **Clinic**.
Expect: sections *Contact*, *Billing & credit* (GSTIN, credit limit), *Notes*; typing the GSTIN auto-fills the **state** from its first two digits; the list shows **Customer, Phone, Loyalty Points, Credit limit, Status** and searches by name/phone/email; the points icon opens the ledger. Roles: cashier/pharmacist can add; purchase manager/accountant/auditor get 403 on *Add customer* but can view the list.
🟡 The 25 Oct automated run couldn't find the name input here; confirm the form loads and saves.

### CRM-2 · Family groups ✅
**Directory → Family groups.** *Create Family Group*: `Sharma Family`, pooled limit `10000`. *Add Member to Household*: Ravi and a second customer.
Expect: members listed; **Consolidated Family Bill History** shows invoices for both. (Pooled credit isn't enforced anywhere yet since credit sales don't exist.)

### CRM-3 · Loyalty setup and earning ✅
1. **Directory → Loyalty rewards:** enable; earning ratio **1** per ₹100, redemption value ₹1, minimum 10 points. Save and reload.
2. As **cashier**, bill **₹1,250** worth of PARA to Ravi.
3. Open Ravi's points ledger.

Expect: (1) values persist. (2) Ravi earns **12 points** (floor(1250 ÷ 100)). (3) an *earn* row with *Balance After* = 12; the customer list shows 12. 🛠 `select points, balance_after from loyalty_transactions order by created_at desc limit 1;`
Billing an item with no customer, or for a pharmacy with loyalty disabled, earns nothing and never blocks the sale.

### CRM-4 · Adjust points ✅
On Ravi's ledger: **Adjust Loyalty Points** `+50`, reason "Welcome bonus"; then `-5`.
Expect: balance 62, then 57; each has an *adjust* row with the reason and **Balance After**; an audit row is written (🛠 `select action, entity_type, reason from audit_logs order by created_at desc limit 2;`). Deducting more than the balance should be refused.

### CRM-5 · Loyalty logic 🛠
`npx vitest run tests/unit/loyalty.test.ts`. Expect pass: earning is floor(amount ÷ 100) × ratio; redeem/reverse service rules (not above balance, not below minimum) are correct.
🟡 **Redemption at POS is not available** (⏳): confirm the POS has no points-redeem field.

### CRM-6 · Medical reps ✅
**Directory → Medical reps (MR).** Add Rahul (2%). Edit/deactivate if available.
Expect: listed with company and rate; used in POS-10; visible to every role with `customer.view`.

### CRM-7 · Promise orders ✅
Create one from POS-7 and another via **Promise orders → New**. In the list, search; use the icons **Mark as PO Raised**, **Mark as Delivered to Customer**, **Cancel Request**.
Expect: columns **Customer Details, Requested Medicine, Promised Date, Status, Notes**; the status changes and persists after reload; empty list shows a clean empty state.

### CRM-8 · Omnichannel orders (page) ✅
Create an order through the API (see API-3) then open **Operations → Omnichannel orders**.
Expect: search by order # or customer; filter *all / received / preparing / ready / delivered / cancelled*; row buttons advance **received → preparing → ready → delivered**; opening an order shows **Ordered Items**. ❗ The pages have no permission check (see RBAC-2).

---

## 10. Prescriptions and legal registers

### CMP-1 · Doctor master ✅
Role: pharmacist. **Compliance → Doctor master.** Add Dr Verma (§3).
Expect: listed; search by name, reg no or hospital; adding the same registration number again is refused.

### CMP-2 · Prescription ✅
**Compliance → Prescriptions (Rx) → New Prescription Record.** Patient (name, phone, age, gender, address); doctor from registry; Rx date; two medicines with dosage `500mg`, frequency `1-0-1`, quantity; save.
Expect: appears in the list; search by patient/doctor/Rx number. Cashier → 403.

### CMP-3 · Registers ✅
Role: purchase manager (or owner). **Compliance → Drug registers.**
Expect: counts **Schedule H1 Dispensed, Schedule H Dispensed, Schedule X & Narcotics, Active Prescriptions**; tabs for all / H / H1 / X / narcotics; **From date**, **To date**, search; entries from POS-9 appear with *Date & Bill, Medicine & Batch, Schedule, Qty, Patient Details, Prescribing Doctor, Pharmacist Sign*. Pharmacist and cashier → 403 (they can bill, not read registers).

### CMP-4 · Printable register ✅
On a register page click the **printer icon**, or open `/dashboard/compliance/schedule-h1/print?dateFrom=2026-10-01&dateTo=2026-10-31` (also `schedule-h`, `narcotics`).
Expect: print-friendly page with the pharmacy's licence number, pharmacist, the legal rule, and entries only inside the date range; `Ctrl+P` gives a clean printout.

### CMP-5 · No deletion ✅
Look for any delete control on registers or prescriptions. Expect: none.

### CMP-6 · Prescription dispensing logic ✅ (service) / 🟡 (screen)
`npx vitest run tests/integration/dispensing.test.ts tests/unit/compliance.test.ts tests/integration/create-sale.test.ts -t "prescription|dispens"`
Expect: pass: when a sale carries a prescription id, dispensed quantity accumulates; status goes `active → partially_dispensed → fully_dispensed`; selling more than prescribed is blocked for H1/X and **nothing is written** (no sale, stock unchanged); an expired prescription is refused; cancelled prescriptions stay in the table.
🟡 **The POS screen has no prescription picker yet** (A2.7): it only has the free-text *Rx Slip / Ref No*. In the browser a sale does **not** change the prescription's status. To exercise the wiring end to end today, use the automated test above.

---

## 11. GST

Prerequisite: some sales (POS-2…), purchases (PUR-2/3) and the Clinic customer.

### GST-1 · Overview ✅
Role: accountant. **GST & Tax → GST Overview.** Change the month.
Expect: cards **Outward Tax Liability, Eligible ITC (Inward), Net Cash Tax Payable, Pending E-Invoices**; *Recent Tax Invoices & Supply Bills* table (**Date, Doc No, Party / Customer, GSTIN, Supply Type, Taxable, Tax, Total, E-Invoice**).

### GST-2 · Outward (GSTR-1) and Inward (ITC) totals ✅
Expect: outward totals equal the sums over completed sales: 🛠 `select sum(taxable_amount), sum(cgst), sum(sgst), sum(igst) from sales where status='completed';`. Inward lists purchases (including the IGST one) with ITC; totals add up. The outward page has B2B, B2C, **HSN summary** and *Cancelled Invoices* sections.

### GST-3 · GSTR-1 export ✅
On **Outward** click **Export B2B CSV** and **Download Portal JSON**.
Expect: files download; the JSON has the keys `b2b`, `b2cs`, `hsn`, the right GSTIN and period. (`cdnr` credit-note entries appear only once returns exist ⏳.)
🛠 `npx vitest run tests/integration/gstr1.test.ts tests/unit/gst.test.ts` compares the payload to `tests/fixtures/gstr1-expected.json` and checks `isValidGstin` (valid: `27GSPTE0985F1Z5`, `24AAACC1206D1ZM`, `33AABCT1332L1ZL`; tampered checksums fail; 16 characters fail).

### GST-4 · Reconciliation and Returns ✅
Open **Reconciliation** (link from GST Overview/Inward) and **Returns & Filing**.
Expect: Reconciliation: **Output liability − ITC = Net cash payable** (or excess ITC carried forward) per CGST/SGST/IGST and a mismatch list. Returns: GSTR-1 status, GSTR-3B **Table 3.1**, **Table 4**, **Table 6.1** worksheets with figures that agree with the other pages.

### GST-5 · E-invoice and e-way bill (simulator) 🟡
1. Leave `EINVOICE_MODE` unset (default `disabled`). **GST → E-Invoice & E-Way** → **Generate IRN** on a B2B invoice.
2. Set `EINVOICE_MODE=simulator` in `.env`, restart, repeat.
3. Use **View IRN & Signed QR**, copy the IRN, then **Cancel IRN** (choose a reason).
4. **Generate E-Way Bill** (distance, vehicle `MH04AB1234`).
5. Print the invoice.
6. Set `EINVOICE_MODE=production` with no provider.

Expect: (1) error *E-invoicing is not configured…* and **no IRN stored**. (2) generation works: a 64-character IRN and signed QR payload; the audit/log row records provider `SIMULATOR`. (3) cancel allowed within 24 hours with reasons 1–4. (4) e-way bill number/validity stored. (6) refused (no real provider yet).
❗ (5) correct behaviour: the screen and the printed invoice show a red **SIMULATED – NOT VALID** marker. A source search for "SIMULATED" finds nothing, so **no marker is shown today**. Record what you see.

### GST-6 · Re-rate tool ✅
Roles: owner/manager/accountant/auditor open `/dashboard/gst/rates` (not in the menu); pharmacist/cashier → 403.
1. Ensure OLD12 is at 12% with an HSN starting `3004` (§3).
2. **Current GST Rate (Source)** 12%, **New GST Rate (Target)** 5%, **HSN Prefix Filter** *HSN 3004 Prefix*, edit the reason, **Preview**.
3. **Apply**.
4. Open an older sale containing a re-rated item.

Expect: (2) the preview count equals `select count(*) from medicines where gst_rate_bp=1200 and hsn like '3004%';` with sample rows. (3) green *Successfully Re-Rated N Medicines*; master rows `gst_rate_bp=500`; an audit row (`select action, entity_type, reason from audit_logs order by created_at desc limit 3;`). (4) **historical** `sale_items.gst_rate_bp` is still 1200: only the master changed. Applying needs `medicine.manage` (check what an accountant sees on Apply).

### GST-7 · Rates and constants ✅/🛠
Read `src/lib/regulatory.ts`. Expect: `GST_RATES_BP`, `DEFAULT_GST_RATE_BP = 500`, `isValidGstRateBp`, invoice-number max 16, thresholds as named constants (no magic numbers in `gst.ts`/`compliance.ts`/`e-invoice.ts`).
Also note: the dropdown still includes 12% and 28% while docs list slabs 0/5/18/40 (§18).

### GST-8 · Credit notes and cancellations 🟡
`npx vitest run` covers `createGstDocumentFromReturn` / `cancelGstDocumentForSale` (service only). There is **no cancel or return screen** (⏳), so nothing shows in GSTR-1's credit-note section from the UI.

---

## 12. Accounting and reports

### ACC-1 · Day book, trial balance ✅
Role: accountant. **Finance → Accounting** and **Trial Balance**.
Expect: **Total Debits = Total Credits** and a balanced status; the day book lists the sale (POS-2) and purchase (PUR-2) entries; trial balance columns **Code, Account, Type, Debit, Credit**; empty state *No journal entries* on a fresh pharmacy.

### ACC-2 · P&L, balance sheet, cash flow ✅
Open each card on the Accounting page (`/dashboard/accounting/profit-loss`, `/balance-sheet`, `/cash-flow`).
Expect: P&L revenue ≈ taxable sales; assets = liabilities + equity; cash flow reflects cash/UPI/card sales and purchases. Cashier and pharmacist → 403.

### ACC-3 · Outstanding ✅
Open `/dashboard/accounting/outstanding?type=receivable` and `?type=payable` (also via Reports).
Expect: ageing buckets (*Current 0–30, Overdue 31–60, Critical > 60*, and 61–90 / 90+ columns); empty with no credit sales (credit sales ⏳).

### ACC-4 · Bank reconciliation ✅
**Finance → Bank reconciliation.** Choose *HDFC Bank*, account number `50200012345678`, a statement date, paste:
```
date,description,debit,credit,balance
2026-10-20,UPI RAVI,0,210,10210
2026-10-21,RENT,10000,0,210
```
Run **auto-match**, then **Link System Payment** on a line, then unmatch it.
Expect: lines import; matches link to payments (very few exist until payment vouchers ⏳, so most stay unmatched: expected); status changes persist.

### ACC-5 · Dashboard ✅
Open `/dashboard` as owner and as cashier.
Expect: cards for revenue (with date filter), **Average bill value**, **Low-stock items**, **Expiring ≤ 90 days**; *Recent invoices*, *Needs attention*, *Quick actions*. Change the date range: numbers change. Cashier sees the dashboard too.

### ACC-6 · Expiry exposure ✅
**Reports → Expiry exposure.**
Expect: cards **Already Expired Loss**, **Near-Expiry Exposure (≤ 90d)**, **Urgent (≤ 30 Days)**, **Next 60–90 Days**; `PX` appears under expired (loss = qty × PTR) and `P0` under ≤ 30 days; columns Medicine, Batch No., Expiry Date, Qty/Days, PTR, loss/exposure.

### ACC-7 · Fast/slow movers ✅
**Reports → Stock movement.** After sales: PARA is under **Fast Moving**; an item never sold (`Old Rate Tab`) is under **Dead Inventory**; an empty period shows *No sales movements in this period*.

### ACC-8 · Reports hub, MR commissions, exports ✅
**Reports & Analytics** hub links: Trial Balance, P&L, Balance Sheet, Cash Flow, Fast & Slow Movers, Expiry Exposure, Batches & Valuation Ledger, Customer Credit & Debtor Ageing, Supplier Payables, Compliance.
Expect: every link opens (for roles allowed); **MR commissions** filters by rep; **Export** buttons give the same rows as the screen; date presets (*Today … All time*) change results; auditor can view but not export.

### ACC-9 · Receipts: receive money against a credit bill ✅
Role: accountant (or owner/manager). The POS cannot create credit bills yet (A2.2), so make one by SQL:
```sql
-- turn the last bill of Ravi into an unpaid credit bill (pick any completed sale and set a customer)
update sales set customer_id=(select id from customers where name='Ravi' limit 1), paid_amount=0, credit_amount=total_amount
 where id=(select id from sales where status='completed' order by created_at desc limit 1);
```
1. Open **Finance → Receipts** (`/dashboard/accounting/receipts`).
2. Under **1. Choose the customer**, find Ravi (search by name/phone). It shows `N unpaid bills · owes ₹…`.
3. Under **2. Settle their bills** type a partial amount (e.g. half) in **Receive now (₹)**, or click **Full** / **Settle all bills in full**.
4. Choose a method (**UPI**), keep today's date, reference `UTR-1`, **Record receipt of ₹…**.
5. Open **Finance → Outstanding** (receivables), the **Day Book**, and the Audit log.

Expect: (2) only customers who owe money are listed, biggest balance first. (3) the button shows the total you typed; an amount above a bill's outstanding shows *An amount is more than the bill's outstanding balance.* (4) a green *Receipt RCT/26-27/000001 recorded…* message; the customer disappears if fully settled; **Recent receipts** lists it with method and reference. (5) Outstanding shows the reduced balance; the day book has a balanced entry `Receipt RCT/… from Ravi` (Dr **Bank / Digital Payments** for UPI/card/bank, **Cash on Hand** for cash; Cr **Customer Receivables**); the audit log has a *Created* `payment` row.
🛠 `select paid_amount, credit_amount from sales where id=…;` (paid up, credit down by the amount) and `select payment_no, direction, method, amount, journal_entry_id from payments order by created_at desc limit 1;`.
Also check: the menu shows **Receipts** only for owner, manager and accountant (cashier/pharmacist/purchase manager/auditor → no link, and 403 by URL); the date can't be in the future; numbers run `RCT/26-27/000001, …02`.
🛠 `npx vitest run tests/integration/payments.test.ts` covers: part/full settlement, several bills at once, advance with no bill, UPI/card/bank vs cash accounts, over-allocation, another customer's or pharmacy's bill, cancelled bills, supplier payments (`PAY/…`, debit creditors, credit bank/cash), expense payments, permissions. **Supplier payments have no screen yet:** Lane B builds it on `postPayment` (B2.4).

---

## 13. WhatsApp, SMS, reminders, background jobs

### COM-1 · Settings and secret encryption ✅
Role: owner. **Settings → WhatsApp**: save access token `EAAB-test-token`; **Settings → SMS**: provider MSG91, sender `MEDFLW`, key `sms-test-key`. Reload both. (Set `APP_ENCRYPTION_KEY` in `.env` first.)
Expect: the fields show a **masked** value (like `••••oken`), never the real secret (check page source and Network); saving again without touching the masked field keeps the stored secret. 🛠 `select access_token from whatsapp_configs; select api_key from sms_configs;` start with `v1:`. 🛠 `npx tsx scripts/encrypt-existing-secrets.ts` converts old plaintext rows and a second run changes nothing. Non-owners → 403.

### COM-2 · Templates ✅
**WhatsApp inbox → Templates → Create WhatsApp Template**: `refill_reminder_v1`, category UTILITY, header, body, footer. Expect: saved and listed; categories UTILITY / MARKETING / AUTHENTICATION available. Only the owner can open the page (`settings.manage`).

### COM-3 · Inbox (simulator) ✅
Leave providers inactive. **WhatsApp inbox:** search a conversation, type and send a message.
Expect: message logged as sent (simulated, `whatsapp_messages` row) without contacting Meta; no crash with no config; *WhatsApp Business Active* appears only when live sending is enabled.

### COM-4 · Reminders ✅
**Patient reminders → Schedule Patient Reminder**: patient, phone, type *Medicine Refill*, date, linked medicine, channel *WhatsApp & SMS*, message. Trigger due reminders.
Expect: columns **Patient, Medicine / Reason, Scheduled Date, Channel, Status, Message Preview**; a due reminder goes *pending → sent* with a sent time; no crash with no provider.

### COM-5 · Outbox and cron 🟡🛠
1. `curl -i localhost:3000/api/cron/outbox` (no header).
2. `curl -i -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/reminders` then `/api/cron/outbox`.
3. `select type, status, attempts, last_error, next_attempt_at from outbox_events;`

Expect: (1) **401**. (2) **200** with counts. (3) due reminders become `reminder.send` events; failures increase `attempts` with back-off (2^attempts × 5 s, capped at 1 hour); good ones become `done`. `npx vitest run tests/unit/outbox.test.ts`.
⚠️ If `CRON_SECRET` is **not set**, the endpoints do not check a secret (open). Production boot requires it.
✅ **Sale receipts are queued (A2.1):** bill a customer who has a phone number, then `select type, status, payload from outbox_events order by created_at desc limit 1;` → `whatsapp.receipt`, `pending`, payload `{saleId}`. The bill completes instantly; the message is sent by the next `/api/cron/outbox` run (simulated unless live WhatsApp is configured). A walk-in customer (no phone) queues nothing. A failed GST document is queued as `gst.doc_retry` instead of being lost.
🟡 Nothing schedules the cron URLs automatically yet.

### COM-6 · Webhook ✅ (🟡 unsigned allowed without secret)
```bash
curl -i "localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345"
curl -i "localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=mediflow_wa_webhook&hub.challenge=12345"
curl -i -X POST localhost:3000/api/webhooks/whatsapp -d '{}'
```
Set `WHATSAPP_APP_SECRET=s3cret`, restart, then:
```bash
BODY='{"object":"whatsapp_business_account","entry":[]}'
SIG=$(printf %s "$BODY" | openssl dgst -sha256 -hmac s3cret | sed 's/^.* //')
curl -i -X POST localhost:3000/api/webhooks/whatsapp -H "x-hub-signature-256: sha256=$SIG" -d "$BODY"
curl -i -X POST localhost:3000/api/webhooks/whatsapp -H "x-hub-signature-256: sha256=$SIG" -d '{"tampered":1}'
```
Expect: wrong token **403**; old hard-coded token **403** (unless you saved that exact token in *Settings → WhatsApp*; the handshake compares the verify token saved per pharmacy); unsigned POST **200 `{"status":"ok"}` while no secret is set** and **401 Invalid signature** once it is; valid signature **200**; tampered body **401**. The settings page's placeholder text still shows `mediflow_wa_webhook` (cosmetic).

---

## 14. AI assistant

### AI-1 · Ask questions ✅
Role: owner (or manager/pharmacist/purchase manager). Press **Ctrl+J**. Ask *"Low stock items?"*, *"Today's sales summary"*, *"Check interaction between ibuprofen and aspirin"*.
Expect: answers agree with the dashboard/reports; with no `GEMINI_API_KEY`/`GROQ_API_KEY` a friendly error appears. If the first model fails, the second is tried.

### AI-2 · Scope and permission ✅
1. With a second pharmacy registered, ask about the first pharmacy's data.
2. As cashier/accountant/auditor, ask anything.

Expect: (1) no data from another pharmacy. (2) forbidden message (`ai.use` required). ⏳ Confirm-before-write actions and rate limits are not built.

---

## 15. Settings and external API

### SET-1 · Pharmacy profile and bill prefix ✅
Role: owner. **Settings.**
1. Prefix `BILL` → save. 2. `ab1` → save. 3. `A/B` → save. 4. `INV` → save. 5. Make a sale.
Expect: (1) error *Bill prefix can be at most 3 characters (GST allows 16 characters in total per invoice number).* (the box stops at 3). (2) saved as `AB1`. (3) error *Use only capital letters and digits for the bill prefix.* (5) invoice like `INV/26-27/000001`. Name, GSTIN, licence, address persist after reload; the name shows in the sidebar; licence shows on the invoice print. Manager and others → 403.

### SET-2 · Sub-pages and their roles ✅
Check each opens for the right role (see RBAC-2): Racks, Loyalty, Medical reps, Schemes, SMS, WhatsApp.

### AUD-1 · Audit log page and who may open it ✅
Roles: owner, manager, auditor open **Finance → Audit log** (`/dashboard/settings/audit`). Cashier, pharmacist, purchase manager, accountant → **403**.
Expect: heading *Audit log*; filters **User**, **Record type**, **Action**, **From**, **To**, **Apply** / **Reset**; a table **When, User, Action, Record, Changes, Reason** (newest first); a footer like `12 entries · page 1 of 1` with **Previous / Next** when there are more than 50; the menu link appears only for roles with `audit.view` (owner 33 links, auditor 24).

### AUD-2 · What gets recorded ✅
Do each action, then open the audit log.
| Do this (role) | Expect a new row |
|---|---|
| Add **opening stock** `NEW1`, qty 25 (manager) | *Stock change* on `batch`; `qtyOnHand: 0 → 25`; reason *Opening stock entry* |
| Adjust stock −3 with note (action only, no screen yet: see below) | *Stock change*; `qtyOnHand: 10 → 7`; reason `damage: <note>` |
| Create a medicine (pharmacist/owner) | *Created* on `medicine`; shows name, MRP, sale price, GST rate, schedule |
| Change the store name/prefix in Settings (owner) | *Changed* on `store`; **only the fields that changed**, old → new |
| Save Settings without changing anything | **no** row |
| Bill with a discount above the shop limit as owner (POS-5) | *Discount override* on `sale`; shows the limit and the highest line discount |
| Bill within the limit | **no** row |
| A stock adjustment that fails (more than on hand) | **no** row and no stock change |
There is **no screen for stock adjustments yet**; test that row with `npx vitest run tests/integration/audit-log.test.ts` or a direct call. Existing rows from other modules (GST re-rate, suppliers, loyalty adjust, compliance) also appear.

### AUD-3 · Filters and paging ✅
Generate a few rows (AUD-2), then filter by **User**, **Record type**, **Action** and a **From/To** range; use **Reset**.
Expect: only matching rows; the date range includes both end days; the count in the footer matches; filter drop-downs list only users and record types that occur in **your** pharmacy. 🛠 `npx vitest run tests/integration/audit-log.test.ts -t "reading"`.

### AUD-4 · Append-only and isolated ✅
Expect: no edit or delete button anywhere on the page. A second pharmacy never sees the first's entries (register a second pharmacy and open its audit log: empty, and its filter lists contain only its own users).

### API-1 · `/api/v1/*` needs a key ✅
```bash
curl -i -X POST localhost:3000/api/v1/stock/check -H 'Content-Type: application/json' -d '{"query":"para"}'
curl -i -X POST localhost:3000/api/v1/orders -H 'Content-Type: application/json' -b mediflow_session=fake -d '{"customerName":"x","customerPhone":"9999999999","items":[{"name":"a","qty":1}]}'
```
Expect: both **401** (`Missing or malformed API key. Use: Authorization: Bearer mf_live_<key>`); no data returned, no order created.

### API-2 · Create, use and revoke a key 🟡
Open `/dashboard/settings/api-keys` (not in the menu).
1. As **owner**: key name `Test integration`, scopes `stock.read` and `orders.write`, create.
2. Copy the key (starts `mf_live_`; shown **once**).
3. `curl -i -X POST localhost:3000/api/v1/stock/check -H 'Content-Type: application/json' -H 'Authorization: Bearer mf_live_<key>' -d '{"query":"para"}'`
4. Same key to `GET /api/v1/orders?id=<id>` (needs `orders.read`).
5. Revoke the key; repeat step 3.
6. 🛠 `select key_hash from api_keys;`

Expect: (3) **200** with only your pharmacy's items (and one store's stock if the key is store-scoped). (4) **403** (scope missing). *Last used* updates. (5) **401** immediately. (6) a 64-hex hash, never the raw key. The list shows name, scopes, last used, created.

### API-3 · Create an order through the API ✅
With an `orders.write` key: `curl -i -X POST localhost:3000/api/v1/orders -H 'Content-Type: application/json' -H 'Authorization: Bearer mf_live_<key>' -d '{"customerName":"Test","customerPhone":"9999999999","items":[{"name":"Dolo","qty":1}]}'`
Expect: **201**; the order appears in *Omnichannel orders* of **your** pharmacy only. A missing name/phone/items array → **400**. A key from pharmacy A asking for pharmacy B's order id → **404**.

### API-4 · The API-key page has no permission check ❗
Log in as **cashier**, open `/dashboard/settings/api-keys`.
Expect (correct): **403** (`api_key.manage`). **Today:** it opens and a cashier can create and revoke keys. This is the most important open security item.

### ENV-1 · Environment validation ✅/🛠
1. Remove `DATABASE_URL`, run `npm run dev` → stops with `Invalid environment variables` naming `DATABASE_URL`.
2. Restore it. `NODE_ENV=production npm run build && npm start` without `APP_ENCRYPTION_KEY`/`CRON_SECRET` → every page 500 with *APP_ENCRYPTION_KEY is required in production* / *CRON_SECRET is required in production*; the **build** still succeeds. Add both → starts.
3. `.env.example` exists and lists every variable.

---

## 16. End-to-end scenarios

Run these in order on a fresh `db:reset` + §3 data. Each ties many features together.

### E2E-1 · A day at the counter
1. **Cashier** bills 2 PARA to Ravi (cash) → invoice `…000001`; loyalty points earned if the programme is on (CRM-3).
2. **Pharmacist** sells COUGH with a doctor name; then AZI with full H1 details.
3. **Cashier** tries to sell AZI without details → blocked.
4. **Accountant** opens the day book, trial balance, GST outward.
5. **Auditor** opens the H1 register, prints it.
Expect: stock, journal, GST totals, register rows and loyalty all agree (use INV-5 and POS-2 SQL checks); the trial balance still balances.

### E2E-2 · New stock arrives
1. **Purchase manager** records `SB-002` from S1 (PARA, new batch `PB2`, qty 50 + 5 free, ₹60).
2. **Cashier** searches PARA: both `P1`/`PB2` batches show, expired `PX` doesn't.
3. Bill from `PB2`.
Expect: `PB2` has 55; unit cost = ₹60 × 50 ÷ 55 = ₹54.55 (5455 paise); after the sale `PB2` = 54; GST inward shows the purchase; the supplier payable appears under **Outstanding → payable**.

### E2E-3 · Expiry clean-up
1. **Manager** opens **Expiry exposure**: `P0` is urgent, `PX` expired.
2. Opens **Batches & stock → Near expiry** → `P0` listed.
3. Adds a promise order for `No Stock Tab` from POS, then marks it *PO Raised* and *Delivered*.

### E2E-4 · GST month-end
1. **Accountant** sets the month, reviews Outward, Inward, Reconciliation, Returns.
2. Downloads GSTR-1 JSON.
3. **Owner** runs the re-rate tool for OLD12 (12% → 5%).
Expect: totals consistent across pages; old sales keep 12%; the audit row exists.

### E2E-5 · Locked-down staff
Log in as every role and walk the whole menu once. Expect: no dead-end links (a link in the menu never 403s: `npx vitest run tests/unit/nav.test.ts` checks this), each role sees only its section.

---

## 17. Not built yet: confirm it is absent

For each item, confirm there is **no** menu entry, page or button (so it isn't half-visible). IDs are the roadmap tasks.

| Roadmap | Feature | Quick check it is absent |
|---|---|---|
| A1.4 | Users, invites, roles screens | No Settings → Users/Roles; no `/invite/<token>` page |
| A1.5 | Login lockout, change password, store pick | 11 wrong passwords still allowed; no Profile page |
| A2.2 | Split tender | Only one payment method per bill; no `F8` |
| A2.3 | Hold / resume bills | `F6`/`F7` do nothing |
| A2.4–A2.5 | Cancel bill, returns, credit notes | No cancel/return buttons on an invoice |
| A2.6 | Cash register shifts | No open/close shift screen |
| A2.7 | POS refactor, redeem loyalty points | No points field at POS |
| A2.8 | Playwright e2e | No `tests/e2e` folder |
| A2.9 (supplier payments screen) | Pay a supplier from the UI | No *Pay* button on a supplier or purchase (the service `postPayment` exists; Lane B builds the screen in B2.4) |
| B2.2–B2.4 | Purchase orders, returns, supplier ledger/payments | No such pages under Purchases |
| B2.7 | Automatic reminders | Cron route exists but nothing calls it; no refill auto-reminder after a sale |
| A3.x / B3.x | Stores, switcher, per-store settings, transfers, warehouse, stock count, chain reports, reorder, central purchasing, per-GSTIN returns, expiry redistribution | No Settings → Stores, no `Ctrl+Shift+S`, no transfers, no Purchases → Reorder |
| A4.x | Devices, sync API, PWA, offline billing, conflicts | No `/api/sync/*`, no `manifest`, no install icon |
| B4.x | Import wizard | Only the old *Bulk import* exists |
| A5.x | Expenses, ledgers, credit control, period lock, year-end | No Accounting → Expenses or Receivables |
| B5.x | Real e-invoice/e-way, GSTR-2B/IMS, public receipt link, SMS DLT, DPDP | No `/r/<token>`, no Privacy page |
| A6.x / B6.x | Health endpoint, performance work, deployment, security headers, AI confirm-before-write, onboarding wizard, inspector/CA packs, help guides, pilot | `curl -I localhost:3000/dashboard` shows no CSP header; no `/api/health` |

---

## 18. Known issues (expected failures)

Record these as **known**, not new. Fix and tick when resolved.

| # | Issue | Where to see it | Impact |
|---|---|---|---|
| 1 | API Keys page and actions check login only (no permission) | API-4 | Any role can mint keys: **security** |
| 2 | Omnichannel orders pages and ~30 actions (`external-orders`, `medical-reps`, `promise-orders`, `schemes`, `bank-reconciliation`, `inventory-import`, 2 GST reads) lack permission checks; **`enrichMedicineDetails` has no authentication at all** | RBAC-2, RBAC-10 | Wrong roles can use them; the AI-enrichment endpoint is callable by anyone (cost abuse) |
| 3 | No visible "SIMULATED – NOT VALID" marker on e-invoice screen or print | GST-5 | Simulator could be mistaken for real |
| 4 | POS screen has no prescription picker (the service is wired) | CMP-6 | Prescription status/quantities don't update from the browser |
| 5 | Nothing schedules the cron URLs | COM-5 | Receipts and reminders are only sent when someone calls the cron endpoints |
| 6 | Webhook accepts unsigned POSTs and cron skips its secret when the env var is unset | COM-5, COM-6 | Set both secrets in any shared environment |
| 7 | Seeded store state is `MH` (text) but tax logic uses 2-digit codes | §3 step 0 | Intra-state purchases may come out as IGST until Settings has `27` |
| 8 | GST dropdown still offers 12% and 28%; docs list 0/5/18/40 | GST-7 | Decide and align code and docs |
| 9 | Whole-repo `npm run lint` still has Lane B errors | `npm run lint` | `lint:strict` is clean |
| 10 | Webhook settings placeholder shows the old `mediflow_wa_webhook` | COM-6 | Cosmetic |
| 11 | The 25 Oct automated run couldn't use: Racks **Save**, Purchase supplier select, new Scheme listing, Customer name input | INV-3, PUR-2, INV-8, CRM-1 | Probably test-script selectors; confirm by hand |

---

## 19. Developer and automated checks

Skip this section if you only test the UI.

### 19.1 Everyday commands
```bash
npm run db:reset              # clean local DB + logins (refuses non-local hosts)
npm run db:migrate            # apply migrations + sync system roles
npm run db:seed-users         # (re)create role logins
npm run db:studio             # browse the DB
npm test                      # everything       |  npx vitest run tests/unit   (no DB needed)
npm run typecheck && npm run lint:strict
```

### 19.2 Foundation checks
| ID | Check | Expected |
|---|---|---|
| DEV-1 | `npm run db:reset`, then count tables: `select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';` | prints `✓ database wiped / ✓ migrations applied / ✓ system roles synced`; **59** tables; `drizzle/` has `0000_init … 0005_quiet_ronan` |
| DEV-2 | `npx drizzle-kit generate --name should_not_exist` | `No schema changes, nothing to migrate`. If it creates a file, delete it (`git clean -f drizzle`) and tell the schema author to commit a migration |
| DEV-3 | `DATABASE_URL=postgres://u:p@db.example.com:5432/x npm run db:reset` (and `db:seed-users`) | `Refusing to … non-local database`; nothing changes. `npm run db:migrate` twice is safe (no duplicates) |
| DEV-4 | `ls src/server/db/schema` | 12 module files (`platform catalog inventory sales accounting purchasing compliance gst crm comms banking ai`) + `_helpers.ts` + `index.ts`; no old `schema.ts` |
| DEV-5 | `npm test`, then `DATABASE_URL=postgres://mediflow@localhost:5432/mediflow npm test` | (1) passes and leaves **no** `mediflow_test_*` databases (`psql -l`). (2) fails at once: `Refusing to run tests against database "mediflow"` |
| DEV-6 | Remove `.for("update")` in `src/server/domain/stock.ts`, run `npx vitest run tests/integration/stock.test.ts`, then `git checkout` the file | the CONCURRENCY and LEDGER REPLAY tests fail without the lock, pass with it |
| DEV-7 | `npx vitest run tests/unit/nav.test.ts`; change a `href` in `src/app/components/nav/sales.ts` to `/dashboard/typo`, re-run, revert | passes; fails naming the dead link; also checks a page's own permission agrees with its menu item |
| DEV-8 | `npm run lint:strict`; add `export const x: any = 1;` to `tests/unit/money.test.ts`, re-run, remove | exit 0; then exit 1 with `Unexpected any` |
| DEV-9 | `npx vitest run tests/integration/register.test.ts` | first user of a new pharmacy gets all 38 permissions and a session; duplicate email/missing fields refused |
| DEV-10 | `npx vitest run tests/unit/db-errors.test.ts` | pass (`isUniqueViolation(err, "constraint")` is needed because the ORM wraps driver errors) |
| DEV-11 | `npx vitest run tests/unit/permissions.test.ts` | role templates match the counts in RBAC-4 |
| DEV-12 | `NEXT_TELEMETRY_DISABLED=1 npx next build` | succeeds (needs `DATABASE_URL`; `next start` also needs `APP_ENCRYPTION_KEY` and `CRON_SECRET`) |

### 19.3 What the automated suite covers (28 files)
| File | Covers |
|---|---|
| `unit/money.test.ts`, `invoice-no.test.ts` | paise/bp math, GST split, invoice number format |
| `unit/permissions.test.ts`, `nav.test.ts` | role templates; menu never offers a dead end |
| `unit/db-errors.test.ts` | unique-violation detection |
| `unit/gst.test.ts` | GSTIN checksum, state codes, supply type, tax context |
| `unit/compliance.test.ts` | schedule rules for dispensing |
| `unit/loyalty.test.ts` | earn/redeem arithmetic |
| `unit/outbox.test.ts` | back-off calculation |
| `unit/purchases.test.ts` | purchase line/totals, landed cost |
| `integration/stock.test.ts` | stock ledger, concurrency, replay |
| `integration/sequence.test.ts` | gap-free numbering, FY rollover, 16-char limit |
| `integration/sale-resilience.test.ts` | savepoints, rejected inputs |
| `integration/create-sale.test.ts` | the sale service: stock, journal, GST doc, register, outbox receipt, idempotency, IGST, prescriptions, refusals |
| `unit/contracts.test.ts` | `SaleInput` and `PostPaymentInput` schemas |
| `unit/audit-diff.test.ts` | how the audit page describes old → new values |
| `unit/action-guards.test.ts` | every exported server action has a permission check (a new unguarded action fails; known gaps are listed in the test) |
| `integration/isolation.test.ts` | pharmacy B signed in as OWNER cannot read or change pharmacy A's data through any list or by id (≈60 attacks across both lanes), nor point its records at A's |
| `integration/payments.test.ts` | receipts and supplier/expense payments: journal, bill settlement, refusals, who may post |
| `integration/audit-log.test.ts` | audit rows written by stock, store settings, medicines and discount overrides; filters, paging, tenant isolation, who may read |
| `integration/rbac.test.ts` | membership/store/tenant checks |
| `integration/register.test.ts` | registration seeds an owner |
| `integration/racks-actions.test.ts` | racks permissions and isolation |
| `integration/lane-a-permissions.test.ts` | every Lane A action vs permissions |
| `integration/lane-b-permissions.test.ts` | every Lane B action vs permissions |
| `integration/dispensing.test.ts` | prescription dispensing rules |
| `integration/gstr1.test.ts` | GSTR-1 payload vs fixture |
| `integration/purchase-totals.test.ts` | server-side purchase totals, tampering |

**When you add an action:** add it to the matching permission test's `CASES`. **When you change behaviour:** update this guide in the same change (the PR template asks for it).

---

## 20. Result sheet and reporting

Copy this table into your notes and fill the last two columns.

| ID | Test | Result | Notes |
|---|---|---|---|
| AUTH-1…4 | Sign in, register, session, logout | | |
| RBAC-1…10 | Access, menus, roles, exports, AI, isolation | | |
| INV-1…9 | Medicines, racks, stock, import, schemes | | |
| POS-1…15 | Billing counter and sales | | |
| PUR-1…5 | Suppliers and purchases | | |
| CRM-1…8 | Customers, loyalty, reps, orders | | |
| CMP-1…6 | Prescriptions and registers | | |
| GST-1…8 | GST pages, export, e-invoice, re-rate | | |
| ACC-1…9 | Accounting, reports, receipts | | |
| COM-1…6 | WhatsApp, SMS, reminders, jobs, webhook | | |
| AI-1…2 | AI assistant | | |
| AUD-1…4 | Audit log | | |
| SET-1…2, API-1…4, ENV-1 | Settings, API keys, environment | | |
| E2E-1…5 | End-to-end scenarios | | |
| §17 | Absent features confirmed | | |
| DEV-1…12 | Developer checks | | |

### Reporting a failure
Write: the **test ID**, the **role**, the **URL or command**, what you **expected**, what you **saw**, and the terminal output from `npm run dev`. Add a screenshot for UI problems.

### Suggested order for one sitting (about 3 hours)
1. §2 setup and health check (15 min). 2. §3 starter data (20 min). 3. §5 access and security (25 min). 4. §6 → §8 inventory, POS, purchases (60 min). 5. §9 → §12 CRM, compliance, GST, accounting (45 min). 6. §13 → §15 comms, AI, settings, API (20 min). 7. §16 end-to-end (15 min). 8. §17–§18 spot checks.
