# Marg ERP vs MediFlow: Verified Gap Analysis (v2)

> **Date:** 25 November 2026
> **Codebase audited at:** `main` @ `5de601a` (after PR #100: scanner bridge, drug catalog, CDSCO watchlist, doctor QR)
> **Supersedes:** v1 of this file (first AI draft, same day). v1 cited no sources. It also had several codebase claims that were wrong or out of date. §1 lists every correction.
> **Companion docs:** `docs/MARG_COMPETITIVE_RESEARCH.md` (Oct 2026 strategy), `docs/MARG_KEYBOARD_PARITY.md`, `ROADMAP.md`, `MANUAL_TESTING.md`, `docs/05-domain-pharmacy-india.md`
> **Platform (decided 25 Nov 2026):** MediFlow ships **only as a Tauri 2 desktop app**, on Windows first, then macOS, and Linux where possible. There is no web version. Every gap in this file is judged for that target. §1.1 lists what this changed.

---

## 0. Brief overview: what this file covers

This file lists everything Marg ERP gives an Indian pharmacy that MediFlow does not have yet. That covers features, workflows, compliance, hardware, ecosystem, commercial model and support. For each item it records three things:

1. **What Marg actually does.** Each item links to a source, most often Marg's own help centre (`care.margcompusoft.com`), which documents real menus and settings. Marketing copy is marked as such. Claims we could not source are marked **unverified**, not stated as fact.
2. **What MediFlow does today.** This comes from reading the code at `5de601a`, with file paths, so you can check it in seconds.
3. **What to do about it:** severity, rough effort, owning lane, and a suggested approach.

### Sections

| § | Section | What you get |
|---|---|---|
| 1 | **Corrections to v1** | 17 places where the first draft was wrong, stale or unsourced, plus 9 changes from the desktop-only decision (§1.1) and 2 tax-law updates (§1.2) |
| 2 | **Executive summary** | The 12 gaps that decide whether a chemist switches |
| 3 | **Quick wins** | 15 gaps that are 80% built or under 3 days of work |
| 4 | **Master gap matrix** | ~130 rows across 14 domains, each with evidence grade, MediFlow status, severity, effort and lane |
| 5 | **Domain deep-dives (A–N)** | Detailed findings, Marg menu paths, MediFlow code references and approaches |
| 6 | **2025–26 regulatory changes** | GST IMS/3B lock, 30-day IRN, Schedule H2 QR expansion, new FDC bans, ABDM incentive |
| 7 | **Where Marg is weak** | Documented weaknesses MediFlow can sell against |
| 8 | **Where MediFlow already leads** | Verified strengths, and where v1 overstated them |
| 9 | **Closure plan** | Sequenced for two part-time devs, mapped to Lane A / Lane B |
| 10 | **Marg demo checklist** | Questions to put to a Marg dealer to settle the unverified items |
| 11 | **Out of scope** | Things Marg has that we decided not to build, and why |
| 12 | **Sources** | Every URL used |

### Legend

**Evidence grade (Marg side)**

| Grade | Meaning |
|---|---|
| ✅ **Verified** | Documented in Marg's help centre or tutorials with a menu path or setting, or in a bank/partner press release |
| 🟡 **Marketing** | Stated only on Marg's marketing pages or blog. Probably real, but no detail on how it works |
| ❓ **Unverified** | No source found. It may exist, or it may be a general market need Marg does not meet. Check in a demo (§10) |

**MediFlow status**

| Status | Meaning |
|---|---|
| `MISSING` | Nothing in schema, backend or UI |
| `PARTIAL` | Some of it exists, but a pharmacy-critical part is missing |
| `UNWIRED` | The code exists but nothing calls it, or the UI is missing. Cheapest category to close |
| `STUB` | Placeholder or simulated code path that does nothing in production |
| `BUILT` | Parity or better |
| `OUT` | Out of scope by product decision (2026-10-20) |

**Severity:** **P0** blocks a paid pilot or creates legal risk · **P1** blocks switching for most chemists · **P2** matters to one segment (wholesale, chains, hospital) · **P3** nice to have or strategic.

**Effort** (rough, for one dev who knows the codebase): **S** ≤ 3 dev-days · **M** 1–2 weeks · **L** 3–6 weeks · **XL** more than 6 weeks or needs an outside partner or certification. At 10–15 h/week per dev, multiply calendar time by about 3.

**Lane** (from the 2026-10-20 split): **A** = platform/RBAC, POS, inventory, accounting core, offline, desktop/ops · **B** = purchasing, compliance, GST/e-invoice, CRM, comms, reports, AI, Marg import.

---

## 1. Corrections to v1

The first draft was a strong skeleton. These items were wrong, stale or unsourced, and the rest of this document is built on the corrected picture.

| # | v1 said | Actually true (evidence) | Effect |
|---|---|---|---|
| 1 | Sales schemes are `MISSING`; there is no scheme engine | A `schemes` table exists (`src/server/db/schema/purchasing.ts:168`) with `free_qty / percentage / flat / tiered` types, validity dates and store/supplier/medicine/category scope. There is also `getApplicableSchemes()` in `src/server/domain/schemes.ts` and a settings UI at `/dashboard/settings/schemes`. The POS shows a `schemeText` badge (`CartTable.tsx:203`). **But** `sale_items` has no `freeQty`, and `createSale` never applies a scheme. | `PARTIAL`, not `MISSING`. Smaller job: wire the existing engine into the sale and add free-qty lines. |
| 2 | Fixed 8 roles; custom roles are impossible | Roles already live in the DB per tenant (`roles` + `role_permissions`, `platform.ts:128–148`, with an `isSystem` flag). `src/server/roles.ts` notes that "custom roles are never touched". Only the UI is missing: `/dashboard/settings/roles` is read-only. | `UNWIRED`. Custom roles need a create/edit form, not a schema change. |
| 3 | Refill reminders must be scheduled by hand | `ReminderService.createRefillReminder()` exists (`src/server/domain/reminders.ts:9`), and so does a WhatsApp `sendRefillReminder` template. **Nothing calls either.** | `UNWIRED`. About a day of work: call it from `createSale` when the line has a days-supply. |
| 4 | Supplier item matching is "purely exact" | True for distributor bill import (`distributor-invoice.ts:438`, exact lower-cased name). **But** a three-stage matcher (barcode, then name+pack, then Dice fuzzy) already exists in `src/server/domain/import/match.ts:129` and is not used there. | Half of the mapping fix is already written. The persistent `supplier_item_map` table is still missing. |
| 5 | No CDSCO banned-drug check and no drug catalog | Out of date since `d94a66e`: `src/lib/indian-drug-catalog.ts` has a **46-brand** offline catalog and **8** banned-FDC rules. They only run during medicine AI-enrichment and stock OCR, **not at POS or GRN**. The government has banned 156 FDCs (Aug 2024), 16 more (Jun 2026), and 344 in 2016. | `PARTIAL`. Coverage is about 2%, and the check sits at the wrong point in the flow. |
| 6 | Print formats are A4 and 80 mm only | Store settings already allow `thermal_58mm` (`platform.ts:63`). Billing templates allow only `a4 \| thermal_80mm` (`sales.ts:199`). | A5 is still missing. 58 mm is a template gap, not a missing printer mode. |
| 7 | Marg has a configurable **minimum margin %** lock | Marg documents **"Indicate-Y / Ban-B if Sales Rate < Purchase Rate or S.Rate > MRP"** and a "Loss indication on cost+margin %" switch ([Marg Care](https://care.margcompusoft.com/margerp/batch/175/1/How-to-enable-indication-if)). No configurable minimum-margin floor was found. | The parity target is a below-cost or above-MRP **warn/ban**, which is simpler. A margin floor would be a MediFlow extra. |
| 8 | Connected banking with **140+ banks**, including NEFT/RTGS payouts | Payouts from inside the ERP are documented for **ICICI** ([ICICI 2018](https://www.icici.bank.in/about-us/news-room/2018/news-marg-erp-limited-partners-with-icici-bank)). Marg names **SBI, ICICI, Axis and J&K Bank** as integrations. "140+ banks" refers to **auto bank reconciliation**, meaning statement fetch ([Marg](https://margcompusoft.com/connecting-banking.html)). | Downgraded to P2. Statement import matters more than payouts. |
| 9 | Cheque-leaf printing for all major banks | Not found in Marg docs. The **PDC register, pay-in-slip, clearance and cheque dishonour are verified** ([PDC](https://care.margcompusoft.com/margerp/pd-cheques-cash/84768/1/null), [dishonour](https://care.margcompusoft.com/margerp/cheque-dishonored-advance/2226/1/trees)). | Cheque printing marked ❓. The PDC lifecycle stays P1. |
| 10 | TB reporting in **Ni-kshay** format | Marg has a **TB Report** under *Stocks › Department Reports* ([Marg Care](https://care.margcompusoft.com/margerp/departments-reports/43925/1/How-to-see-TB-Report)). A Ni-kshay export format is not documented. | Parity target is a TB register or report. Ni-kshay export is ❓. |
| 11 | Marg Genie is a prescription or rack photo app | Marg Genie turns a **photo of a purchase bill into a purchase import** ([Marg](https://margcompusoft.com/marg-genie/index.html)). | It competes directly with our GRN OCR (see #12). |
| 12 | AI OCR is a clear MediFlow lead | **Marg ERP AI+** now markets AI/OCR purchase import from photo, PDF and Excel, plus "AI reports" sold through Marg Wallet at ₹49/month ([AI page](https://margcompusoft.com/m/ai-erp-software/), [AI reports](https://care.margcompusoft.com/margerp/all-ledgers/186599/1/how-to-check-ledger-balance-with-ai-in-marg-erp-software)). Their documented PDF import still needs **a column template per supplier** ([Marg Care](https://care.margcompusoft.com/margerp/transaction-import/165197/1/import)). | The lead is narrower than v1 claimed. It is about quality and zero setup, not about having the feature. |
| 13 | ARC (annual renewal) ₹2,400–₹19,100/yr | List prices are confirmed: Nano ₹5,550 · Basic ₹10,300 · Silver ₹13,900 · Gold ₹26,000 + 18% GST, and each extra user ₹3,000 ([eChai, read from Marg's price list](https://echai.ventures/explore/tools/marg-erp)). ARC figures conflict between sources (one listing: Basic ₹3,000 · Silver ₹4,200 · Gold ₹7,200). Dealers discount (Basic about ₹8,100) because Marg does not enforce list price ([ERPResearch](https://www.erpresearch.com/pricing/marg-erp)). | Pricing is better sourced. ARC marked uncertain. |
| 14 | ">70% of stockists run Marg", "85–90% of CAs use Tally", "1,000+ Control Room switches", ">98% of counters on Windows" | No source found for any of these. | Removed or reworded as estimates. Do not put them in pitch decks. |
| 15 | HR/payroll (HRXpert) and a consumer storefront are P3 gaps | The 2026-10-20 product decision put **HR/payroll and storefront out of scope**. | Moved to §11. |
| 16 | Not mentioned | **ABHA billing earns chemists ₹20 per ABHA-linked bill** under the ABDM DHIS incentive, and Marg ships this flow ([Marg ABHA](https://margcompusoft.com/marg-abha-partnership.html)). | New **P1**: it gives the chemist money, not just compliance. |
| 17 | Not mentioned | MediFlow **invents an MRP** (`PTR × 1.3`) when a distributor bill lacks one, and hard-codes sale rate = `PTR × 1.25` (`distributor-invoice.ts:401,404`). An invented MRP printed on a bill is a Legal Metrology risk. | New **P0** quick win (§3). |

### 1.1 Changes from the desktop-only decision (25 Nov 2026)

The first pass of v2 assumed MediFlow would run in a browser as well as in Tauri. With desktop-only on three OSes, these findings changed:

| # | Before | Now (desktop-only, Windows + macOS + Linux) | Effect |
|---|---|---|---|
| D1 | Printing gap = the Windows stub | **macOS has no print path at all.** `print_raw_bytes` has only `windows` and `linux` branches, so on macOS it falls through to `println!("Dispatched…")` and **returns `Ok(())`**: the app reports success and prints nothing. Printer discovery on macOS returns the hard-coded fallback list. Linux ignores `lp` errors and reports success too (`printer.rs:97–130`). | J-block split per OS. macOS print is a quick win (CUPS is built into macOS, so the Linux `lp -o raw` path can be shared via `cfg(unix)`) |
| D2 | Not covered | **There is no production desktop build.** `tauri.conf.json` loads `devUrl: localhost:3000` in dev and `frontendDist: "../../out"` in production. But `next.config` builds `output: "standalone"` (a Node server), `out/` doesn't exist, and the app depends on server actions and API routes, which a static export can't contain. Today the desktop app only works next to a dev server. | New **P0** N8: choose how the desktop app gets its UI and backend (§5-N) |
| D3 | Offline POS "per terminal, Tauri SQLite" (§8) | **Wrong.** Offline storage is **IndexedDB via Dexie** inside the webview (`src/offline/db.ts`). `src/desktop/sqlite-storage.ts` is an interface with no implementation and no Tauri SQL plugin (`Cargo.toml` has only `tauri` and `windows-sys`; no `@tauri-apps/*` JS packages). The offline design (`docs/10-offline-pos-design.md`) is a **browser PWA**: a service worker (`public/sw.js`, `RegisterSW.tsx`) caches the app shell. | Service workers are not dependable inside Tauri's webviews: they need an http(s) origin, and support in WKWebView/WebKitGTK is limited. **Offline cold start is unproven on desktop.** N1 rewritten. `docs/10-offline-pos-design.md` needs a desktop revision |
| D4 | "Printing is a browser feature" (offline doc) / HTML A4 templates print via the browser | `window.print()` from the webview is reliable on WebView2 but **has historically been unreliable in WKWebView on macOS**. Tauri 2 offers a native webview print call. Raw ESC/POS through the Rust bridge avoids the issue for thermal. | K1/K2 (A4/A5 templates) need a per-OS print test. Rust raw print stays the primary path for counters |
| D5 | Ship = deploy a website | Desktop needs **installers, code signing (Windows SmartScreen, macOS Developer ID + notarisation), auto-update, single-instance lock**, and local data protection. Marg ships an installer with update patches. | New N9–N11 rows |
| D6 | Backup = "download my data" from the web app | A desktop app can write **scheduled backups straight to a local folder, a USB drive or a synced Google Drive/OneDrive folder**, which is exactly Marg's model. | N2 easier, P1 → S/M |
| D7 | WhatsApp: BSP only | Desktop can also open **WhatsApp Desktop by deep link** (`whatsapp://send?phone=…&text=…`) with the bill link, as a zero-setup fallback for day one. This is Marg's "local computer" mode without Chrome automation. | L1 has a cheap first step |
| D8 | Keyboard: browser-reserved keys (Ctrl+W/N/T/Tab) | All free in Tauri. The real traps are WebView2 reload/find/print accelerators, macOS media-key F-row and missing End/Insert keys, and Linux desktop shortcuts on Alt+F-keys. | See `docs/MARG_KEYBOARD_PARITY.md` §4 |
| D9 | Mac/Linux: not considered | Marg ERP 9+ is sold as a Windows program. Third-party listings disagree on whether a Mac version exists ([Flipkart listing](https://www.flipkart.com/marg-erp-9-accounting-software-basic-edition/p/itm687aff49c0bec), [Capterra](https://www.capterra.com/p/151832/Erp-Software-9/)). | Potential **MediFlow lead** (N12) if our macOS/Linux builds are first-class. Confirm Marg's position in the demo (§10) |

### 1.2 Tax-law updates found while planning (25 Nov 2026)

| # | Before | Now | Effect |
|---|---|---|---|
| T1 | G10: build TCS under s.206C(1H) on sales > ₹50 L | The Finance Act, 2025 **omitted s.206C(1H) from 1 April 2025**. The Income Tax Department says TDS by the buyer (old s.194Q) now applies to these sales ([Income Tax Dept](https://www.incometaxindia.gov.in/w/tds-on-purchase-of-goods), [TaxGuru FAQ](https://taxguru.in/income-tax/tcs-sale-goods-removed-april-1-2025-faqs.html)). Marg's help pages on it date from 2021. | **G10 dropped.** Don't build TCS on goods |
| T2 | G9: TDS under s.194Q/194C/H/I/J, Form 26Q | The **Income-tax Act, 2025 is in force from 1 April 2026**. TDS sections are consolidated into a table under **s.393**, and the quarterly non-salary TDS return **Form 26Q becomes Form 140** (first return: Q1 of tax year 2026-27) ([press release](https://www.incometaxindia.gov.in/documents/d/guest/press-release-income-tax-act-2025-comes-into-force-from-01-april-2026-pdf), [tax portal FAQ](https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/tds-compliance), [ClearTax summary](https://cleartax.in/s/tds-and-tcs-changes-from-april-2026)). The new table entry for TDS on purchase of goods was not confirmed in this research. | G9 must use the new Act's labels and forms. CA confirms the table entries before coding |

**Not in v1 at all** (added in this version): the Marg Wallet pay-per-use model, MargPay moving to PayU (Aug 2026), Collaborative Commerce by GSTIN/email/mobile, the 2026 GST changes (IMS mandatory, GSTR-3B Table 4 lock, 30-day IRN reporting), the **June 2026 Schedule H2 QR expansion**, the **June 2026 16-FDC ban**, documented Marg weaknesses (§7), and a demo checklist (§10).

---

## 2. Executive summary: the 12 gaps that decide a switch

A chemist judges new software in the first 20 minutes of a demo and the first month of use. Ranked by how likely each gap is to lose the deal:

1. **The desktop app can't ship, and can't print on Windows or macOS.**
   - There is no production build path: `frontendDist` points at a static export that the app can't produce (§1.1 D2).
   - On **Windows**, `printer.rs:85–95` only `eprintln!`s.
   - On **macOS** there is no print code at all, and the function **reports success** anyway.
   - On **Linux**, `lp` errors are swallowed.
   - Printer discovery returns hard-coded names on Windows and macOS.

   Most Indian counter PCs run Windows, so Windows comes first. *(P0 · M–L · A)*
2. **Counter staff can see purchase cost and margin.** There is no `cost.view` permission, and Cashier has `inventory.view` and `medicine.view` (`src/lib/permissions.ts:92`). Marg hides cost, purchase rate and margin per operator ([Marg Care](https://care.margcompusoft.com/margerp/advance-control-/371/1/How-we-can-hide-item)). Owners will not let staff use the app until this is fixed. *(P0 · S–M · A)*
3. **No negative-stock billing option.** Marg offers Y / N / Store / Item-wise, plus a per-operator power ([Marg Care](https://care.margcompusoft.com/margerp/inventory/119944/1/How-to-sale-new-batch)). We always block, so "the stock arrived but the GRN isn't typed yet" turns into a lost sale. *(P0 · M · A)*
4. **Sale schemes and party pricing.** Marg has qty-wise rate/scheme, half-scheme, "My Own Sales Scheme", party-wise company discount, party categories and item-party special prices ([§5-A](#a-pos-billing--pricing)). We have the scheme engine but do not apply it to sales, and we have one sale rate. *(P1 · M · A)*
5. **E-invoice and e-way bill go to a placeholder host** (`gsp.mediflow.in`, `gsp-provider.ts:56–57`). Since April 2026 an IRN must be reported within 30 days for AATO ≥ ₹10 Cr, so this matters to chains, our primary customer. *(P0 for chains · L/XL · B)*
6. **Accounting basics a CA asks about first:** manual Journal and Contra vouchers, PDC and cheque dishonour, a `cheque` payment method (`accounting.ts:99` has only `cash | upi | card | bank`), and **Tally XML export** (Marg exports masters and day book as XML for Tally ERP 9 and Prime: [Marg Care](https://care.margcompusoft.com/margerp/data-import-export/182029/1/how-to-export-marg-data-and-import-in-tally-prime-software)). *(P0/P1 · M each · A)*
7. **Distributor bills: no remembered item mapping, no `.xlsx`, no rate-difference alert.** Marg flags "Diff Rate" during purchase entry ([Marg Care](https://care.margcompusoft.com/margerp/purchase/3957/1/At-the-time-of-Purchase)). Our import does exact name matching and rejects `.xlsx`. *(P1 · M · B)*
8. **Collaborative Commerce: the distributor's bill becomes the chemist's purchase.** Marg pushes it by GSTIN, email, mobile or E-code ([Marg Care](https://care.margcompusoft.com/margerp/collaborative-commerce/166557/1/collab)). This is Marg's strongest lock-in. We cannot join their network, but we can match it with email ingestion plus AI OCR (§5-C). *(P1 · L · B)*
9. **Drug master.** Marg has PharmaNXT (Marg says ~5 lakh medicines; the app store says 1.5 lakh) for salt, substitute and HSN lookup, plus "which distributor nearby stocks it" ([Marg](https://margcompusoft.com/pharmanxt_app.html)). We have 46 brands. *(P1 · L, data licensing · B)*
10. **Hindi and regional-language bills.** Marg prints Hindi, Tamil and Telugu bills and item names through Self Format ([Marg Care](https://care.margcompusoft.com/margerp/gui-format/91744/1/inffast)). We have no i18n. *(P1 · M for print, L for UI · A)*
11. **TDS on purchases (old s.194Q) and composition scheme (CMP-08, GSTR-4).** Both are documented in Marg ([TDS](https://care.margcompusoft.com/margerp/tds-tcs-reportss/171029/utils/messages), [CMP-08](https://care.margcompusoft.com/margerp/gst-register---return/149818/1/inffast)). Chains over ₹10 Cr need TDS on purchases. Small shops are often composition dealers. TCS on sale of goods (s.206C(1H)) no longer exists, and TDS now runs under the Income-tax Act, 2025 (§1.2). *(P1 · M each · B)*
12. **ABHA-linked billing with the ₹20/bill incentive.** Marg markets this hard ([Marg](https://margcompusoft.com/marg-abha-partnership.html)). It is the rare gap that lets a salesperson promise the chemist new income. *(P1 · L, needs ABDM HIP/HFR onboarding · B)*

**The non-feature moat.** Marg says it has 850+ sales and support centres and over 1 million business users (Marg site; [PayU press, Aug 2026](https://cxotoday.com/media-coverage/payu-and-marg-erp-join-forces-to-simplify-digital-payment-collections-and-reconciliation-for-indias-pharma-distributors-and-msmes/)). Its operators already know its keyboard flows, and CAs know its reports. Features alone will not beat that. §7 and §9 cover how to compete: free white-glove migration, Marg-style shortcuts, Tally XML, and selling against Marg's support reputation.

---

## 3. Quick wins: mostly built already, or ≤ 3 days

Do these first. Each one closes a visible gap at almost no cost.

| # | Fix | Where | Effort | Lane |
|---|---|---|---|---|
| Q1 | **Stop inventing MRP and sale rate on import.** If MRP is missing, leave the line blocked for review instead of `PTR×1.3`. Derive the sale rate from a store pricing rule, not `×1.25`. | `src/server/domain/import/distributor-invoice.ts:398–404` | S | B |
| Q2 | Call `createRefillReminder()` from `createSale` when a line has a days-supply (qty ÷ daily dose). Add a `daysSupply` input on POS lines. | `reminders.ts:9`, `create-sale.ts` | S | A |
| Q3 | Use the existing three-stage `match.ts` matcher in distributor bill import instead of the exact-name `Map` lookup. | `distributor-invoice.ts:316–449` → `import/match.ts` | S | B |
| Q4 | Run `checkCdscoBannedFdc()` at **POS add-line** and **GRN line save** with a hard block plus audit entry, not only during enrichment. | `indian-drug-catalog.ts:184`, POS cart, purchase entry | S | A+B |
| Q5 | Add `cheque` (and `neft`/`rtgs`) to `payments.method` with cheque number, bank and date fields. | `schema/accounting.ts:99`, receipts and supplier pay UIs | S | A |
| Q6 | Add a `cost.view` permission. Strip `purchaseRate`/`purchasePrice`/margin from queries and pages for roles without it, and remove it from Cashier and Pharmacist by default. | `src/lib/permissions.ts`, inventory/batch queries, POS search | S–M | A |
| Q7 | Add a **sale rate below purchase rate** and **sale rate above MRP** check in `createSale`, with a store setting `off \| warn \| block` (Marg's "Indicate-Y / Ban-B"). | `create-sale.ts` near the `maxDiscountBp` check (l.156) | S | A |
| Q8 | Add a custom-role create/edit UI on the existing `roles`/`role_permissions` tables. | `/dashboard/settings/roles/page.tsx` (read-only today) | S–M | A |
| Q9 | Add an **A5 half-page** billing template format, and a 58 mm template. | `BillingTemplateFormat` in `sales.ts:199`, template engine | S | A |
| Q10 | Accept `.xlsx` in distributor bill import, using SheetJS converted to rows before the existing CSV pipeline. | `distributor-invoice.ts`, `stock-csv-validator.ts:15` (currently rejects it) | S | B |
| Q11 | Add a **"Stock going negative"** warning, and allow negative stock per store/item for trusted roles (`opts.allowNegativeStock` is already plumbed through `create-sale.ts:216`). | `create-sale.ts`, `allocate-fefo.ts`, store settings | M | A |
| Q12 | Add a "short book" key on POS search that logs demand for out-of-stock items without a customer phone, and feeds the reorder screen. Marg uses the `*` key ([Marg Care](https://care.margcompusoft.com/margerp/re-order-management/52251/1/how-to-generate-re-order-on-shortage-bases-in-marg-software)). | POS search, `promise-orders`/`reorder` | S | A+B |
| Q13 | **macOS printing via CUPS.** Change the Linux `lp -o raw` branch and the `lpstat` discovery to `cfg(unix)`, since CUPS ships with macOS. | `desktop/src-tauri/src/printer.rs:25,97` | S | A |
| Q14 | **Stop faking success.** Return `Err` when no OS print path ran or `lp` exits non-zero, instead of `println!` + `Ok(())`. The POS must show "not printed, retry". | `printer.rs` end of `print_raw_bytes` | S | A |
| Q15 | Add the **single-instance** plugin, so two copies of the POS on one PC can't double-sync or fight over bill numbers. | `desktop/src-tauri/src/lib.rs` | S | A |

---

## 4. Master gap matrix

Evidence links for each row are in §5 and §12. Rows marked `BUILT` are included so the matrix shows the whole surface.

### A. POS, billing and pricing

| ID | Capability | Marg | MediFlow | Sev | Eff | Lane |
|---|---|---|---|---|---|---|
| A1 | Qty-wise rate / scheme (10+1, slabs) at **sale** | ✅ | `PARTIAL`: engine exists, not applied to sales; no `freeQty` on `sale_items` | P1 | M | A |
| A2 | Half scheme / custom scheme per qty 1–10; "My Own Sales Scheme" auto-load | ✅ | `MISSING` | P2 | S | A |
| A3 | Party-wise company discount; party categories; item-party special price; party bill discount | ✅ | `MISSING`: customer groups are family credit pools, not price lists | P1 | M | A |
| A4 | Multiple rate columns (MRP / sale / PTR / PTS / cost) and sale rate derived from purchase rate + % | ✅ ([sale rate from purchase](https://care.margcompusoft.com/margerp/batch/411/1/How-to-generate-Sale-Rate)) | `PARTIAL`: single `saleRate` per batch; import hard-codes ×1.25 | P1 | M | A+B |
| A5 | Sale < purchase rate / sale > MRP: indicate or ban | ✅ | `MISSING` (only `maxDiscountBp`) | P0 | S | A |
| A6 | Negative stock: Y / N / store / item-wise, per-operator power, "going negative" indicator | ✅ | `MISSING` online; plumbing exists for offline sync | P0 | M | A |
| A7 | Substitute (salt) search in billing | ✅ ([pharmacy page](https://margcompusoft.com/retail/pharmacy_software.html)) | `BUILT` (F9) | — | — | — |
| A8 | Margin-loss indication while billing | ✅ | `MISSING` | P1 | S | A |
| A9 | Loose / strip billing, FEFO, hold/recall, split tender, credit | ✅ | `BUILT` | — | — | — |
| A10 | 3-level pack (case › box › strip › tab) | ❓ | `PARTIAL`: 2 levels | P3 | M | A |
| A11 | Estimate / quotation / proforma → invoice | ❓ (standard in Marg menus, no doc page found) | `MISSING` | P2 | M | A |
| A12 | Delivery challan → invoice | ❓ | `MISSING` | P2 | M | A |
| A13 | Replacement issue/receive (no revenue) | ✅ (Brk/Exp Receive with replacement option) | `PARTIAL`: returns only | P2 | M | A |
| A14 | Dynamic per-invoice UPI QR at counter with auto-reconcile | ✅ (MargPay; PayU-powered from Aug 2026) | `PARTIAL`: Razorpay QR only in mobile delivery | P1 | M | A |
| A15 | EDC card terminal push (Pine Labs / Paytm / PayU POS) | ❓ | `MISSING` | P2 | L | A |
| A16 | Picker → pharmacist check → cashier queue | ❓ | `MISSING` | P3 | L | A |
| A17 | Kits / combos | ❓ | `MISSING` | P3 | M | A |
| A18 | Dosage label / sticker print | ❓ | `MISSING` | P3 | S | A |
| A19 | Marg-style keyboard preset (shortcut parity) | ✅ (official Marg shortcut table) | `PARTIAL`: POS keys exist; 7% of Marg keys match, 9 bugs (F9/F12/Alt+L/Register Alt+P/help text). **Full audit and plan: `docs/MARG_KEYBOARD_PARITY.md`** | P1 | M | A |

### B. Inventory and drug intelligence

| ID | Capability | Marg | MediFlow | Sev | Eff | Lane |
|---|---|---|---|---|---|---|
| B1 | Large drug master (salt, HSN, substitutes) | ✅ PharmaNXT (1.5–5 lakh) | `PARTIAL`: 46 brands, static file | P1 | L | B |
| B2 | "Which nearby distributor stocks this" | ✅ PharmaNXT | `MISSING`; needs a network we don't have | P3 | XL | B |
| B3 | Godowns inside one store + godown-wise stock + issue/receive | ✅ ([godown stock](https://care.margcompusoft.com/margerp/filtered-stock/1588/1/How-to-view%C2%A0Godown-wise-stock-)) | `PARTIAL`: racks per medicine, quarantine; no batch-level godown | P2 | M | A |
| B4 | Rack/shelf on search | ✅ | `BUILT` (racks, recent commits) | — | — | — |
| B5 | Customer Brk/Exp **Receive** (expiry back from clinics/customers) | ✅ ([Marg Care](https://care.margcompusoft.com/margerp/breakage-expiry-receive/72588/1/null)) | `MISSING` | P2 | M | A |
| B6 | Self breakage/expired → **scrap store** by "expired before" month | ✅ ([Marg Care](https://care.margcompusoft.com/margerp/stock-issue/1526/1/null)) | `PARTIAL`: quarantine exists; no bulk "expired before" sweep | P1 | S | A |
| B7 | Brk/Exp **Issue** to supplier | ✅ | `BUILT` (expiry claims / purchase expiry returns) | — | — | — |
| B8 | Reorder: minimum, min-max, sales-basis, shortage key; → PO split by supplier | ✅ ([Marg Care](https://care.margcompusoft.com/margerp/re-order-management/2343/1/crc32)) | `PARTIAL`: reorder engine + AI PO draft; no `*` short-book key | P1 | S | A+B |
| B9 | Barcode label printing (PRN for TSC/Bartender) | ✅ ([PRN](https://care.margcompusoft.com/margerp/barcode-prn-/36318/1/how-to-export-barcode-format)) | `MISSING` | P1 | M | A |
| B10 | Read pack QR/2D codes (Schedule H2: 9 data elements) at GRN/POS | ❓ for Marg | `MISSING`: scanner treats input as a plain barcode | P1 (rising, §6) | M | A |
| B11 | Banned FDC block | ❓ for Marg | `PARTIAL`: 8 rules, not enforced at POS/GRN | P0 | S + data | B |
| B12 | Cold-chain flag + "pack with ice" prompt | ❓ | `MISSING` | P2 | S | A |
| B13 | DPCO/NPPA ceiling price check | ❓ | `MISSING` (help text claims it; code doesn't do it: `help/catalog.ts:260`) | P1 | M + data | B |
| B14 | Stocktake with variance approval | ✅ | `BUILT` | — | — | — |
| B15 | Dump / non-moving stock report (30/60/90/180) | 🟡 | `PARTIAL`: FSN analytics | P2 | S | B |

> **Note on B13.** The in-app help says "MediFlow verifies price stays below DPCO legal ceiling" (`src/server/domain/help/catalog.ts:260`), but no such check exists. Remove the claim or build the check. Help text that overstates compliance is a liability.

### C. Purchasing and distributor automation

| ID | Capability | Marg | MediFlow | Sev | Eff | Lane |
|---|---|---|---|---|---|---|
| C1 | Collaborative Commerce: supplier sale bill → retailer purchase (GSTIN/email/mobile/E-code) | ✅ | `MISSING` | P1 | L | B |
| C2 | ERP-to-ERP **order** (retailer → distributor) | ✅ ([Marg Care](https://care.margcompusoft.com/margerp/erp-to-erp-order/181965/1/what-is-the-process-of-erp-to-erp-order-feature-in-marg-software)) | `PARTIAL`: PO email/print; `/api/v1/orders` inbound only | P2 | L | B |
| C3 | Excel / CSV / DBF import with auto item mapping | ✅ | `PARTIAL`: CSV only, `.xlsx` rejected; no mapping memory | P1 | M | B |
| C4 | PDF import | ✅ (template per supplier) | `BUILT, better`: AI OCR, no template | — | — | — |
| C5 | Photo-of-bill → purchase (Marg Genie) | ✅ | `BUILT` (GRN OCR) | — | — | — |
| C6 | "Diff Rate" alert vs last/master rate on purchase | ✅ | `MISSING` | P1 | S | B |
| C7 | Rate comparison across suppliers | 🟡 | `PARTIAL`: reorder shows last rate | P2 | S | B |
| C8 | Purchase-side schemes (free qty, TD, CD) and landed cost | ✅ | `BUILT` (`purchaseItems.freeQty`, TD/CD) | — | — | — |
| C9 | "Sales Scheme on Purchase Discount" (derive deal from discount) | ✅ | `MISSING` | P3 | S | B |
| C10 | Ban purchase entry per operator | ✅ ([Marg Care](https://care.margcompusoft.com/margerp/purchase/149470/1/How-to-Ban-purchase-entry)) | `BUILT` via `purchase.create` permission | — | — | — |
| C11 | Supplier rate-difference / scheme claims tracker | ❓ | `PARTIAL`: expiry claims only | P2 | M | B |

### D. Wholesale and semi-wholesale

| ID | Capability | Marg | MediFlow | Sev | Eff | Lane |
|---|---|---|---|---|---|---|
| D1 | Route / area / MR-wise sale, collection, outstanding | ✅ ([Marg Care](https://care.margcompusoft.com/margerp/sale-analysis/40929/1/How-to-see-Route-wise)) | `MISSING` (MR commission only) | P2 | M | B |
| D2 | Interest on overdue (basis: invoice / outstanding / terms) | ✅ ([Marg Care](https://care.margcompusoft.com/margerp/general-and-a-c/2971/1/How-we-can-set-interest)) | `MISSING` | P2 | M | A |
| D3 | Customer DL 20B/21B and expiry block on B2B sale | ❓ | `MISSING`: `customers` has no DL fields | P1 for semi-wholesale | S | A+B |
| D4 | eOrder salesman app | ✅ ([Marg](https://margcompusoft.com/eorder_salesman_order_app.html)) | `MISSING` | P3 | L | — |
| D5 | Dispatch / LR / transporter | ❓ | `PARTIAL`: transfer dispatch + e-way bill only | P3 | M | A |
| D6 | Company-wise stock & sales statement | 🟡 | `MISSING` | P2 | S | B |

### E. Hospital and clinic

| ID | Capability | Marg | MediFlow | Sev | Eff | Lane |
|---|---|---|---|---|---|---|
| E1 | Hospital / clinic management product | 🟡 ([hospital](https://margcompusoft.com/retail/hospital-management-software.html), [clinic](https://margcompusoft.com/retail/clinic-management-software.html)) | `MISSING` | P3 | XL | — |
| E2 | IPD indent, TPA/CGHS/ECHS co-pay billing | ❓ | `MISSING` | P3 | XL | — |

### F. Accounting and banking

| ID | Capability | Marg | MediFlow | Sev | Eff | Lane |
|---|---|---|---|---|---|---|
| F1 | Manual Journal voucher | ✅ (standard voucher entry) | `MISSING`: `actions/accounting.ts` is read-only | P0 | M | A |
| F2 | Contra (cash ↔ bank) | ✅ | `MISSING` | P0 | S (after F1) | A |
| F3 | Standalone debit/credit notes (no stock) | ✅ | `MISSING` | P1 | M | A |
| F4 | PDC register, pay-in-slip, clearance, dishonour | ✅ | `MISSING` | P1 | M | A |
| F5 | Cheque-leaf printing | ❓ | `MISSING` | P3 | S | A |
| F6 | Tally ERP 9 / Prime XML export (masters + day book) | ✅ | `MISSING`: CA pack is CSV + GSTR-1 JSON (`reports/ca-pack.ts`) | P1 | M | A |
| F7 | Tally → Marg import (migration in) | ✅ | `PARTIAL`: Marg CSV presets only | P2 | M | B |
| F8 | Connected banking payouts (ICICI, SBI, Axis, J&K) | ✅ | `MISSING` | P3 | XL | A |
| F9 | Auto bank statement fetch / reconcile | ✅ (140+ banks claimed) | `PARTIAL`: CSV upload + auto-match (`bank-reconciliation.ts`) | P2 | L | A |
| F10 | Day book, TB, P&L, BS, cash flow, ledgers, outstanding, opening balances, year-end, period lock | ✅ | `BUILT` | — | — | — |
| F11 | Fixed assets / depreciation / cost centres | ❓ | `MISSING` | P3 | M | A |

### G. GST and direct tax

| ID | Capability | Marg | MediFlow | Sev | Eff | Lane |
|---|---|---|---|---|---|---|
| G1 | Live IRN / e-way bill through a real GSP | ✅ (one-click e-invoice/EWB in Silver) | `STUB`: placeholder host; simulator default | P0 (chains) | L | B |
| G2 | GSTR-1 JSON, 2B upload, local IMS tagging, GSTR-3B summary | ✅ | `BUILT` (offline: file upload, no portal API) | — | — | — |
| G3 | IMS actions synced to the portal; 2B auto-pull | 🟡 (Marg claims "IMS ready"; one independent guide found **no documentation**: [dclouds](https://dclouds.in/retail-erp-software/)) | `PARTIAL`: local only | P1 (from Apr 2026) | L | B |
| G4 | GSTIN live lookup (name, address, status) | ❓ | `MISSING`: checksum only | P1 | S (with a GSP API) | B |
| G5 | Composition: bill of supply, CMP-08 (Excel), GSTR-4 (JSON) | ✅ | `MISSING`: regular scheme only | P1 | M | B |
| G6 | GSTR-9 / 9C annual | 🟡 (Marg mentions "Table 8A of GSTR-9" readiness) | `MISSING` | P2 | M | B |
| G7 | RCM self-invoice | ❓ | `MISSING`: `isReverseCharge` hard-coded `false` (`gst.ts:231` etc.) | P2 | M | B |
| G8 | ITC reversal on written-off expired stock (s.17(5)(h)) | ❓ | `MISSING` | P1 | S | A+B |
| G9 | TDS on purchase of goods (old s.194Q: purchases > ₹50 L, buyer TO > ₹10 Cr) and on expenses (old 194C/H/I/J), **under the Income-tax Act, 2025** (s.393 table; quarterly **Form 140** replaces 26Q from Q1 2026-27) | ✅ (Marg docs predate the new Act) | `MISSING` | P1 (chains) | M | B |
| G10 | ~~TCS 206C(1H) on sale of goods~~: **omitted by the Finance Act 2025 from 1 Apr 2025**; TDS by the buyer now covers these sales | ✅ (outdated) | n/a | **none** | — | — |
| G11 | Statutory audit trail (MCA rule, FY 2023-24+) + settings change history | ✅ ([audit trail](https://margcompusoft.com/m/audit-trail/), [changes history](https://care.margcompusoft.com/margerp/changes-history/2770/1/null)) | `PARTIAL`: `audit_logs` with 91 `writeAudit` calls in 46 files; not universal, no DB-level immutability, no auditor report | P1 (for Pvt Ltd chains) | M | A |

### H. Regulatory and clinical

| ID | Capability | Marg | MediFlow | Sev | Eff | Lane |
|---|---|---|---|---|---|---|
| H1 | Schedule H / H1 / narcotic flags + registers | ✅ ([H1](https://care.margcompusoft.com/margerp/departments-reports/62451/1/How-to-print-Schedule-H1)) | `BUILT` (registers + inspector pack; Rx auto-recorded) | — | — | — |
| H2 | TB report | ✅ | `MISSING` as a register; anti-TB drugs fall under H1 text only | P1 | S | B |
| H3 | Patient-wise and doctor-wise sale reports; doctor-company-wise | ✅ ([patient](https://care.margcompusoft.com/margerp/sale-report/153438/1/How-to-view-patient-wise), [doctor-company](https://care.margcompusoft.com/margerp/sale-report/67762/1/How-to-view-doctor-company)) | `PARTIAL`: prescriptions register; no doctor-wise sale analytics | P1 | S | B |
| H4 | ABHA-linked billing, HFR registration, DHIS incentive claim | ✅ | `MISSING`: HPR doctor QR parse exists (`src/lib/doctor-qr.ts`), patient ABHA does not | P1 | L | B |
| H5 | Prescription image storage + view at dispense | 🟡 | `PARTIAL`: `imageUrl` + OCR; no storage flow | P1 | M | B |
| H6 | Licence expiry alerts (own store) | ✅ | `BUILT` | — | — | — |
| H7 | Allergy / chronic condition flags | ❓ | `MISSING` | P3 | S | B |
| H8 | DPDP consent and erasure | ❓ | `BUILT` (MediFlow lead) | — | — | — |

### I. Security, operator powers and configuration

| ID | Capability | Marg | MediFlow | Sev | Eff | Lane |
|---|---|---|---|---|---|---|
| I1 | Hide cost / purchase rate / margin per operator | ✅ | `MISSING` | P0 | S–M | A |
| I2 | Per-operator powers (hundreds of switches) | ✅ (*Masters › Passwords & Powers › Operator's*) | `UNWIRED`: 40 permissions, custom roles possible in DB, no UI | P0 | S–M | A |
| I3 | Hide specific items/ledgers from a user | ✅ ([Marg Care](https://care.margcompusoft.com/margerp/inventory-master/3186/1/How-we-can-hide-)) | `MISSING` | P3 | S | A |
| I4 | Control Room: central business-rule switches + change history | ✅ | `PARTIAL`: `StoreSettings` has 4 keys (`platform.ts:60–65`) | P1 | M (grows over time) | A |
| I5 | Back-date / freeze lock beyond monthly period lock | ❓ | `PARTIAL`: monthly period lock | P2 | S | A |
| I6 | Supervisor PIN override at counter (discount, cancel) | ❓ | `PARTIAL`: mobile approvals for credit/PO only | P1 | S | A |

### J. Hardware and desktop

| ID | Capability | Marg | MediFlow | Sev | Eff | Lane |
|---|---|---|---|---|---|---|
| J1 | Raw printing (thermal + dot-matrix), **Windows** | ✅ | `STUB` (`printer.rs:85–95`) | P0 | M | A |
| J1m | Raw printing, **macOS** | ❓ (Marg Mac support unclear) | `MISSING`: no macOS branch; returns fake success | P1 (P0 if any Mac pilot) | S (CUPS, Q13) | A |
| J1l | Raw printing, **Linux** | ❓ | `PARTIAL`: CUPS `lp -o raw` + `/dev/usb/lp0`, errors swallowed | P2 | S (Q14) | A |
| J2 | Printer discovery (Windows `EnumPrinters`, macOS/Linux `lpstat`) | ✅ | `PARTIAL`: Linux `lpstat` only; Windows and macOS hard-coded | P0 | S | A |
| J3 | Barcode label printers (TSC via TSCLIB, Bartender PRN) | ✅ | `MISSING` | P1 | M | A |
| J4 | Barcode scanner (keyboard wedge) | ✅ | `BUILT` on all three OSes (`src/desktop/hardware-bridge.ts` buffers wedge input) | — | — | — |
| J4d | Document scanner (flatbed/ADF) for bill OCR | ✅ (Marg Genie uses phone photos instead) | `PARTIAL`: `scanner.rs` (PR #100) supports Windows (WIA) and Linux. macOS returns "Install NAPS2 CLI" (`scanner.rs:305`) | P3 | S–M | A |
| J5 | Pole display / weighing scale (serial/USB) | ❓ | `MISSING`. Serial on three OSes needs per-OS port naming (COMx, /dev/tty.*, /dev/ttyUSB*) and macOS USB-serial drivers | P3 | M | A |
| J6 | HTML (A4/A5) printing from the webview | ✅ (Marg prints natively) | `PARTIAL`: relies on `window.print()`, unreliable in WKWebView on macOS (§1.1 D4) | P1 | S–M (native print call) | A |

### K. Print formats and language

| ID | Capability | Marg | MediFlow | Sev | Eff | Lane |
|---|---|---|---|---|---|---|
| K1 | Self-format designer (any paper, any column) | ✅ ([tutorial](https://tutorial.margcompusoft.com/tutorial/76)) | `PARTIAL`: HTML templates + OCR template builder; A4/80 mm only | P1 | M | A |
| K2 | A5 half-page | ❓ (Self Format can do any size) | `MISSING` | P1 | S | A |
| K3 | Hindi / Tamil / Telugu bill print; item name in another language | ✅ | `MISSING` | P1 | M | A |
| K4 | Regional-language UI | ❓ | `MISSING` | P2 | L | A |

### L. CRM, comms, payments and loyalty

| ID | Capability | Marg | MediFlow | Sev | Eff | Lane |
|---|---|---|---|---|---|---|
| L1 | WhatsApp bill with **no Meta setup** (Marg server via Wallet, or local Chrome automation) | ✅ ([setup](https://care.margcompusoft.com/margerp/general-queries/164883/1/WHATSAPP-SETUP)) | `PARTIAL`: each tenant must bring a Meta Cloud API number + token. A desktop deep link into WhatsApp Desktop (`whatsapp://send`) would give a zero-setup day-one option | P1 | S (deep link) → M (shared BSP number) | B |
| L2 | Bulk-send bills / ledger to party on WhatsApp | ✅ | `PARTIAL` | P2 | S | B |
| L3 | Automatic refill reminders | 🟡 | `UNWIRED` (Q2) | P1 | S | A |
| L4 | Doctor-wise business and commission | 🟡 | `PARTIAL`: MR commission only | P2 | M | B |
| L5 | Loyalty points | ✅ | `BUILT` | — | — | — |
| L6 | Membership cards / wallets / vouchers | ❓ | `MISSING` | P3 | M | B |
| L7 | Family credit pools | ❓ | `BUILT` (customer groups): MediFlow extra | — | — | — |

### M. Reports, BI and mobile

| ID | Capability | Marg | MediFlow | Sev | Eff | Lane |
|---|---|---|---|---|---|---|
| M1 | Business-analysis report builder (any field vs any field, export Excel/CSV/XML) | ✅ (*Daily Reports › Business Analysis*) | `MISSING` | P1 | M | B |
| M2 | Item/bill/party/company-wise gross profit | 🟡 | `MISSING` | P1 | M | B |
| M3 | AI reports in natural language | ✅ (₹49/mo via Wallet) | `BUILT` (Copilot `Ctrl+J`) | — | — | — |
| M4 | eOwner (ledgers, outstanding, PDC, P&L, salesman GPS) | ✅ ([App Store](https://apps.apple.com/in/app/eowner/id6476924466)) | `PARTIAL`: 4 screens, 508 LOC | P2 | L | A+B |
| M5 | eRetail B2B ordering network | ✅ | `MISSING` | P3 | XL | — |
| M6 | eDelivery tracking | 🟡 | `PARTIAL`: status, proof, QR; no GPS | P3 | M | A |
| M7 | Scheduled owner MIS on WhatsApp/email | ❓ | `MISSING` | P2 | S | B |

### N. Platform, data, commercial and support

| ID | Capability | Marg | MediFlow | Sev | Eff | Lane |
|---|---|---|---|---|---|---|
| N1 | Multi-counter in one shop without internet | ✅ (LAN shared folder or RDP to one server) | `PARTIAL`: each terminal has its own IndexedDB store; terminals can't see each other; offline cold start depends on a service worker that Tauri webviews may not run (§1.1 D3) | P1 | L | A |
| N2 | Backup to the customer's own drive, USB or Google Drive / OneDrive (auto via server.exe; 20-backup cap) | ✅ | `MISSING`. Easier on desktop: schedule an encrypted export to a local folder, USB or synced Drive folder | P1 (trust) | S–M | A |
| N3 | Multi-branch real-time | ✅ but weak (server sync setting; Home edition can't; DMSxpert is a separate web product) | `BUILT` (cloud native): **MediFlow lead** | — | — | — |
| N4 | Marg data migration in | — | `PARTIAL`: CSV presets (`import/presets/marg.ts`); no open bills, PDC or pending claims | P1 | M | B |
| N5 | Local dealer network (850+ centres) | ✅ | `MISSING` | P1 (GTM) | XL | — |
| N6 | Perpetual licence price anchor (₹5.5k–₹26k + GST) | ✅ | n/a: pricing decision | P1 (GTM) | — | — |
| N7 | Embedded fintech: MargPay QR, credit lines (Indifi, 2020) | ✅ / 🟡 | `MISSING` | P3 | XL | — |
| N8 | **A desktop build that can ship** (how the app gets its UI and backend in production) | ✅ (installer) | `STUB`: dev-only (`devUrl`); `frontendDist ../../out` can't be built from a `standalone` Next.js app with server actions | **P0** | L (decision + build) | A |
| N9 | Signed installers: Windows (MSI/NSIS + code-signing cert for SmartScreen), macOS (DMG + Developer ID + notarisation), Linux (AppImage / .deb) | ✅ (Windows installer) | `MISSING`: `bundle.targets: "all"` is set, but no signing, no CI | **P0** for pilot | M | A |
| N10 | Auto-update with rollback (Marg: "update patch") | ✅ | `MISSING`: no updater plugin | P1 | M | A |
| N11 | Local data protection on counter PCs (offline store holds patient names, Rx, credit balances) | ❓ | `MISSING`: plaintext IndexedDB in the webview profile; CSP is `null` in `tauri.conf.json`, so any injected script could call the native bridge | P1 (DPDP) | M | A |
| N12 | First-class macOS and Linux | ❓ (Windows-first; Mac support unclear) | `PARTIAL`: Rust bridge has Windows/Linux paths, macOS mostly missing (J1m, J4) | P2 → **lead** if done well | M | A |

---

## 5. Domain deep-dives

### A. POS, billing and pricing

**How Marg prices a line.** Marg layers several price sources and resolves them at billing time ([qty-wise](https://care.margcompusoft.com/margerp/rate-and-discount-master/2205/1/null), [party-wise company discount](https://care.margcompusoft.com/margerp/rate-and-discount-master/1990/1/How-to-set-party-wise), [party categorisation](https://care.margcompusoft.com/margerp/rate-and-discount-master/33709/1/How-to-set-party-categorization), [item-party special](https://care.margcompusoft.com/margerp/rate-and-discount-master/35367/1/How-to-set-Item-party), [party bill discount](https://care.margcompusoft.com/margerp/all-ledgers/108461/1/how-to-set-party-wise-bill-discount-in-marg-software), [My Own Sales Scheme](https://care.margcompusoft.com/margerp/rate-and-discount-master/30076/1/null)):

1. Item + party special price or discount
2. Party category discount (checked after the item discount)
3. Party-wise company (manufacturer) discount
4. Qty-wise rate or scheme (10+1, half-scheme, custom per-qty table)
5. Party bill discount, loaded automatically for the ledger

Then, a **guard**: if sale rate < purchase rate or sale rate > MRP, it **indicates** or **bans** ([Marg Care](https://care.margcompusoft.com/margerp/batch/175/1/How-to-enable-indication-if)).

**MediFlow today.** One `saleRate` per batch, an optional `salePriceOverride` per store, a flat `maxDiscountBp` ceiling (`create-sale.ts:156–162`), no MRP or cost guard, and no free-qty lines. The scheme engine (`schemes.ts`) only feeds a text badge.

**Approach.** Add `price_rules` (scope: tenant/store × party/party-category × medicine/manufacturer/category; type: special rate | discount bp | qty slab | free qty) and a pure `resolveLinePrice()` function with a fixed precedence order. Unit-test it the same way `allocate-fefo` is tested. Add `free_qty` and `scheme_id` to `sale_items`. Free units take stock out through FEFO at zero rate. GST on free goods is a CA decision; a common practice is to value them at zero on a B2C bill. Apply the guard last. This is one module, not five features.

**Negative stock.** Marg's switch has four values: **Y / N / Store / Item-wise**. There is a separate operator power with the values D/R/I/B, and separate switches for negative bill amounts and for Brk/Exp/Scrap ([enable](https://care.margcompusoft.com/margerp/inventory/119944/1/How-to-sale-new-batch), [item-wise](https://care.margcompusoft.com/margerp/inventory/526/1/null), [indicator](https://care.margcompusoft.com/margerp/inventory/139567/1/How-to-enable-indication)). Recommendation: copy the store/item/role structure and keep a **"negative stock to reconcile"** queue. When the GRN posts, auto-match the negative movements to the incoming batch. Our immutable `stock_movements` ledger makes this cleaner than in Marg.

**Counter UPI.** MargPay creates a dynamic QR per invoice and reconciles bill by bill. From August 2026 it runs on PayU ([CXOToday](https://cxotoday.com/media-coverage/payu-and-marg-erp-join-forces-to-simplify-digital-payment-collections-and-reconciliation-for-indias-pharma-distributors-and-msmes/)). We already have the Razorpay QR + webhook path in `src/server/domain/mobile/`. Reuse it on POS, show the QR on screen or on the thermal slip, and finalise the sale on the webhook. This also kills fake-screenshot fraud.

### B. Inventory and drug intelligence

**Drug master.** Marg's moat is PharmaNXT: free, built into Marg ERP 9+, with salt, substitutes and HSN, and a distributor-locator ([Marg](https://margcompusoft.com/pharmanxt_app.html), [BioSpectrum](https://www.biospectrumindia.com/public/news/86/15831/marg-erp-eyes-rs-250-cr-from-pharmanxt-in-3-yrs.html)). Our catalog has 46 hand-written entries in a TypeScript file. Options, cheapest first:

- (a) Grow the master from our own tenants' cleaned `medicines` rows. This compounds over time.
- (b) License a commercial Indian drug database.
- (c) Use public lists: the CDSCO approved-drug list, NPPA ceiling prices, the Jan Aushadhi product list.

Whichever we pick, the data must move out of `src/lib` into a versioned DB table so it can be updated without a deploy. The **banned-FDC list must be complete** (156 from Aug 2024 + 16 from Jun 2026 + the 2016 list; source: [CDSCO FDC page](https://cdsco.gov.in/opencms/opencms/en/Drugs/FDC/)), and it must be **enforced at POS and GRN**.

**Expiry lifecycle.** Marg has three separate documents: **Brk/Exp Receive** (from customers, optional replacement), **Self Breakage/Expired → Scrap store** via Stock Issue with an "expired before MM/YYYY" sweep, and **Brk/Exp Issue** (to supplier) ([receive](https://care.margcompusoft.com/margerp/breakage-expiry-receive/72588/1/null), [scrap](https://care.margcompusoft.com/margerp/stock-issue/1526/1/null), [issue](https://care.margcompusoft.com/margerp/breakage-expiry-issue/79016/1/How-to-create-brk-exp-issue)). We have quarantine and supplier expiry claims. Missing: customer receive, the one-click "expired before" sweep, and **ITC reversal** when stock is destroyed rather than returned (G8).

**Labels and pack QR codes.** Marg prints item labels through PRN templates and supports TSC printers via `TSCLIB.DLL` and BarTender ([format](https://care.margcompusoft.com/margerp/barcode-prn-/36318/1/how-to-export-barcode-format), [troubleshooting](https://care.margcompusoft.com/margerp/barcode-queries/370/1/null)). We need TSPL/ZPL output through the Tauri bridge, which is the same spooler work as J1. For scanning, see §6: Schedule H2 QR codes are spreading to whole drug categories, so the scanner should parse the H2 QR payload as well as GS1 AIs `(01)(10)(17)(21)`, auto-select the batch, and check expiry on scan.

### C. Purchasing and distributor automation

**Collaborative Commerce is Marg's biggest lock-in.** A distributor on Marg saves a sale bill, and it appears in the retailer's Marg as a purchase with the same bill number. It can be keyed by GSTIN, email, mobile or Marg E-code ([collab](https://care.margcompusoft.com/margerp/collaborative-commerce/166557/1/collab), [email basis](https://care.margcompusoft.com/margerp/sale/182217/1/what-is-the-process-of-collaborative-commerce-on-the-basis-of-email-in-marg-software)). Orders flow the other way through ERP-to-ERP Order and the eRetail app ([Marg](https://margcompusoft.com/erp-to-erp-order-distributor.html)).

We cannot join Marg's network. The realistic answer has four parts:

1. **A per-tenant inbound email address** (`bills-<store>@in.mediflow…`). Distributors already email PDFs and Excel files. Auto-parse them with the existing AI OCR, plus `.xlsx`.
2. A **persistent `supplier_item_map`** (supplier_id, supplier item code/name/pack → medicine_id, confidence, confirmed_by). The first import asks; every later import auto-maps. Use `match.ts` for suggestions.
3. A **rate-difference check** on every GRN line against the last purchase and the PO rate. Offer a one-click debit note.
4. Later, Pharmarack/Retailio API connectors if they will partner.

With (1)–(3), the GRN experience gets close to Marg's without needing the distributor to use our software.

### D. Wholesale and semi-wholesale

Many Indian chemists also supply clinics and nearby shops. Marg handles this with route/area/MR outstanding, an interest calculation basis (invoice, outstanding or payment terms) and the eOrder salesman app ([route](https://care.margcompusoft.com/margerp/sale-analysis/40929/1/How-to-see-Route-wise), [interest](https://care.margcompusoft.com/margerp/general-and-a-c/2971/1/How-we-can-set-interest)). The minimum for MediFlow's chain focus is **customer DL fields with an expiry block on B2B sales** (D3) and **area/route tags on customers** feeding the existing outstanding report. A full field-sales app can wait.

### E. Hospital and clinic

Marg has hospital and clinic product pages, but we found no documentation of how they work, so this is 🟡. It is not a parity gap for retail chains. Revisit only if a pilot customer runs an in-hospital pharmacy.

### F. Accounting and banking

- **Vouchers (F1–F3).** `src/app/actions/accounting.ts` only reads. Add one `postManualVoucher(type: journal | contra | debit_note | credit_note)` service on the existing balanced-journal core, with period-lock checks and an audit entry. Contra is a journal restricted to cash and bank accounts.
- **PDC (F4).** Marg's flow: record PDC (cheque no., date, bank) → pay-in-slip (F3 deposits all) → clearance date → or dishonour, which reverses the receipt and can add charges ([PDC](https://care.margcompusoft.com/margerp/pd-cheques-cash/84768/1/null), [dishonour](https://care.margcompusoft.com/margerp/cheque-dishonored-advance/2226/1/trees)). Model it as a `cheques` table with a status machine (`received → deposited → cleared | dishonoured`). Post the receipt on clearance, or post on receipt into a "PDC in hand" account.
- **Tally (F6).** Marg exports **two XML files: masters and day book**. The user maps sale-return and purchase-return ledgers because Tally has none by default, and the guides suggest matching P&L afterwards ([ERP 9](https://care.margcompusoft.com/margerp/data-import-export/45381/1/null), [Prime](https://care.margcompusoft.com/margerp/data-import-export/182029/1/how-to-export-marg-data-and-import-in-tally-prime-software)). Do the same in `ca-pack.ts`: a Tally `ENVELOPE/TALLYMESSAGE` with ledgers, stock items optional, and vouchers, plus a ledger-mapping screen. Test by importing into a Tally Prime trial.
- **Banking (F8–F9).** Payouts are a long, partner-heavy project. A better investment: support statement formats from the top 10 banks plus account-aggregator fetch later.

### G. GST and direct tax

- **G1, the real GSP.** Pick one GSP with a sandbox (e.g., ClearTax, Masters India, Sandbox.co.in, IRIS). Implement IRN generate/cancel, EWB generate/update Part-B/cancel and GSTIN search behind the existing `IRPProvider` interface, and delete the `gsp.mediflow.in` URLs. This also unlocks G4 (GSTIN lookup) and, through the same vendor, G3 (2B pull and IMS push).
- **G5, composition.** Add a store-level `gstScheme: regular | composition`. Composition stores issue a **bill of supply** (no tax lines, the mandatory declaration, no ITC). Marg produces **CMP-08 as Excel** and **GSTR-4 as JSON** ([CMP-08](https://care.margcompusoft.com/margerp/gst-register---return/149818/1/inffast), [GSTR-4](https://care.margcompusoft.com/margerp/gstr-4/63468/1/adler32)).
- **G9, TDS (G10 is obsolete).** Marg sets the basis in Control Room, flags parties as "TDS Applicable: Charge / Ask / Auto Check & Charge", and produces the quarterly TDS return ([194Q](https://care.margcompusoft.com/margerp/tds-tcs-reportss/171029/utils/messages), [deductor](https://care.margcompusoft.com/margerp/marg-setup/345/1/How-to-feed-TDS-details-in-Marg-software)). Marg's pages describe the 1961 Act and its TCS-on-goods option ([TCS](https://care.margcompusoft.com/margerp/inventory/167187/1/TCS---Tax-Collected-at)). Since then, TCS on sale of goods was removed (1 Apr 2025), and the Income-tax Act, 2025 replaced the 1961 Act from 1 Apr 2026 (TDS in the s.393 table, Form 140 instead of 26Q). Build a running per-PAN, per-tax-year purchase total, apply the threshold (₹50 L) and rate, and post to a "TDS payable" ledger. **Have a CA confirm the new-Act table entries, rates and forms** before release.
- **G11, audit trail.** Marg says its audit trail turns on for financial years opened on or after 1 April 2023, and it logs Control Room changes with user and time ([audit trail](https://margcompusoft.com/m/audit-trail/)). For us: add DB triggers (or a guaranteed write path) on every financial table, `REVOKE UPDATE, DELETE` on `audit_logs`, and an "Edit log" report for auditors.

### H. Regulatory and clinical

- **ABHA (H4).** Marg's flow: create a **Health Facility Registry (HFR)** record from inside the ERP → link to ABDM → enter the patient's ABHA number at billing → register on **DHIS** → claim **₹20 per ABHA-linked bill**. Marg requires a ₹2,000 minimum Wallet balance for ABHA services ([partnership](https://margcompusoft.com/marg-abha-partnership.html), [ABDM linkage](https://care.margcompusoft.com/margerp/software-linkage-with-abdm/184528/1/how-to-link-marg-erp-software-with-ayushman-bharat-digital-mission), [FAQ](https://care.margcompusoft.com/margerp/digital-entryy/184521/1/abha-faq-s)). The incentive figure comes from Marg's material and has not been confirmed in an NHA document. MediFlow would need to become an ABDM-integrated HIP/HRP software (sandbox, then certification). It is long, but it is a **sales weapon**: "the software pays for itself".
- **TB report (H2).** Tag anti-TB molecules (rifampicin, isoniazid, pyrazinamide, ethambutol and combinations). Add a register filtered from Rx sales with patient, prescriber, address and quantity. Ni-kshay export can come later.
- **Patient and doctor analytics (H3).** Marg's chemist setup has patient statements, patient×doctor analysis and doctor-company-wise sales. We already capture doctor and patient on Rx sales, so this is a reporting task.

### I. Security, operator powers and Control Room

Marg's model is *Masters › Passwords & Powers › Operator's*: per-user powers including "Item List = M" to hide cost, purchase rate and margin, a ban on purchase entry, hidden items and ledgers, and the negative-stock power ([hide cost](https://care.margcompusoft.com/margerp/advance-control-/371/1/How-we-can-hide-item), [while billing](https://care.margcompusoft.com/margerp/sale/63762/1/How-to-hide-the-purchase), [ban purchase](https://care.margcompusoft.com/margerp/purchase/149470/1/How-to-Ban-purchase-entry)). Business rules live in **Control Room**, which keeps a change history ([Marg Care](https://care.margcompusoft.com/margerp/changes-history/2770/1/null)).

**Approach.** Keep role-based access, which is cleaner than per-user checkboxes:

1. Add **data-visibility permissions** (`cost.view`, `margin.view`, `supplier_rate.view`) and enforce them **in the server query layer**, not only by hiding UI.
2. Ship the custom-role editor (Q8).
3. Grow `StoreSettings` into a typed, versioned **"Control Room"** of rule switches: negative stock, cost/MRP guard, round-off mode, mandatory doctor/phone, print copies, free-goods GST treatment, refill defaults. Every change goes to `audit_logs`.

### J. Hardware

Printing goes through the Rust bridge on all three OSes. One `print_raw_bytes(printer, bytes) -> Result` API, three back-ends:

| OS | Raw print | Discovery | Status today |
|---|---|---|---|
| **Windows** | `OpenPrinterW / StartDocPrinterW (pDatatype="RAW") / WritePrinter / EndDocPrinter` (`windows` crate; `windows-sys` is already a dependency) | `EnumPrintersW` | Stub (`eprintln!`) + hard-coded list |
| **macOS** | CUPS: `lp -d <queue> -o raw` (CUPS is part of macOS). Add the USB thermal printer as a raw/"Generic" queue | `lpstat -p -d` | **Nothing**: falls through to fake success |
| **Linux** | Same CUPS path (exists), `/dev/usb/lp0` fallback | `lpstat` (exists) | Works, but errors are swallowed |

Steps:
- Share the CUPS code under `cfg(unix)` (Q13) and return real errors (Q14).
- Test on a TVS RP3160 / Epson TM-T82 (thermal), an Epson LX-310 (dot-matrix ESC/P) and a TSC TE244 (TSPL labels) on each OS you support.
- The cash drawer kick (`ESC p`) and label printing use the same path.
- For A4/A5 HTML bills, don't rely on `window.print()` inside WKWebView. Use Tauri's native webview print, or render to PDF and send it to the OS print queue.

**Nothing else in this document matters if a counter cannot print.**

### K. Print formats and language

Marg's Self Format edits every geometry: dot-matrix, laser, thermal, labels. It prints Hindi, Telugu and Tamil headers and item names, with a separate item-name field in another language ([Hindi bill](https://care.margcompusoft.com/margerp/gui-format/91744/1/inffast), [item name](https://care.margcompusoft.com/margerp/inventory-master/12057/1/How-to-print-item-name)).

Step 1: add `nameLocal` to medicines and party names, bundle Noto Sans Devanagari/Tamil/Telugu in templates, and add A5 and 58 mm formats. Step 2, later: UI i18n with `next-intl`, starting with POS and receipts.

Note that thermal **ESC/POS raw mode cannot print Devanagari text** without raster images. Regional-language thermal bills therefore need raster rendering in `escpos.ts`.

### L. CRM, comms and payments

The friction gap is WhatsApp. Marg sends bills either through **its own server** (pay-per-use from Marg Wallet) or through **local WhatsApp automation** (Chrome + driver; the contact must already be saved) ([setup](https://care.margcompusoft.com/margerp/general-queries/164883/1/WHATSAPP-SETUP), [Wallet](https://margcompusoft.com/marg-wallet.html)). We require every tenant to bring their own Meta Cloud API credentials (`whatsapp.ts:119–161`).

**Approach, in two steps:**
1. **Day one, no setup:** because MediFlow is a desktop app, "Send on WhatsApp" can open WhatsApp Desktop (or WhatsApp Web in the default browser) with a deep link: `whatsapp://send?phone=91XXXXXXXXXX&text=<bill link>`. The cashier presses Enter. This is Marg's "local computer" mode without Chrome automation. It needs the Tauri shell/opener plugin and works on all three OSes.
2. **Then:** run a MediFlow-owned WABA through a BSP (Gupshup, Interakt, AiSensy or similar) for automatic sends: bills, refill reminders, payment reminders. Tenants send approved utility templates from our number and can bring their own number later. Meter usage per tenant.

### M. Reports, BI and mobile

Marg's real report power is **Business Analysis**: pick any field against any field, filter, and export to Excel/CSV/XML. Patient×doctor is one example ([Marg Care](https://care.margcompusoft.com/margerp/transaction-analysis/110871/1/How-to-view-patient-doctor)). One generic pivot screen over sales/purchase lines (dimensions: item, salt, manufacturer, category, party, doctor, cashier, store, hour; measures: qty, value, GP, discount) covers most of the "1,000 reports" claim at a fraction of the cost. GP needs landed cost per sold batch, which we already store.

### N. Platform, data and commercial

- **Offline multi-counter (N1).** Marg gets this "for free" because every counter reads one shared database over LAN or RDP ([sharing](https://care.margcompusoft.com/margerp/sharing/169616/1/how-to-connect-sharing-main-system-with-server-client-system), [RDP](https://care.margcompusoft.com/margerp/general-queries/164889/1/What-is-the-process-of-RDP-Configuration-with-Marg-Software)). Our offline terminals are isolated. Since every counter now runs the desktop app, one of them can act as the store's **edge relay**: a small Rust HTTP service inside the Tauri app, found over LAN by mDNS, holding the store's SQLite copy. Other counters sync with it using the same push/pull protocol as `src/offline/sync.ts` while the internet is down, and the relay syncs upstream later. Desktop-only makes this more feasible than it was for a browser app, but it is still a large, risky change (conflicts, bill numbering per counter, relay PC switched off). Do it only after pilots show multi-counter outages are a real problem, and after the SQLite move (next bullets).
- **Desktop build and backend (N8), the decision to make first.** The production app needs a way to reach the server code. Options:

  | Option | How | Pros | Cons |
  |---|---|---|---|
  | (a) **Thin shell** | Tauri window loads the hosted MediFlow URL (`https://app…`) | Works today with no refactor. One deploy updates every counter | **No cold start without internet.** If the PC boots during an outage, the UI can't load at all, and a service worker in the webview is not a dependable fix. Remote content calling the native bridge must be locked down carefully |
  | (b) **Local Next.js sidecar** | Ship the `standalone` server plus a Node runtime as a Tauri sidecar | Offline UI | Server actions talk straight to Postgres, so **every counter PC would hold DB credentials**: not acceptable. Large install, harder updates |
  | (c) **Bundled UI + cloud API** | Bundle the POS/offline screens as static assets in the app, and call the cloud over an authenticated HTTP API (`/api/v1/*` already exists for mobile) | Proper offline cold start, smallest attack surface, the natural shape for a desktop product | Real refactor: server actions used by bundled screens must become API calls |

  **Recommendation:** (a) for the first pilot, with the POS and offline screens checked for cold start. Plan (c) for the offline-critical screens (POS, held bills, print) as the target architecture. Do not do (b). Write this up as an ADR next to `docs/adr/0003-offline-pos-custom-sync.md`, and revise `docs/10-offline-pos-design.md`, which still describes a browser PWA.
- **Offline storage.** Move the offline store from IndexedDB (Dexie, inside the webview profile) to **SQLite owned by the Rust side** (Tauri SQL plugin or `rusqlite`). The `src/desktop/sqlite-storage.ts` interface is already there. This gives a file we can encrypt (N11), back up (N2) and later share over LAN (N1). It also removes the risk of webview storage being cleared by a webview update or profile reset.
- **Ship, sign, update (N9–N10).**
  - Windows needs an OV/EV code-signing certificate, or SmartScreen will warn on every install.
  - macOS needs an Apple Developer ID plus notarisation, or Gatekeeper will block the app.
  - Linux: AppImage and `.deb` for the supported distro.
  - Add `tauri-plugin-updater` with signed update manifests and a staged rollout per store, so a bad build can't stop every counter at once.
  - Put all of this in CI (one runner per OS).
- **Customer-owned backup (N2).** Marg backs up to Google Drive/OneDrive, automatically through `server.exe`, keeping the 20 latest ([Drive](https://care.margcompusoft.com/margerp/serverexe/155360/1/How-to-send-Backup-on), [Wallet cloud backup](https://care.margcompusoft.com/marg-wallet/marg-cloud-backup/184043/10/what-is-the-process-of-cloud-backup-through-marg-wallet)). The desktop app can do the same:
  - a scheduled, encrypted export (CSV/XLSX + Tally XML + JSON of the tenant's cloud data, plus the local offline DB) to a folder the owner picks: local disk, USB drive, or a Google Drive/OneDrive synced folder;
  - a "Download all my data" button.

  This answers the objection "what if your startup closes?".
- **Pricing (N6).** Marg list prices: Nano ₹5,550 · Basic ₹10,300 · Silver ₹13,900 · Gold ₹26,000 (unlimited users) + GST, extra user ₹3,000. Dealers sell below list. ARC is uncertain (see §1 #13). On top of that, a per-use Wallet charges for WhatsApp, cloud backup, ABHA and AI reports. Our pricing should be compared against **3-year total cost of ownership** (licence + ARC + Wallet + dealer visits), not against the licence alone.

---

## 6. 2025–26 regulatory changes that widen or close the gap

| Change | Status / date | Effect on the gap | Source |
|---|---|---|---|
| **GST 2.0 rates** (most medicines 5%) | From 22 Sep 2025 | We have a re-rate tool. Make sure the default `gstRateBp` is no longer 12% | project memory, `docs/05-domain-pharmacy-india.md` |
| **IMS mandatory** for regular 3B filers; accept/reject/pending before filing | From 1 Apr 2026 (per tax blogs) | Our IMS tagging is local only. Syncing to the portal (G3) moves up to P1 | [anukram](https://www.anukram.in/blog/gstr-3b-itc-locking-ims-july-2026.html), [treelife](https://treelife.in/calendar/gst-compliance-calendar/) |
| **GSTR-3B Table 4 ITC auto-filled and locked** from 2B/IMS | Reported from the July 2026 period; check the CBIC notification | Purchase-side ITC accuracy now decides what can be filed | [taxlly](https://www.taxlly.com/gstr-3b-will-be-locked-from-july-2026-what-every-gst-taxpayer-should-know/) |
| **30-day IRN reporting limit** for AATO ≥ ₹10 Cr; e-invoice threshold ₹5 Cr | In force | Chains above ₹5 Cr need G1. A simulator in production means non-compliant invoices | [indiacorporates](https://indiacorporates.com/blog/gst-changes-from-1-april-2026/) |
| **E-way bill** cannot be generated for documents older than 180 days | 2025–26 | Minor: check in transfer EWB | [incorpx](https://www.incorpx.io/blog/new-gst-rules-changes-2026) |
| **Ship-To GSTIN** field on e-invoice | Reported mandatory from 1 Aug 2026 (single source, **low confidence**) | Check the IRN payload when building G1 | [dclouds](https://dclouds.in/retail-erp-software/) |
| **Schedule H2 QR codes** expanded from ~300 brands to **vaccines, antimicrobials, NDPS, anticancer** (G.S.R. 506(E), 22 Jun 2026) | Phased: vaccines/NDPS ~Jul 2027, antimicrobials ~Jul 2028 | Pack-QR scanning (B10) becomes a basic expectation, and Marg's support for it is unknown. **Chance to lead** | [News on AIR](https://newsonair.gov.in/health-ministry-expands-qr-code-based-track-and-trace-framework-for-medicines/), [ThePrint](https://theprint.in/health/qr-codes-now-mandatory-on-vaccines-anti-cancer-drugs-as-govt-hopes-to-curb-fake-pharma-market/2969973/) |
| **FDC bans**: 156 (2 Aug 2024), 16 (11 Jun 2026), plus the 2016 list | In force | Our 8-rule list is far from complete (B11) | [CDSCO FDC](https://cdsco.gov.in/opencms/opencms/en/Drugs/FDC/), [Rajya Sabha answer](https://rsdebate.nic.in/bitstream/123456789/759034/1/PQ_267_11032025_U1406_p432_p433.pdf) |
| **ABDM DHIS** incentive for ABHA-linked pharmacy bills | Active per Marg (₹20/bill) | H4 becomes a revenue feature | [Marg ABHA](https://margcompusoft.com/marg-abha-partnership.html) |
| **MCA audit trail** for companies using accounting software | FY 2023-24 onward | Pvt Ltd chains need G11 | [Marg blog](https://margcompusoft.com/m/audit-trail/) |
| **DPDP Act 2023** | Rules phasing in | **MediFlow lead** (consent and erasure built) | `src/server/domain/privacy/*` |

> Dates in this table come from secondary sources (tax blogs, news). Before building a compliance feature on one of them, check it against the CBIC/GSTN advisory or the Gazette notification.

---

## 7. Where Marg is weak (what to sell against)

| Weakness | Evidence | How MediFlow uses it |
|---|---|---|
| **Support reputation** | Capterra 3.2/5 (54 reviews), with complaints about sales and support. 81 complaints on consumercomplaints.in, 5 marked resolved (page last updated 2023). Reviewers praise *local* dealers, not Marg itself | Sell **named-person support on WhatsApp in Hindi**, with response times we can measure |
| **Architecture** | Multi-user means a shared folder on LAN, or RDP to one PC. The Home edition cannot sync branches. Marg Cloud cannot sync with local data. Real-time branch reporting is a separate product (DMSxpert) | Cloud-native multi-store and a single source of truth are our core story for chains |
| **Pay-per-use add-ons** | WhatsApp, cloud backup, ABHA (₹2,000 minimum balance) and AI reports (₹49/mo) all draw from Marg Wallet | Include these in the plan and show the 3-year total cost |
| **PDF purchase import needs templates per supplier** | [Marg Care](https://care.margcompusoft.com/margerp/transaction-import/165197/1/import) | Our zero-setup AI OCR is a real, demonstrable lead. Demo it on the chemist's own distributor bills |
| **Fragile WhatsApp automation** | Local mode needs an updated Chrome + driver; the contact must be saved and must have chatted before; "remove WhatsApp.exe" troubleshooting | A proper BSP integration (L1) is more reliable |
| **Price set by dealers** | No enforced list price; dealer quotes vary | Transparent, public pricing |
| **Windows-first** | Sold and documented as a Windows program; whether a native Mac version exists is unclear (third-party listings disagree). MargBooks is the cloud product | First-class macOS and Linux builds (N12). Owners increasingly use MacBooks at home, and Linux is the cheapest counter OS |
| **IMS / Ship-To readiness not documented** | Independent buyer's guide could not confirm it from vendor docs ([dclouds](https://dclouds.in/retail-erp-software/)) | If we ship G1 + G3 well, we can make claims Marg cannot back up |

---

## 8. Where MediFlow already leads (verified)

| Area | Evidence in code | Caveat vs v1 |
|---|---|---|
| Cloud multi-store, central PO, inter-store transfers with e-way bill | `transfers`, `central-purchasing`, `transfers-eway.ts` | Real lead over Marg's sync setup |
| Correctness by construction: integer paise, immutable stock ledger, balanced journals, gap-free numbering | `stock_movements`, `sequence.ts`, accounting core | Real lead |
| Zero-setup AI OCR for GRN, prescriptions, stock sheets, bill templates | `src/app/api/ocr/*` | **Narrower than v1 said.** Marg AI+ now markets photo/PDF/Excel import |
| AI Copilot | `Ctrl+J`, `src/server/ai/*` | Marg sells "AI reports" as a ₹49/mo add-on |
| DPDP consent and erasure | `src/server/domain/privacy/*` | No Marg equivalent found |
| Family credit pools | `customer_groups` | Not found in Marg docs |
| Rx compliance wired into POS (H/H1/X/NDPS registers, auto-recorded Rx sales, HPR/NMC doctor QR) | `compliance.ts`, `doctor-qr.ts` | Parity-plus |
| Offline POS (per terminal) | `src/offline/*`: **IndexedDB (Dexie)** in the webview; SQLite adapter not wired (§1.1 D3) | Ahead of Marg Cloud on paper, **behind** Marg's LAN for multiple counters. Offline cold start in the desktop app is unproven until N8 is decided |
| Modern UI, command palette, in-app help | `Ctrl+K`, `help/catalog.ts` | Real, but make sure help text does not claim checks that don't exist (B13) |

---

## 9. Closure plan for two part-time devs

Sequenced so every stage leaves something demo-able. Calendar time assumes about 12 h/week per dev.

**Stage 0: Pilot-safe (≈ 3–4 weeks)**
- A: **N8 desktop build decision (ADR) + working production build** · **N9 signed Windows installer** · J1–J2 Windows printing · Q13–Q14 macOS/Linux print + real errors · Q15 single instance · J6 A4/A5 native print check · Q5 cheque method · Q6 cost hiding · Q7 cost/MRP guard · Q8 role editor · Q9 A5/58 mm · Q2 refill wiring
- B: Q1 no invented MRP · Q3 fuzzy match · Q4 banned-FDC enforcement + full list · Q10 `.xlsx` · remove the false DPCO claim from help text (B13)

**Stage 1: The chemist stops reaching for Marg (≈ 6–8 weeks)**
- A: F1–F3 vouchers · F4 PDC · A6/Q11 negative-stock policy · A1/A3 pricing resolver + sale schemes · A14 counter UPI QR · F6 Tally XML
- B: C3 `supplier_item_map` · C6 diff-rate alert · G1 real GSP (IRN + EWB + GSTIN lookup) · H2 TB register · H3 doctor/patient reports · L1 managed WhatsApp

**Stage 2: The CA and the chain owner sign off (≈ 8–10 weeks)**
- A: N10 auto-update · offline store → SQLite + N11 encryption and CSP · N9 macOS (notarised) and Linux builds · K3 regional-language print · G11 audit trail hardening + edit-log report · I4 Control Room v1 · N2 data export + Drive backup · B9/J3 label printing · B10 pack QR/GS1 parsing
- B: G5 composition · G9 TDS (new Act) · G3 IMS/2B via GSP · M1 Business Analysis pivot · C1 email-in bill ingestion · B1 drug master v1 (DB-backed)

**Stage 3: Strategic**
- H4 ABHA/HFR/DHIS · N1 store edge relay (only if pilots need it) · D-block wholesale pack · M4 eOwner depth · N4 deeper Marg migration (open bills, PDC, pending claims)

**Go-to-market, alongside the stages:** a Marg-shortcut preset (A19), free done-for-you migration, a 3-year TCO calculator against Marg + Wallet, 2–3-minute Hindi videos per workflow, and recruiting one local implementation partner per pilot city.

---

## 10. Marg demo checklist (settle the ❓ items)

Ask a Marg dealer to **show** each of these on Marg ERP AI+ / 9+ Gold with pharma setup. Record the yes/no answers in this file.

1. Scan a Schedule H2 pack QR: does it auto-pick batch and expiry? Does it read GS1 DataMatrix?
2. Is there a banned-FDC or recalled-batch block at billing? Who updates the list?
3. Is there an NPPA/DPCO ceiling price check?
4. Is there a configurable **minimum margin %** (not just sale < purchase)?
5. Can it print an A5 half-page and a Hindi thermal bill from the same item?
6. Can it print cheques? Which banks?
7. Is there TB register export in Ni-kshay format?
8. Is there GSTR-9 / 9C? Is IMS accept/reject pushed to the portal? Is there a Ship-To GSTIN field?
9. Is there an RCM self-invoice? ITC reversal on written-off expired stock?
10. Are there estimate, challan and kit documents? A picker → cashier queue?
11. EDC integration: which terminals?
12. Does it have a cold-chain flag?
13. Does eDelivery have GPS tracking? How does eOwner pricing work?
14. What do ARC and typical Wallet spend actually cost per year for a 2-counter pharmacy?
15. What does a dealer charge for a visit, and what is the typical response time?
16. Does Marg ERP 9+ / AI+ run natively on macOS or Linux, or only on Windows (or through MargBooks in a browser)? What happens to printing and scanners on a Mac?

---

## 11. Deliberately out of scope

| Marg capability | Why we are not building it |
|---|---|
| HR, attendance, payroll (Marg's HR product, not verified in this pass) | Product decision 2026-10-20: out of scope. Integrate or export to a payroll tool instead |
| Consumer storefront / e-commerce app (MargMart is a separate product) | Product decision 2026-10-20: out of scope. The external-orders API covers partner channels |
| eRetail B2B marketplace and PharmaNXT distributor locator | Needs a network of distributors. Revisit only with a partner such as Pharmarack/Retailio |
| Hospital IPD/TPA module | Different product. Revisit only if a pilot is a hospital pharmacy |
| Manufacturing ERP, MargLabz (lab OS) | Not pharmacy retail |
| Embedded lending (Indifi credit via MargPay, 2020) | Regulated and partner-led. Not core |

---

## 12. Sources

**Marg help centre (care.margcompusoft.com):** the most reliable source for how Marg actually works
- Pricing / Hide cost: [hide item detail](https://care.margcompusoft.com/margerp/advance-control-/371/1/How-we-can-hide-item) · [hide while billing](https://care.margcompusoft.com/margerp/sale/63762/1/How-to-hide-the-purchase) · [ban purchase entry](https://care.margcompusoft.com/margerp/purchase/149470/1/How-to-Ban-purchase-entry) · [hide item for user](https://care.margcompusoft.com/margerp/inventory-master/3186/1/How-we-can-hide-)
- Negative stock: [enable](https://care.margcompusoft.com/margerp/inventory/119944/1/How-to-sale-new-batch) · [disable / operator](https://care.margcompusoft.com/margerp/inventory/129/1/null) · [item-wise](https://care.margcompusoft.com/margerp/inventory/526/1/null) · [indicator](https://care.margcompusoft.com/margerp/inventory/139567/1/How-to-enable-indication)
- Rates and schemes: [sale < purchase indicate/ban](https://care.margcompusoft.com/margerp/batch/175/1/How-to-enable-indication-if) · [sale rate from purchase](https://care.margcompusoft.com/margerp/batch/411/1/How-to-generate-Sale-Rate) · [diff rate alert](https://care.margcompusoft.com/margerp/purchase/3957/1/At-the-time-of-Purchase) · [qty-wise rate/scheme](https://care.margcompusoft.com/margerp/rate-and-discount-master/2205/1/null) · [My Own Sales Scheme](https://care.margcompusoft.com/margerp/rate-and-discount-master/30076/1/null) · [party-wise company discount](https://care.margcompusoft.com/margerp/rate-and-discount-master/1990/1/How-to-set-party-wise) · [party categorisation](https://care.margcompusoft.com/margerp/rate-and-discount-master/33709/1/How-to-set-party-categorization) · [item-party special](https://care.margcompusoft.com/margerp/rate-and-discount-master/35367/1/How-to-set-Item-party) · [party bill discount](https://care.margcompusoft.com/margerp/all-ledgers/108461/1/how-to-set-party-wise-bill-discount-in-marg-software)
- Accounting: [Tally ERP 9 export](https://care.margcompusoft.com/margerp/data-import-export/45381/1/null) · [Tally Prime export](https://care.margcompusoft.com/margerp/data-import-export/182029/1/how-to-export-marg-data-and-import-in-tally-prime-software) · [PDC](https://care.margcompusoft.com/margerp/pd-cheques-cash/84768/1/null) · [cheque dishonour](https://care.margcompusoft.com/margerp/cheque-dishonored-advance/2226/1/trees) · [interest basis](https://care.margcompusoft.com/margerp/general-and-a-c/2971/1/How-we-can-set-interest)
- Tax: [TDS 194Q](https://care.margcompusoft.com/margerp/tds-tcs-reportss/171029/utils/messages) · [TCS](https://care.margcompusoft.com/margerp/inventory/167187/1/TCS---Tax-Collected-at) · [TDS deductor](https://care.margcompusoft.com/margerp/marg-setup/345/1/How-to-feed-TDS-details-in-Marg-software) · [CMP-08](https://care.margcompusoft.com/margerp/gst-register---return/149818/1/inffast) · [GSTR-4 JSON](https://care.margcompusoft.com/margerp/gstr-4/63468/1/adler32) · [Control Room change history](https://care.margcompusoft.com/margerp/changes-history/2770/1/null)
- Inventory: [godown-wise stock](https://care.margcompusoft.com/margerp/filtered-stock/1588/1/How-to-view%C2%A0Godown-wise-stock-) · [stock issue/receive](https://care.margcompusoft.com/margerp/inventory/2704/1/How-to-enable-disable-Stock-Issue-Receive) · [Brk/Exp receive](https://care.margcompusoft.com/margerp/breakage-expiry-receive/72588/1/null) · [expired → scrap](https://care.margcompusoft.com/margerp/stock-issue/1526/1/null) · [Brk/Exp issue](https://care.margcompusoft.com/margerp/breakage-expiry-issue/79016/1/How-to-create-brk-exp-issue) · [reorder](https://care.margcompusoft.com/margerp/re-order-management/2343/1/crc32) · [shortage reorder](https://care.margcompusoft.com/margerp/re-order-management/52251/1/how-to-generate-re-order-on-shortage-bases-in-marg-software) · [barcode PRN](https://care.margcompusoft.com/margerp/barcode-prn-/36318/1/how-to-export-barcode-format) · [barcode troubleshooting](https://care.margcompusoft.com/margerp/barcode-queries/370/1/null)
- Compliance and reports: [TB report](https://care.margcompusoft.com/margerp/departments-reports/43925/1/How-to-see-TB-Report) · [Schedule H1](https://care.margcompusoft.com/margerp/departments-reports/62451/1/How-to-print-Schedule-H1) · [patient-wise sale](https://care.margcompusoft.com/margerp/sale-report/153438/1/How-to-view-patient-wise) · [patient × doctor](https://care.margcompusoft.com/margerp/transaction-analysis/110871/1/How-to-view-patient-doctor) · [doctor-company-wise](https://care.margcompusoft.com/margerp/sale-report/67762/1/How-to-view-doctor-company) · [route-wise](https://care.margcompusoft.com/margerp/sale-analysis/40929/1/How-to-see-Route-wise)
- Purchasing: [Collaborative Commerce](https://care.margcompusoft.com/margerp/collaborative-commerce/166557/1/collab) · [collab by email](https://care.margcompusoft.com/margerp/sale/182217/1/what-is-the-process-of-collaborative-commerce-on-the-basis-of-email-in-marg-software) · [ERP-to-ERP order](https://care.margcompusoft.com/margerp/erp-to-erp-order/181965/1/what-is-the-process-of-erp-to-erp-order-feature-in-marg-software) · [PDF bill import](https://care.margcompusoft.com/margerp/transaction-import/165197/1/import)
- Language and print: [Hindi bill](https://care.margcompusoft.com/margerp/gui-format/91744/1/inffast) · [item name other language](https://care.margcompusoft.com/margerp/inventory-master/12057/1/How-to-print-item-name) · [Self Format tutorial](https://tutorial.margcompusoft.com/tutorial/76)
- Platform: [LAN sharing](https://care.margcompusoft.com/margerp/sharing/169616/1/how-to-connect-sharing-main-system-with-server-client-system) · [RDP](https://care.margcompusoft.com/margerp/general-queries/164889/1/What-is-the-process-of-RDP-Configuration-with-Marg-Software) · [branch sync](https://care.margcompusoft.com/margerp/general-queries/62624/1/How-to-enable-synchronization-for) · [Home edition FAQ](https://care.margcompusoft.com/margerp/general-queries/163765/1/Home-Edition-FAQ) · [Marg Cloud FAQ](https://care.margcompusoft.com/margerp/faq/184484/1/marg-cloud-faq-s) · [WhatsApp setup](https://care.margcompusoft.com/margerp/general-queries/164883/1/WHATSAPP-SETUP) · [Drive backup](https://care.margcompusoft.com/margerp/serverexe/155360/1/How-to-send-Backup-on) · [Wallet cloud backup](https://care.margcompusoft.com/marg-wallet/marg-cloud-backup/184043/10/what-is-the-process-of-cloud-backup-through-marg-wallet) · [AI ledger balance](https://care.margcompusoft.com/margerp/all-ledgers/186599/1/how-to-check-ledger-balance-with-ai-in-marg-erp-software)
- ABHA: [ABDM linkage](https://care.margcompusoft.com/margerp/software-linkage-with-abdm/184528/1/how-to-link-marg-erp-software-with-ayushman-bharat-digital-mission) · [ABHA FAQ](https://care.margcompusoft.com/margerp/digital-entryy/184521/1/abha-faq-s)

**Marg marketing pages (🟡)**
- [Pharmacy software](https://margcompusoft.com/retail/pharmacy_software.html) · [Medical store software](https://margcompusoft.com/retail/medical_store_software.html) · [AI ERP](https://margcompusoft.com/m/ai-erp-software/) · [Marg Genie](https://margcompusoft.com/marg-genie/index.html) · [PharmaNXT](https://margcompusoft.com/pharmanxt_app.html) · [ABHA partnership](https://margcompusoft.com/marg-abha-partnership.html) · [Connected banking](https://margcompusoft.com/connecting-banking.html) · [Marg Wallet](https://margcompusoft.com/marg-wallet.html) · [ERP-to-ERP](https://margcompusoft.com/erp-to-erp-order-distributor.html) · [eOrder](https://margcompusoft.com/eorder_salesman_order_app.html) · [Audit trail](https://margcompusoft.com/m/audit-trail/) · [Price list](https://margcompusoft.com/marg-price-list.html) · [Hospital](https://margcompusoft.com/retail/hospital-management-software.html) · [Clinic](https://margcompusoft.com/retail/clinic-management-software.html)

**Third-party**
- Pricing: [eChai (Marg list read 10 Nov 2026)](https://echai.ventures/explore/tools/marg-erp) · [ERPResearch](https://www.erpresearch.com/pricing/marg-erp)
- Partners and press: [ICICI × Marg (2018)](https://www.icici.bank.in/about-us/news-room/2018/news-marg-erp-limited-partners-with-icici-bank) · [PayU × Marg (Aug 2026)](https://cxotoday.com/media-coverage/payu-and-marg-erp-join-forces-to-simplify-digital-payment-collections-and-reconciliation-for-indias-pharma-distributors-and-msmes/) · [BioSpectrum on PharmaNXT](https://www.biospectrumindia.com/public/news/86/15831/marg-erp-eyes-rs-250-cr-from-pharmanxt-in-3-yrs.html)
- Apps: [eRetail](https://apps.apple.com/in/app/eretail/id1217414784) · [eOwner](https://apps.apple.com/in/app/eowner/id6476924466)
- Platform: [Flipkart listing, Marg ERP 9+ Basic (Windows system requirements)](https://www.flipkart.com/marg-erp-9-accounting-software-basic-edition/p/itm687aff49c0bec) · [Capterra platform listing](https://www.capterra.com/p/151832/Erp-Software-9/) · [cloud-host blog on Marg system requirements](https://www.clouddesktoponline.com/blog/marg-system-requirements)
- Reviews: [Capterra](https://www.capterra.com/p/151832/Erp-Software-9/) · [consumercomplaints.in](https://www.consumercomplaints.in/marg-compusoft-b111674) · [SoftwareSuggest](https://www.softwaresuggest.com/marg-pharmacy/reviews)
- Buyer's guide: [dclouds 2026 retail ERP guide](https://dclouds.in/retail-erp-software/)
- Regulatory: [CDSCO FDC page](https://cdsco.gov.in/opencms/opencms/en/Drugs/FDC/) · [Rajya Sabha answer on 156 FDCs](https://rsdebate.nic.in/bitstream/123456789/759034/1/PQ_267_11032025_U1406_p432_p433.pdf) · [News on AIR, H2 expansion](https://newsonair.gov.in/health-ministry-expands-qr-code-based-track-and-trace-framework-for-medicines/) · [ThePrint, H2 expansion](https://theprint.in/health/qr-codes-now-mandatory-on-vaccines-anti-cancer-drugs-as-govt-hopes-to-curb-fake-pharma-market/2969973/) · [CDSCO spurious-drug guidance](https://cdsco.gov.in/opencms/export/sites/CDSCO_WEB/Pdf-documents/Guidance-for-Identification-and-Verification-of-Spurious-Drugs.pdf)
- GST: [anukram (IMS / 3B lock)](https://www.anukram.in/blog/gstr-3b-itc-locking-ims-july-2026.html) · [taxlly](https://www.taxlly.com/gstr-3b-will-be-locked-from-july-2026-what-every-gst-taxpayer-should-know/) · [indiacorporates (Apr 2026)](https://indiacorporates.com/blog/gst-changes-from-1-april-2026/) · [treelife calendar](https://treelife.in/calendar/gst-compliance-calendar/) · [incorpx](https://www.incorpx.io/blog/new-gst-rules-changes-2026)

**MediFlow code** (all paths relative to repo root, at `5de601a`): every `file:line` in this document was read during the audit. Re-check before acting if `main` has moved.
