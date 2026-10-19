# Glossary

## Pharmacy & regulation

| Term | Meaning |
|---|---|
| **Batch / lot** | A production run of a medicine, with its own batch number, manufacturing date and expiry. Stock is tracked per batch. |
| **FEFO** | *First Expiry, First Out*: sell the batch that expires soonest first. |
| **MRP** | *Maximum Retail Price*, printed on the pack, GST-inclusive. Selling above MRP is illegal. |
| **PTR / PTS** | *Price to Retailer* / *Price to Stockist*: trade prices on the supplier invoice, GST-exclusive. |
| **Salt / composition / generic** | The active ingredient (e.g. Paracetamol 650 mg). Brands with the same salt are **substitutes**. |
| **Schedule H / H1 / X / G** | Categories under the Drugs & Cosmetics Rules 1945 that decide prescription and register requirements. See doc 05. |
| **NDPS** | *Narcotic Drugs and Psychotropic Substances Act 1985*; extra controls on narcotics. |
| **Form 20/21 (20B/21B)** | Drug licence forms for retail (wholesale) sale. The number is printed on invoices. |
| **Registered pharmacist** | A licensed pharmacist who must supervise dispensing; their registration number goes on registers. |
| **Prescription (Rx)** | The doctor's written order. **Rx-required** = prescription-only drug. |
| **Dispensing register** | The statutory log of scheduled-drug sales (`dispensing_logs`). |
| **GRN** | *Goods Received Note*: recording a supplier delivery into stock. Our "purchase". |
| **PO** | *Purchase Order*: what we ask a supplier to deliver, before the GRN. |
| **Scheme / free qty** | Supplier offers like "10+1" (buy 10, get 1 free). It lowers the landed cost per unit. |
| **Landed cost** | The true cost per unit after discounts and free quantity, excluding GST. |
| **Promise order** | A customer asks for an out-of-stock item; the shop "promises" to get it. |
| **Expiry return / breakage** | Returning expired or damaged stock to the supplier for credit. |
| **Medical representative (MR)** | A pharma company's sales rep; commissions are tracked per rep. |
| **Marg / GoFrugal / eVitalRx** | Incumbent pharmacy software in India (our competitors). |

## GST & accounting

| Term | Meaning |
|---|---|
| **GST** | *Goods and Services Tax*. **CGST + SGST** for sales within a state (split 50/50); **IGST** for sales between states. |
| **GSTIN** | 15-character GST registration number. The first 2 digits are the state code; the last character is a checksum. |
| **HSN** | *Harmonised System of Nomenclature*: product classification code on invoices (medicines are mostly 3003/3004). |
| **GST 2.0** | The rate rationalisation effective 22 Sep 2025. The 12% slab was merged into 5%; medicines are mostly 5%. |
| **Place of supply** | The state where a supply is taxed; it decides CGST/SGST vs IGST. |
| **B2B / B2C / B2CL** | Business-to-business (buyer has a GSTIN) / business-to-consumer / B2C *large* (inter-state B2C above a threshold). |
| **GSTR-1** | Monthly or quarterly return of outward supplies (sales). |
| **GSTR-3B** | Monthly summary return; tax is paid with it. |
| **GSTR-2B** | Auto-generated statement of purchase invoices that your suppliers reported; it decides how much ITC you can claim. |
| **IMS** | *Invoice Management System*: the portal where you accept or reject suppliers' invoices before claiming ITC. |
| **ITC** | *Input Tax Credit*: GST paid on purchases, offset against GST on sales. |
| **Credit note / debit note** | Documents that reduce or increase a previously issued invoice's value (returns, price corrections). |
| **Delivery challan** | A non-tax document for moving goods without a sale (e.g. between branches under the same GSTIN). |
| **E-invoice / IRN / IRP** | B2B invoices are registered on the government *Invoice Registration Portal* and receive a 64-character *Invoice Reference Number* plus a signed QR code. |
| **GSP** | *GST Suvidha Provider*: licensed intermediaries whose APIs software uses to talk to GST systems. |
| **E-way bill** | A permit for moving goods over ₹50,000 by road. |
| **AATO** | *Aggregate Annual Turnover*; it decides thresholds such as e-invoicing (₹5 crore). |
| **FY (fiscal year)** | The Indian financial year, 1 April → 31 March. Invoice series reset each FY. |
| **Paise** | 1/100 of a rupee. All money is stored as integer paise. |
| **Basis points (bp)** | 1/100 of a percent. 1200 bp = 12%. |
| **Double-entry** | Every transaction posts equal debits and credits to accounts, so the books always balance. |
| **Journal entry / ledger** | One accounting transaction / the running list of entries for one account. |
| **Trial balance** | A list of every account's balance; total debits must equal total credits. |
| **Receivables / payables** | Money customers owe us / money we owe suppliers. |
| **Day book** | A chronological list of all transactions for a day. |
| **Bank reconciliation** | Matching bank statement lines to recorded payments. |
| **DLT** | TRAI's *Distributed Ledger Technology* registry for SMS sender IDs and templates in India. |
| **DPDP** | *Digital Personal Data Protection Act 2023* and the *DPDP Rules 2025*, India's data-protection law. **Data fiduciary**: decides why and how personal data is used (the pharmacy). **Data processor**: processes it on their behalf (MediFlow). |

## Engineering

| Term | Meaning |
|---|---|
| **ERP** | *Enterprise Resource Planning*: one system where purchasing, stock, sales, accounting and compliance share data. |
| **SaaS / multi-tenant** | One hosted app serving many customers. Each customer is a **tenant**, isolated by `tenant_id`. |
| **Next.js App Router** | The framework's routing system based on the `src/app/` folder structure. |
| **Server Component / Client Component** | React components that render on the server (can read the DB) / in the browser (`"use client"`, interactive). |
| **Server Action** | A function marked `"use server"` that the browser can call like an API. It's a public endpoint, so it must check auth itself. |
| **Route Handler** | `route.ts` files under `src/app/api/`: classic HTTP endpoints. |
| **Proxy (`proxy.ts`)** | Next.js 16's name for middleware. It runs before routes; we use it only for quick redirects. |
| **ORM / Drizzle** | *Object-Relational Mapper*: write typed TypeScript instead of raw SQL. Drizzle is ours. |
| **Migration** | A versioned SQL file that changes the DB schema. Applied in order and tracked in a table. |
| **`drizzle-kit push`** | Syncs the DB directly to the schema **without** a migration file. Fine for experiments, dangerous for shared or production DBs. |
| **Transaction** | A group of DB statements that all succeed or all fail together. |
| **Savepoint** | A checkpoint inside a transaction you can roll back to without aborting the whole transaction. In Drizzle: `tx.transaction(...)`. |
| **Row lock (`SELECT … FOR UPDATE`)** | Stops two transactions changing the same row at once (e.g. two cashiers selling the last strip). |
| **Idempotency / idempotency key** | Doing the same request twice has the same effect as once. A unique key per request lets the server detect repeats. |
| **Outbox pattern** | Write "things to do later" (send a WhatsApp) into a table inside the same transaction; a worker processes them after commit with retries. Messages are never lost and never sent for rolled-back sales. |
| **RBAC** | *Role-Based Access Control*: users have roles, roles have permissions, code checks permissions. |
| **Audit log** | An append-only record of who changed what and when. |
| **DTO** | *Data Transfer Object*: a minimal object with only the fields the client needs. |
| **PWA** | *Progressive Web App*: a website installable like an app that can work offline. |
| **Service worker** | A browser script that intercepts network requests; it lets the app load offline. |
| **IndexedDB / Dexie** | The browser's built-in database / a friendly library on top of it. |
| **Local-first / sync engine** | Apps that keep data on the device and sync with a server (PowerSync, ElectricSQL, Zero). |
| **CI** | *Continuous Integration*: automated checks on every push or PR (GitHub Actions). |
| **E2E test** | *End-to-end*: drives a real browser through a user journey (Playwright). |
| **Integration test** | Tests code with real dependencies (here a real Postgres). |
| **Unit test** | Tests one pure function in isolation. |
| **ADR** | *Architecture Decision Record*: a short doc explaining one decision and why. |
| **Lane** | In this project, one developer's area of ownership plus their long-lived branch. |
| **Contract (🤝)** | An agreed interface (types and function signatures) merged first so both lanes can build in parallel. |
| **HMAC** | A keyed hash used to prove a webhook came from the real sender. |
| **AES-256-GCM** | Strong symmetric encryption with built-in tamper detection; used for secrets at rest. |
