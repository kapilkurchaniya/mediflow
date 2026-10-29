# B_TEST_GUIDE: manual test guide for Lane B (Kapil / kapilkurchaniya)

> **Owner:** Kapil · **Covers:** every phase and subphase of Lane B in [ROADMAP.md](ROADMAP.md): purchasing & suppliers, compliance registers, GST & e-invoice, CRM (customers, family groups, loyalty, orders), WhatsApp/SMS/reminders/outbox, reports & dashboards, AI assistant, data import.
> **Companion:** [A_TEST_GUIDE.md](A_TEST_GUIDE.md) (Lane A). Cross-lane tests are at the end of both guides.
> **Last updated:** 20 Oct 2026, at the end of Lane A's **A1.3**. **Keep this file current:** see "Maintaining this guide".

---

## 0. How to use this guide

### Status legend (per test)
| Mark | Meaning |
|---|---|
| ✅ | Built and verified. Run it; it should pass. |
| 🟡 | Built, but **not yet checked in this guide's author's environment, or only partly built**. Run it and report what you see. |
| ⏳ | **Not built yet.** Steps are written from the roadmap's "Done when" criteria so you can test the moment the task lands. Adjust labels to the final UI. |
| ❗ | **Known to fail today** (a documented bug or gap). A pass means somebody fixed it. |

### Perspectives
- 👤 **User perspective:** what a pharmacist, purchase manager, accountant or owner sees and does in the browser.
- 🛠 **Developer perspective:** commands, SQL, API calls, tests, permissions, integrations.

### Test format
Each test has an ID (`B-<phase>.<number>`), the **phase/subphase/feature**, **steps** and an **expected result**. Record **PASS**, **FAIL** (with what you saw) or **BLOCKED**.

### Maintaining this guide
This guide is part of the definition of done:
1. **Every PR that changes behaviour updates this file in the same PR:** move ⏳ → ✅/🟡 for tasks that land, rewrite steps whose UI changed, add tests for new behaviour, delete tests for removed behaviour.
2. Update "Last updated" and any counts you change.
3. The PR template has a checkbox for it; reviewers check it.
4. Anything that affects the other lane (a contract, a shared file) also goes in the cross-lane section of **both** guides.

---

## 0.1 Environment setup (once)

```bash
git clone https://github.com/kapilkurchaniya/mediflow.git && cd mediflow
git switch lane-b/kapil && git fetch && git merge origin/main     # get the latest main
npm install                          # also installs the git pre-push hook
git config mediflow.lane b
```
Postgres and `.env`: see section 0.1 of [A_TEST_GUIDE.md](A_TEST_GUIDE.md) (Docker or host-network container; `.env` with `DATABASE_URL`; `.env.test` for the test suite).

For a production-mode run (`npm run build && npm start`) also set in `.env`: `APP_ENCRYPTION_KEY` (any base64 string, e.g. `openssl rand -base64 32`) and `CRON_SECRET` (any string). Optional integrations: `GEMINI_API_KEY`, `GROQ_API_KEY`, `TAVILY_API_KEY`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `EINVOICE_MODE` (`disabled` | `simulator` | `sandbox` | `production`).

```bash
npm run db:reset                     # wipe local DB -> migrate -> seed owner -> seed one login per role
npm run dev                          # http://localhost:3000
```

### 0.2 Test accounts (created by `npm run db:reset`, local only)
| Role | Email | Password | Lane B relevance |
|---|---|---|---|
| Owner | `admin@apollo.com` | `admin123` | everything |
| Store Manager | `manager@apollo.com` | `manager123` | everything except users/settings/stores/API keys |
| Pharmacist | `pharmacist@apollo.com` | `pharmacist123` | prescriptions, customers, compliance |
| Cashier | `cashier@apollo.com` | `cashier123` | billing, customers |
| Purchase Manager | `purchase_manager@apollo.com` | `purchase_manager123` | suppliers, purchases, POs, reports |
| Accountant | `accountant@apollo.com` | `accountant123` | GST, accounting, reports |
| Auditor | `auditor@apollo.com` | `auditor123` | read-only reports and registers |

Use private windows to stay signed in as several roles at once.

### 0.3 Resetting
`npm run db:reset` returns to a known state (about 20 s).

### 0.4 Quick health check (🛠, run first)
```bash
npm run typecheck && npm run lint:strict && npm test
```
**Expected:** exit 0 for all three; `npm test` reports no failures (currently 12 files / 141 tests). Whole-repo `npm run lint` still reports Lane B's pending lint errors (see B-0.9).

### 0.5 Data you will need
After `db:reset` there is one pharmacy, one store and **no medicines or stock**. Load some:
```bash
npx tsx scripts/fetch-dataset.ts      # downloads the Indian medicine dataset (B0.7)
npx tsx scripts/seed-dataset.ts       # imports medicines
npx tsx scripts/generate-stock.ts     # creates batches / stock
```
(If a script needs the dataset folder and fails, run `fetch-dataset` first and read its output.) Or create 2-3 medicines and an opening stock by hand through **Inventory → New item** and **Opening stock**.

---

# PHASE 0 · Foundation & safety (B0.1 – B0.8)

### B-0.1 ❗ B0.1 API keys: `/api/v1/*` must not leak data (🛠, **critical**)
**Feature:** `/api/v1/stock/check`, `/api/v1/orders`.
1. Start the app (`npm run build && npm start`, or `npm run dev`).
2. `curl -i -X POST localhost:3000/api/v1/stock/check -H 'Content-Type: application/json' -d '{"query":"para"}'`
3. Same with a **fake cookie**: add `-b mediflow_session=totally-fake`.
4. Create an order with a fake cookie: `curl -i -X POST localhost:3000/api/v1/orders -H 'Content-Type: application/json' -b mediflow_session=fake -d '{"customerName":"x","customerPhone":"9999999999","items":[{"name":"a","qty":1}]}'`
5. After the fix: create an API key (**Settings → API keys**, `settings.manage`), then call with `-H "Authorization: Bearer mf_live_..."`; call with a key of **tenant A** asking for **tenant B's** order id.

**Expected after the fix:** (2)-(4) **401** with `{"error":...}` (no data). (5) a valid key with scope `stock.read` returns only **its own** tenant/store's data; a key without `orders.write` gets **403**; `GET /api/v1/orders?id=<other tenant's order>` returns **404**; the key is shown once and stored as a hash (`select key_hash from api_keys` is 64 hex chars); revoked keys stop working immediately.
**Status today (verified 20 Oct 2026):** (3) returns **200** and (4) returns **201** and creates an order in the first tenant: **FAIL**. Fix before anything else: this is the most serious open issue.

### B-0.2 ❗ B0.2 WhatsApp webhook: signature verified and reachable (🛠)
1. Verification handshake: `curl -i "localhost:3000/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<your WHATSAPP_VERIFY_TOKEN>&hub.challenge=12345"`
2. Wrong token: same URL with `hub.verify_token=wrong`.
3. Hard-coded old token: `hub.verify_token=mediflow_wa_webhook`.
4. POST **without** a signature header: `curl -i -X POST localhost:3000/api/webhooks/whatsapp -d '{}'`
5. POST with a **valid** signature (set `WHATSAPP_APP_SECRET=s3cret` first):
   ```bash
   BODY='{"object":"whatsapp_business_account","entry":[]}'
   SIG=$(printf %s "$BODY" | openssl dgst -sha256 -hmac s3cret | sed 's/^.* //')
   curl -i -X POST localhost:3000/api/webhooks/whatsapp -H "x-hub-signature-256: sha256=$SIG" -d "$BODY"
   ```
6. Same with a tampered body.

**Expected:** (1) **200** and body `12345`. (2) **403**. (3) **403** (the hard-coded token must be gone). (4) **401 Invalid signature** when `WHATSAPP_APP_SECRET` is set. (5) **200** `{"status":"ok"}`. (6) **401**. Errors never echo internal messages.
**Status today:** the signature code is merged, **but every request returns 307 (redirect to /login)** because `src/proxy.ts` lists `/api/webhook` (without the "s") as the only public path, so Meta's calls never reach the handler: **FAIL** for (1)-(6). Fix `publicRoutes` to match `/api/webhooks/` and `/api/v1/` by prefix. Also note: when `WHATSAPP_APP_SECRET` is **not** set the code accepts unsigned requests; decide whether production should refuse (recommended: yes).

### B-0.3 🟡 B0.3 E-invoice simulator cannot be mistaken for real (👤+🛠)
1. Leave `EINVOICE_MODE` unset. Open **GST → E-Invoice & E-Way** and try *Generate e-invoice* on a B2B document.
2. Set `EINVOICE_MODE=simulator`, restart, repeat.
3. Print the document.
4. Set `EINVOICE_MODE=production` without a real provider configured.

**Expected:** (1) an error: *E-invoicing is not configured. Set EINVOICE_MODE=simulator to test locally, or EINVOICE_MODE=sandbox|production with a real GSP provider.* and **no IRN is stored**. (2) generation works but the UI shows a clear **SIMULATED / not valid** marker; the log row records provider `SIMULATOR`. (3) the printed invoice says **SIMULATED IRN, NOT A VALID E-INVOICE**. (4) refused until a real provider exists (B5.1).
**Status today:** the mode switch and error message exist; a grep finds **no "SIMULATED" badge in `EInvoiceClient.tsx`** and the print page marker is not confirmed: finish and verify (2)-(3).

### B-0.4 ⏳ B0.4 Third-party secrets are encrypted at rest (🛠)
(Branch `lane-b/kapil`, commit "B0.4", not on `main` yet.)
1. Set `APP_ENCRYPTION_KEY`. In **Settings → WhatsApp**, save an access token `EAAB-test-token`; in **Settings → SMS** save an API key `sms-test-key`.
2. `select access_token from whatsapp_configs;` and `select api_key from sms_configs;`
3. Reopen both settings pages. Inspect the page source / network response.
4. Save the settings again **without touching** the masked token field.
5. Run `npx tsx scripts/encrypt-existing-secrets.ts` on a database that has old plaintext values.
6. Run the unit test for `src/server/crypto.ts` (encrypt → decrypt round trip; tampering is detected).

**Expected:** (2) values start with `v1:` (never the plaintext). (3) the UI shows a masked value like `••••oken`; the real secret is **never** in the HTML/JSON sent to the browser. (4) the stored secret is **unchanged** (a masked value means "keep"). (5) plaintext rows become `v1:`; running it twice changes nothing. (6) a changed ciphertext fails to decrypt. Sending a WhatsApp/SMS message still works (decrypted only server-side).

### B-0.5 ✅ B0.5 GST 2.0 defaults and constants (👤+🛠)
1. **Inventory → New item**; look at the GST rate dropdown (Lane A changed the default).
2. Save an item without touching the dropdown; `select name, gst_rate_bp from medicines order by created_at desc limit 1;`
3. Open `src/lib/regulatory.ts`.
4. Try a rate outside the list by editing the `<option value>` in devtools to `7` and saving.

**Expected:** (1) default **5% — Most medicines (GST 2.0)**. (2) `gst_rate_bp = 500`. (3) `GST_RATES_BP`, `DEFAULT_GST_RATE_BP = 500`, `isValidGstRateBp`, `MAX_INVOICE_NO_LENGTH = 16`. (4) *Choose a valid GST rate (0%, 5%, 12%, 18% or 28%).* **Note:** the docs (05-domain) list the slabs as 0/5/18/40 while `GST_RATES_BP` still includes 12 and 28 (needed for historical documents): decide and make code and docs agree.

### B-0.6 🟡 B0.6 Environment validation (🛠)
1. Remove `DATABASE_URL` from `.env`, run `npm run dev`.
2. Restore it. `NODE_ENV=production`: run `npm run build && npm start` **without** `APP_ENCRYPTION_KEY` / `CRON_SECRET`.
3. Look for `.env.example` and the README variable list.

**Expected:** (1) the app stops at boot with `Invalid environment variables` naming `DATABASE_URL`. (2) every page returns 500 and the log says `APP_ENCRYPTION_KEY is required in production` and `CRON_SECRET is required in production`; the **build itself** still succeeds (no secrets needed at build time). (3) ❗ **`.env.example` does not exist** and the README still documents `GOOGLE_GENERATIVE_AI_API_KEY` and an unused `SESSION_SECRET`: finish B0.6 (create `.env.example`, fix README, replace direct `process.env.X` reads with `env.X` in `api/chat/route.ts`, `server/ai.ts`, the webhook route).

### B-0.7 ✅ B0.7 Repo hygiene (🛠)
1. `ls scripts` and `cat .gitignore | grep -i dataset`.
2. `git ls-files scripts | grep -c migrate-tenant`.
3. Follow `npx tsx scripts/fetch-dataset.ts`, then `npx tsx scripts/seed-dataset.ts`.

**Expected:** (1) `fetch-dataset.ts` exists; the dataset folder is git-ignored. (2) `0` (the script with hard-coded tenant ids is gone). (3) a fresh clone can load the medicine dataset by following only the documented commands; no empty-submodule error.

### B-0.8 ⏳ B0.8 Real Marg exports collected (non-code)
**Expected:** 2-3 anonymised exports (item master, batch stock, customers, suppliers, outstanding) stored **outside the repo**, each noted with the Marg version and the menu that produced it. Needed for B-4.x.

### B-0.9 🟡 B0.5 lint share (🛠)
`npm run lint 2>&1 | tail -3` and `npm run lint:strict`.

**Expected today:** whole-repo lint still fails with errors only in Lane B paths: `src/app/api/chat` (30), `src/app/components/AIAssistant.tsx` (22), `src/app/dashboard/{customers,orders,compliance}` (15), `src/server/domain/{reports,loyalty,whatsapp}.ts` (5). `lint:strict` passes. **Done when:** all of that is fixed **and each fixed path is added to `CLEAN_PATHS` in `scripts/lint-strict.mjs`** (then delete the script and make `npm run lint` blocking in CI).

---

# PHASE 1 · Platform & correctness (B1.1 – B1.6)

### B-1.1 ⏳ B1.1 Regulatory constants used everywhere (🛠)
`grep -rn "25000000\|1200\b" src/server/domain/*.ts` should find no magic numbers; thresholds come from `@/lib/regulatory`. **Expected:** no inline GST/threshold literals in `gst.ts`, `compliance.ts`, `e-invoice.ts`.

### B-1.2 ⏳ B1.2 Inter-state GST (`determineTaxContext`) 🤝
**🛠** `npx vitest run tests/unit/gst.test.ts -t "tax context"`
**👤** As **cashier** in POS: create a customer **with** a GSTIN of another state (e.g. store is Maharashtra `27`, customer GSTIN starts `29`), bill ₹1,050 at 5%.
**Expected:** unit tests cover all four combinations (B2B intra, B2B inter, B2C, invalid GSTIN). The bill shows **IGST ₹50, no CGST/SGST**; `sales.is_inter_state = true`; GSTR-1 lists it under **B2B**. A customer **without** GSTIN is always intra-state (CGST+SGST). Customer form: state auto-fills from the GSTIN.

### B-1.3 ⏳ B1.3 GST test suite (🛠)
`npx vitest run tests/unit/gst.test.ts tests/integration/gstr1.test.ts`
**Expected:** `isValidGstin` passes the real checksum (known-valid pass, mutated checksum fails); `buildGstr1Data` for 5 seeded sales (B2B intra, B2B inter, B2C small, B2CL, credit note) equals `tests/fixtures/gstr1-expected.json`; that fixture has been validated once in the GST portal's offline tool.

### B-1.4 ⏳ B1.4 Compliance hardening
1. Create a prescription for a patient with `Azithromycin 500` x 6 (mark the medicine Schedule H1). 2. In POS, sell it **against the prescription**: first 3, then 3, then 1 more. 3. Sell against an **expired** prescription. 4. Delete attempt: look for any delete button/action on registers/prescriptions. 5. Open the register print page for the month.

**Expected:** (2) status `active` → `partially_dispensed` → `fully_dispensed`; `prescription_items.quantity_dispensed` = 3, 6; the 7th unit is **refused** for H1/X. (3) refused (`valid_until` passed). (4) nothing can delete `dispensing_logs` or `prescriptions`; cancelling sets `status='cancelled'`. (5) a printable register with licence number, pharmacist, and the legally required columns, for a chosen month.

### B-1.5 ⏳ B1.5 RBAC applied to Lane B modules (🛠+👤)
Use the pattern in `docs/06-coding-standards.md` §1 (`protectedAction`, `requirePermission`, `requirePagePermission`; reference module `src/app/actions/racks.ts`).

**Page matrix (👤), ✓ = opens, 403 = no-access page** (fill in as modules are converted; expected values come from the role templates):

| URL (permission) | owner | manager | pharmacist | cashier | purch. mgr | accountant | auditor |
|---|---|---|---|---|---|---|---|
| `/dashboard/purchases` (purchase.view) | ✓ | ✓ | 403 | 403 | ✓ | ✓ | ✓ |
| `/dashboard/purchases/new` (purchase.create) | ✓ | ✓ | 403 | 403 | ✓ | 403 | 403 |
| `/dashboard/suppliers` (supplier.view) | ✓ | ✓ | ✓ | 403* | ✓ | ✓ | ✓ |
| `/dashboard/customers` (customer.view) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/dashboard/compliance/prescriptions` (prescription.approve) | ✓ | ✓ | ✓ | 403 | 403 | 403 | 403 |
| `/dashboard/gst` (gst.view) | ✓ | ✓ | 403 | 403 | 403 | ✓ | ✓ |
| `/dashboard/reports` (report.view) | ✓ | ✓ | 403 | 403 | ✓ | ✓ | ✓ |
| `/dashboard/whatsapp`, `/dashboard/reminders` (customer.manage) | ✓ | ✓ | ✓ | ✓ | 403 | 403 | 403 |

*Cashier has no `supplier.view` in its template (check `src/lib/permissions.ts`; the cashier template does not include the shared `view` list). Adjust the table to the templates if they change.

**🛠 Expected:** (a) every Lane B action is refused for a user with no permissions and allowed for one with exactly its permission: append each to `CASES` in `tests/integration/lane-a-permissions.test.ts` (or a lane-B twin file) and to the isolation suite (A1.7). (b) `src/app/api/chat/route.ts` requires `ai.use`. (c) the CSV routes `src/app/api/export/*` require `report.export` (try as cashier: expect 403 JSON, not a file). (d) the sidebar already hides items by `permission`; each Lane B nav entry's `permission` must equal what its page requires (`tests/unit/nav.test.ts` fails if they disagree).

### B-1.6 ⏳ B1.6 GST re-rate tool
1. Set a few medicines to 12% with HSN `3004xxxx`: `update medicines set gst_rate_bp=1200 where name ilike 'dolo%';`
2. **GST → Rates** (`/dashboard/gst/rates`): filter by rate 12% and HSN prefix 3004; preview; apply 5%.
3. Open an **old** sale containing one of those medicines.

**Expected:** (2) the preview count matches; after applying, `gst_rate_bp = 500`; one audit row per batch of changes. (3) historical `sale_items.gst_rate_bp` stays **1200** (only the master changes). Requires `medicine.manage`.

---

# Baseline features owned by Lane B (existing before the roadmap)

These already exist. Test them now so regressions are caught early. Route names are exact; field labels may vary slightly.

### B-2.0 ✅ Suppliers and purchases (GRN) (👤+🛠)
**Feature:** `/dashboard/suppliers/new`, `/dashboard/purchases/new`.
1. As **purchase_manager** create a supplier (name, GSTIN, state, credit days 30).
2. **Purchases → Record Purchase Invoice (GRN):** pick the supplier, supplier bill no `SB-001`, date today, one line: medicine, batch `PB1`, expiry next year, qty 100, free qty 10, rate ₹60 (excl. GST), MRP ₹100, GST 5%. Save.
3. Open the purchase detail page.
4. Try to save the **same supplier invoice number** again.

**Expected:** (2) a purchase is created; a **new batch `PB1` with quantity 110** (qty + free); a `stock_movements` row of type `purchase` with `balance_after = 110`; a balanced purchase journal (Dr Purchases + Input GST, Cr Supplier); a `gst_documents` row; GST split CGST = SGST = ₹150 on a ₹6,000 taxable line at 5%. SQL: `select qty_on_hand, purchase_rate from batches where batch_no='PB1';`. (4) refused (unique per supplier + invoice number).
**Known gap ❗ (landed cost):** by design the unit cost should spread the paid amount over paid **and free** units: 600,000 paise ÷ 110 = **5,455 paise**. Today `batches.purchase_rate` is **6,000** (the plain rate) and `purchase_items.landed_unit_cost` is empty, so margins on "10 + 1" deals are understated. `computePurchaseLine` in `src/lib/money.ts` already computes it (tested); the purchase action does not use it.

### B-2.0a ❗ Purchase totals must be computed on the server (🛠)
**Feature:** `createPurchaseInvoice` (`src/app/actions/purchases.ts`).
1. In `npx vitest` (or a scratch script) call `createPurchaseInvoice` with a line whose `taxableAmount`/`totalAmount`/`discountAmount` do not match `qty × rate`, discount and GST (e.g. qty 100 × ₹60 but `totalAmount` = 1).
2. Compare the stored `purchases.total_amount` and the journal.

**Expected:** the server recomputes every amount from qty, free qty, rate, discount and GST rate (with `computePurchaseTotals`) and either ignores or rejects the client's numbers; the journal always balances and equals the recomputed total; negative quantities/rates and GST rates outside `GST_RATES_BP` are rejected. **Today ❗:** the action stores the amounts the browser sends (`item.taxableAmount`, `item.totalAmount`, `item.discountAmount`), the same trust problem fixed for sales in A1.3. Recommended new roadmap item **B1.7** (purchase hardening: server-side totals, landed cost, inter-state purchases `igst`, free-qty rules) with a test file `tests/integration/purchase-totals.test.ts`.

### B-2.0b ✅ Item scheme / trade schemes
**Settings → Trade schemes → Create**: free-qty scheme "Buy 10 get 1".
**Expected:** saved and listed; toggling active/inactive works; the scheme is applied where `calculateBestScheme` is used (check the purchase form's scheme hint if present).

### B-2.0c ✅ Customers, family groups and loyalty (👤)
**Feature:** `/dashboard/customers`, `/dashboard/customers/groups`, `/dashboard/settings/loyalty`, `/dashboard/customers/[id]/loyalty`.
1. **Settings → Loyalty:** activate the program; *Earning Ratio* 1 point per ₹100; redemption ₹1 per point; minimum redemption 10 points.
2. Create customer *Ravi* with phone. Create a **family group** "Sharma Family", add Ravi and a second member.
3. As **cashier** bill ₹1,250 to Ravi.
4. Open Ravi's loyalty page.
5. Adjust points by +50 with a note.

**Expected:** (3) Ravi earns **12 points** (`floor(1250 / 100)`); `loyalty_transactions` has an `earn` row with `balance_after = 12` and `customers.loyalty_points = 12`. (4) the history lists it. (5) balance 62, an `adjust` row. The family-group page shows combined spend/balance for both members.
**Cross-lane:** redemption at the POS is not wired yet (B2.5 / A2.7).

### B-2.0d ✅ Omnichannel (external) orders and promise orders
1. **Omnichannel orders:** the list loads; open an order; move its status received → accepted → ready → delivered.
2. **Promise orders → New:** record a request for an out-of-stock medicine for a customer; change its status.

**Expected:** statuses change and persist; `external_orders`/`promise_orders` rows update; nothing crashes with an empty list. (API creation of external orders is covered by B-0.1.)

### B-2.0e ✅ Compliance registers (👤)
As **pharmacist**: **Compliance → Drug registers**, **Schedule H**, **Schedule H1**, **Narcotics**, **Prescriptions (Rx)**, **Doctor master**.
1. Add a doctor (name, registration number). 2. Create a prescription with 2 items. 3. Sell a Schedule H1 item in POS with doctor/patient details (see A-1.22). 4. Export the register CSV.

**Expected:** the doctor is unique by registration number (duplicate refused); the sale creates a register row (patient, doctor, batch, quantity, pharmacist); the CSV downloads with those rows.

### B-2.0f ✅ GST pages (👤)
As **accountant** after a few sales and purchases: **GST Overview**, **Outward (GSTR-1)**, **Inward (ITC)**, **Reconciliation**, **Returns & Filing**.
**Expected:** outward totals (taxable, CGST, SGST, IGST) equal the sum over the period's sales (`select sum(taxable_amount), sum(cgst), sum(sgst), sum(igst) from sales where status='completed';`); inward lists purchases with ITC; **Download GSTR-1 JSON** produces a file with `b2b`, `b2cs` (and `cdnr` once credit notes exist) sections and the right GSTIN/period. Reconciliation shows liability − ITC.

### B-2.0g ✅ Reports and dashboard
**Reports & Analytics**, **Expiry exposure**, **Stock movement (fast/slow/dead)**, **MR commissions**, dashboard KPIs; CSV exports from the sales, purchases and batches pages (`/api/export/*`).
**Expected:** numbers agree with the underlying tables for the selected range; date filters change results; exports contain the same rows as the screen; empty ranges show an empty state, not an error.

### B-2.0h ✅ Medical reps and commissions
**Settings → Medical reps:** add a rep with 2% commission; select them on a POS bill; open **MR commissions**.
**Expected:** the report shows the rep's sales and commission = 2% of the eligible amount.

### B-2.0i ✅ WhatsApp, SMS and reminders (simulator mode)
1. **Settings → WhatsApp / SMS:** leave providers **inactive** (simulator). 2. **WhatsApp → Templates:** create a template. 3. **Inbox:** send a manual message to a customer. 4. **Reminders:** create a refill reminder for tomorrow; run *Trigger due reminders* after changing the date to today.
**Expected:** with providers inactive, messages are **logged in the simulator** (no real send): `whatsapp_messages` rows with status `sent`; the reminder moves `pending → sent` with `sent_at`; no crash when no config exists.

### B-2.0j ✅ Bank reconciliation
**Accounting → Bank reconciliation:** upload a small CSV statement (date, description, debit, credit, balance), run *Auto-match*, manually match one line, unmatch it.
**Expected:** lines import; matches link to `payments` rows (needs payments: until A2.9/B2.4 create them, most lines stay `unmatched`: that is expected); match status changes persist.

### B-2.0k ✅ AI assistant (needs `GEMINI_API_KEY` or `GROQ_API_KEY`)
Press `Ctrl+J`. Ask: *"Low stock items?"*, *"Today's sales summary"*, *"Check interaction between ibuprofen and aspirin"*.
**Expected:** answers come from live data (compare with the Reports page); if the first model fails it falls back to the next; without API keys a friendly error appears. **Security expectation (will change with B6.1):** the assistant is scoped to your tenant/store; verify by asking about another pharmacy's data and getting none.

---

# PHASE 2 · Close the transaction loop (B2.1 – B2.7) ✅

### B-2.1 ✅ B2.1 Outbox worker and cron 🤝
**🛠**
1. `curl -i localhost:3000/api/cron/outbox` (no header).
2. `curl -i -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/outbox`.
3. Make a POS sale to a customer with a phone while the WhatsApp provider is unreachable. Check `select type, status, attempts, last_error, next_attempt_at from outbox_events;`.
4. Fix the provider and call the cron endpoint again.

**Expected:** (1) **401**. (2) **200** with counts. (3) the sale completes instantly and an event `whatsapp.receipt` is `pending`; failures increment `attempts` with exponential backoff (`next_attempt_at`), stop at 8 and become `failed`. (4) it becomes `done` with `processed_at`. Two workers at once never process the same event twice (`FOR UPDATE SKIP LOCKED`).

### B-2.2 ✅ B2.2 Purchase orders
1. **Purchases → Orders → New** for a supplier, 2 lines. 2. Approve (needs `purchase.approve`), mark sent, print. 3. **Receive** → the GRN form opens pre-filled; receive 60 of 100, then the rest. 4. Receive a medicine that has a pending **promise order**.

**Expected:** PO numbers `PO/26-27/000001`; status draft → approved → sent → partially received → received; `purchase_order_items.received_qty` increments and `purchases.purchase_order_id` is set; the promise order is flagged and the customer notified.

### B-2.3 ✅ B2.3 Purchase returns / debit notes
1. Return 10 of a received batch. 2. Try to return more than is on hand. 3. **Purchases → Expiry returns:** open the page with an expired batch.

**Expected:** stock -10 (`purchase_return`); debit note `DN/26-27/...`; journal Dr Supplier, Cr Purchases and Input GST; a GST debit note document; returning more than on hand is refused; the expiry page lists expired/near-expiry batches grouped by supplier with a one-click return draft.

### B-2.4 ✅ B2.4 Supplier ledger and payments (needs A2.9)
Open a supplier profile → ledger; **Pay** ₹5,000 against two bills.
**Expected:** a running balance (purchases, returns, payments); both bills marked settled/partly settled by allocation; a balanced journal; the payment is available for bank reconciliation.

### B-2.5 ✅ B2.5 Loyalty redemption and reversal 🤝
`npx vitest run tests/integration/loyalty.test.ts`
**Expected:** earn → redeem → return gives correct balances; redeeming below the minimum or above the balance is refused; concurrent redemptions cannot overspend (row lock on the customer); points are earned on the amount **actually paid**, excluding redeemed value; cancelling a sale reverses earned points.

### B-2.6 ✅ B2.6 GST documents for cancellations and returns 🤝
Cancel a sale (A2.4) and return an item (A2.5), then open **GST → Outward**.
**Expected:** a cancelled invoice is excluded from tables but counted as *cancelled* in the document summary; a return produces a **credit note** linked to the original invoice number/date (CDNR for B2B, adjustment for B2C); totals reconcile with the sales register.

### B-2.7 ✅ B2.7 Reminders via cron
Create refill reminders; call `/api/cron/reminders` with the secret.
**Expected:** due reminders become outbox events and are sent; customers who opted out (B5.6) are skipped; a refill reminder is auto-created for chronic medicines after a sale.

---

# PHASE 3 · Multi-store chain (B3.1 – B3.5) ⏳

### B-3.1 ⏳ B3.1 Chain-wide reports
As **owner** vs **manager** (single store), with data in 2 stores.
**Expected:** the owner can choose *All stores* / *Choose stores* (`report.all_stores`); the manager cannot (control hidden, URL parameters ignored); per-store numbers add up to the chain total; the owner chain dashboard shows sales, margin, stock value, near-expiry value, low-stock count per store.

### B-3.2 ⏳ B3.2 Reorder suggestions
**Purchases → Reorder.** Medicine with on-hand 5, reorder level 10, average daily sales 2, lead time 3 days.
**Expected:** suggested quantity = `max(0, ceil(2 × (3 + 7)) + 10 − 5 − inTransit − onOrder)` = **25** (adjust for in-transit/open PO); grouped by supplier; *Create PO* and *Request from warehouse* work; `max_stock` is respected.

### B-3.3 ⏳ B3.3 Central purchasing
Create a PO for the warehouse with a per-branch distribution plan, receive it, click *Create transfers*.
**Expected:** one transfer per branch with the planned quantities; split PO creates one PO per branch for the same supplier.

### B-3.4 ⏳ B3.4 Per-GSTIN returns and transfer invoices 🤝
Chain with stores in two states (two GSTINs); transfer stock between them.
**Expected:** two separate GSTR-1 files (pick the GSTIN, not the store); the inter-GSTIN transfer is a **B2B outward supply** for the sender's GSTIN and an **inward supply with ITC** for the receiver's; same-GSTIN transfers create only a delivery challan.

### B-3.5 ⏳ B3.5 Expiry redistribution
Create a near-expiry batch in store X and a faster seller in store Y.
**Expected:** **Reports → Expiry redistribution** suggests moving the quantity X → Y; *Create transfer* opens a draft (Lane A API).

---

# PHASE 4 · Import wizard (B4.1 – B4.5) ⏳

### B-4.1 ⏳ B4.1 Import data model
`\d import_jobs` and `\d import_job_rows` exist (migration). Creating a job and adding 1,000-row chunks stores rows with `status`.

### B-4.2 ⏳ B4.2 Presets and normalisers (🛠, needs B0.8 samples)
`npx vitest run tests/unit/import-normalize.test.ts`
**Expected:** `31/12/2026` and `12/26` (MM/YY → last day of month) parse to dates; `₹1,234.50` → 123450 paise; `12%` → 1200 bp **with the GST 2.0 offer** (convert to 5%); phones → 10 digits; GSTINs upper-cased and validated; `Sch H1` → `H1`; header synonyms map (`Item Name`/`ITEMNAME`/`Product` → name); medicine matching: barcode first, then name+pack+manufacturer, similarity > 0.6 as "possible match".

### B-4.3 ⏳ B4.3 Import wizard UI
**Import → New import** → Items: upload a CSV; check the auto-mapping; validate; fix/skip error rows; resolve ambiguous matches (*create new / match existing / skip*); commit.
**Expected:** each step shows counts (rows, valid, errors); error rows can be fixed inline or skipped; a 5,000-row file never freezes the browser (parsed client-side, sent in 1,000-row chunks); permission `settings.manage` required.

### B-4.4 ⏳ B4.4 Commit and opening balances 🤝
Import items, batches, customers, suppliers and balances.
**Expected:** opening stock creates batches and `stock_movements` of type `opening` (the ledger rule holds: A-1.23 SQL returns no rows); customer/supplier opening balances create one balanced opening journal each (via Lane A's `postOpeningBalance`); **re-running the same file creates nothing new** (idempotent by `external_ref`); a job survives a crash and shows progress.

### B-4.5 ⏳ B4.5 Import integration tests
`npx vitest run tests/integration/import-commit.test.ts` → a synthetic 2,000-item / 3,000-batch file imports in under 2 minutes; a re-run is a no-op; trial balance still balances.

---

# PHASE 5 · Real integrations (B5.1 – B5.6) ⏳

### B-5.1 ⏳ B5.1 Real e-invoice via a GSP (sandbox first)
`EINVOICE_MODE=sandbox`, tenant AATO above ₹5 crore, B2B sale.
**Expected:** an outbox job generates the IRN; the invoice shows the **signed QR** (decodes to a JWT) and a 64-character IRN; cancellation works within 24 h; B2C sales are not sent; for AATO ≥ ₹10 crore an invoice older than 30 days is refused; credentials are stored encrypted (B-0.4).

### B-5.2 ⏳ B5.2 E-way bill
Transfer between two GSTINs worth more than ₹50,000; enter vehicle number and distance.
**Expected:** an e-way bill number and validity are stored on the GST document.

### B-5.3 ⏳ B5.3 GSTR-2B / IMS reconciliation
Upload a GSTR-2B JSON for the month.
**Expected:** each line is `matched` / `mismatch` / `missing in books` / `missing in 2B` (supplier GSTIN + invoice no + date + amount with tolerance); an action list for the IMS accept/reject export; re-uploading the same file does not duplicate lines.

### B-5.4 ⏳ B5.4 WhatsApp production and public receipt link
1. Open a receipt link `/r/<token>` in a private window. 2. Change one character of the token. 3. Send a template message and watch status updates.
**Expected:** (1) a read-only receipt showing only that invoice, no login needed; (2) 404, no data; (3) status moves sent → delivered → read from Meta's webhooks; business-initiated messages outside the 24-hour window use approved templates only.

### B-5.5 ⏳ B5.5 SMS DLT compliance
Try sending an SMS with a template that has no `dlt_template_id`.
**Expected:** blocked with a clear message; registered templates send with the DLT id and sender id.

### B-5.6 ⏳ B5.6 DPDP consent and data-subject tools
1. Create a customer at the POS: the one-tap consent capture. 2. Send a **marketing** message to a customer who only consented to transactional. 3. Customer **Privacy** page: export data; request erasure.
**Expected:** consent rows per purpose; (2) refused; (3) export is a JSON of that customer's data; erasure **anonymises** name/phone/address on non-statutory records but keeps statutory registers, with an explanation.

---

# PHASE 6 · Hardening & launch (B6.1 – B6.6) ⏳

### B-6.1 ⏳ B6.1 AI assistant hardening
1. As **cashier** ask the AI to *add a medicine*. 2. As **owner** ask the same. 3. Check `select tool, status, model, latency_ms from ai_actions order by created_at desc;`
**Expected:** (1) refused or not offered (tools respect permissions). (2) a **proposal with a Confirm button**, nothing written until confirmed (`pending_confirmation → confirmed`). (3) every tool call is logged. Rate limit per user works. `src/app/api/chat/route.ts` has no `// @ts-nocheck`.

### B-6.2 ⏳ B6.2 AI chores (stretch)
*"Draft this week's purchase order"*, *"What should I move between branches?"*
**Expected:** drafts only (PO draft, redistribution suggestion); a human confirms each action.

### B-6.3 ⏳ B6.3 Onboarding wizard
Register a new pharmacy.
**Expected:** steps: business details (GSTIN → state auto-filled) → first store (licence number, prefix with live 16-character check) → import or seed catalogue → invite staff → print a test bill. The store's state code is **never** `00`.

### B-6.4 ⏳ B6.4 Inspector and CA exports
**Expected:** one click produces an *Inspection pack* (H, H1, X, narcotics registers as PDF/CSV, scheduled-drug purchase invoices, pharmacist on duty) and a *CA pack* (GSTR-1 JSON, sales/purchase registers, trial balance, P&L, stock valuation) for a chosen month.

### B-6.5 ⏳ B6.5 User help
The `?` shortcuts modal links to task-based guides (first bill, returns, transfers, GST filing, offline mode); the links open.

### B-6.6 ⏳ B6.6 Pilot
Two weeks in parallel with the existing software; daily totals reconcile (sales, GST, stock value); feedback logged as GitHub issues labelled `pilot`.

---

# Cross-lane integration tests

| ID | Status | What | Steps | Expected |
|---|---|---|---|---|
| X-1 | ✅ | Sale → GST document | Make a sale (A-1.20); `select * from gst_documents where ref_type='sale' order by created_at desc limit 1;` | One document with the sale's taxable/CGST/SGST totals. |
| X-2 | ✅ | Sale → loyalty points | B-2.0c step 3 | `earn` row; a failure in this step never loses the sale (A-0.10). |
| X-3 | ✅ | Loyalty redemption at POS | A-2.7 + B-2.5 | Points deducted, bill reduced, reversed on cancel/return. |
| X-4 | ✅ | Receipt via outbox | B-2.1 | Sale completes instantly; message sent on the next cron run. |
| X-5 | ⏳ | Inter-state sale | B-1.2 | IGST only; GSTR-1 B2B. |
| X-6 | ⏳ | Prescription dispensing | B-1.4 | `quantity_dispensed` rises; over-dispensing refused for H1/X. |
| X-7 | ✅ | Supplier payment | B-2.4 | Balanced double-entry journal; payment recorded for bank reconciliation. |
| X-8 | ⏳ | Transfer → GST | A-3.4 / B-3.4 | Tax invoice for inter-GSTIN transfers. |
| X-9 | ⏳ | Import → opening stock/balances | B-4.4 | `opening` movements and opening-balance journals. |
| X-10 | ✅ | Permissions on Lane B pages | B-1.5 | Cashier/auditor/etc. match the matrix; menu hides what the page would refuse. |

---

# Appendix: handy commands

```bash
npm run db:reset                 # clean local DB + logins
npm run db:migrate               # apply migrations + sync system roles
npm run db:seed-users            # (re)create role logins
npm run db:studio                # browse the DB
npm test                         # all tests   |   npx vitest run tests/unit   (no DB needed)
npm run typecheck && npm run lint:strict
```

**Adding a Lane B action (checklist):** `protectedAction("perm")` with a Zod schema; ids only from `ctx`; every query scoped by `ctx.tenantId` (and `ctx.storeId`); `DomainError` for expected failures; a row in the permission matrix test; a nav `permission` that matches the page's `requirePagePermission`; update this guide.

**Reporting a failure:** note the test ID, the role, the URL/command, what you expected and saw, plus the server console output.
