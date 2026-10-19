# 05 · Indian pharmacy & GST rules that shape the software

> **Not legal advice.** These are the rules as we understand them from public sources, **last verified 20 Oct 2026**. Several sources disagree on details (noted inline). Before a release that depends on a rule, re-check the primary source, ideally with the customer's CA or the state Drugs Controller. When a rule changes, update this file and the matching constant in code in the same PR.

## 1. Drugs & Cosmetics Act 1940 / Rules 1945 (retail sale)

### Licences a retail pharmacy holds
- **Form 20 / 21**: retail licences to sell allopathic drugs (other than / including Schedule C & C1 biologicals). **Form 20B / 21B**: wholesale. Each **store** has its own licence number, which is printed on every invoice. Data: `stores.drug_license_no`.
- A **registered pharmacist** must supervise dispensing. Data: `users.pharmacist_reg_no`. It's printed on registers.

### Drug schedules (field `medicines.schedule`: `none | G | H | H1 | X | narcotic`)

| Schedule | Meaning | What the software must do |
|---|---|---|
| **None / OTC** | Over the counter | Nothing special |
| **G** | Sold under medical supervision; label warning | Show warning |
| **H** | Prescription only | Require doctor name and prescription ref before billing. Logged in `dispensing_logs` (register `schedule_h`). |
| **H1** (introduced by GSR 588(E), 30 Aug 2013; mostly 3rd/4th-gen antibiotics, anti-TB drugs, some habit-forming drugs) | Prescription only **and** a separate register | Record **at the time of supply**: prescriber name and address, patient name, drug name, quantity. Keep for **3 years**, open for inspection (Rule 65(3)(h)). The schedule lists about 46 drugs; one source says 48 after 2024 amendments, so verify the current list. |
| **X** | Psychotropics and others; strictest | Prescription in **duplicate**. The pharmacy retains one copy for **2 years**. Separate register. Stock kept under lock. |
| **Narcotic (NDPS Act 1985)** | Morphine, codeine combinations, etc. | Separate register and state-specific NDPS forms; quantity limits. |

Retention elsewhere: sale memos about 3 years; other registers about 2 years from the last entry ([accountune guide](https://accountune.com/pharmacy-billing-batch-expiry-guide), [Nagaland/Kohima district orders](https://morungexpress.com/kohima-dc-issues-strict-regulations-for-pharmacies-and-medical-stores)). **Software rule:** never delete `dispensing_logs`, `prescriptions`, `sales` or `sale_items`, and have exports ready for an inspector (CSV/PDF per register and date range).

### Other dispensing rules that touch the software
- **No sale of expired stock.** POS already blocks it (`batch.expiryDate <= today`).
- **Batch and expiry on every invoice line.** Already printed.
- **Substitution:** a pharmacist may suggest a generic with the same salt, but a doctor's brand prescription for H/H1/X drugs needs the patient's consent. Show substitutes; log when one is chosen.

## 2. GST

### Rates after "GST 2.0" (effective 22 Sep 2025)
- The 12% slab was merged into 5%. **Most medicines are now 5%** (previously 12%). A list of specified **life-saving drugs is exempt (0%)**. Sources say 33 ([Bajaj](https://www.bajajfinserv.in/gst-on-medicines)) or 36 ([EY alert](https://www.ey.com/content/dam/ey-unified-site/ey-com/en-in/alerts-hub/2025/09/gst-reduction-on-medicines-and-medical-devices-for-affordable-healthcare.pdf)), so use the official notification as the master list.
- Ayurvedic, Unani, Siddha and homeopathic medicines, and diagnostic kits, also moved to 5% ([Bajaj](https://www.bajajfinserv.in/gst-on-medicines)).
- Remaining slabs: **0%, 5%, 18%, 40%** (40% applies to sin/luxury goods, not medicines) ([Treelife](https://treelife.in/tag/gst-changes-2026/)). Cosmetics and FMCG items sold in pharmacies may still be 18%, so check per HSN.
- Software impact:
  - Default `medicines.gst_rate_bp` must become `500`.
  - Add a rate catalogue constant `GST_RATES_BP = [0, 500, 1800, 4000]` and validate against it.
  - Run a one-time **bulk re-rate tool** (HSN 3003/3004 → 5%) for existing catalogues.
  - Purchase invoices dated before 22 Sep 2025 legitimately carry 12%. **Never** re-rate historical documents; the rate lives on each `sale_items` / `purchase_items` row.

### HSN codes
- Medicaments are mostly HSN **3003 / 3004** (e.g. `30049099`). Invoices must show HSN (4 digits if turnover ≤ ₹5 Cr, 6 digits above; verify for your customer). `medicines.hsn` exists; make it required for new items.

### Tax invoice rules that touch our numbering
- **Rule 46(b):** the invoice number has **≤ 16 characters** and a consecutive serial number unique for the financial year. It may contain letters, digits, `-` and `/`. **Multiple series are allowed** (e.g. one per counter or device), which is what makes offline billing legal (see doc 10). Our format `INV/25-26/000001` is exactly 16 characters, so a longer prefix breaks the rule.
- **Intra-state** sale → CGST + SGST (half each). **Inter-state** → IGST. Determined by comparing the supplier's state (store GSTIN) with the **place of supply**. For B2C over the counter, the place of supply is the store's state. For B2B it's the buyer's GSTIN state.
- **Each GSTIN is a separate taxpayer.** A chain with stores in two states has two GSTINs and files two sets of returns. Stock moved between them is a **taxable supply** needing a tax invoice. A transfer within one GSTIN needs only a **delivery challan**. This matters for doc 11.

### Returns
- **GSTR-1** (outward supplies, monthly or quarterly with IFF): B2B invoice-wise, B2C large, B2C small summary, CDNR (credit/debit notes), HSN summary, document summary. `buildGstr1Data` / `buildGstr1JsonPayload` exist; they need tests against the portal's JSON schema.
- **GSTR-3B**: summary return and tax payment.
- **IMS (Invoice Management System)**: recipients accept, reject or keep each supplier invoice before claiming ITC. It became fully operational around April 2026 per secondary sources. GSTN clarified on 8 Oct 2025 that GSTR-2B still auto-generates and ITC still flows into 3B ([TaxGuru](https://taxguru.in/?p=1089512)). Claims that 3B is "hard locked" to 2B from April 2026 are **unverified** ([Accountune](https://www.accountune.com/gst-new-rules-april-2026-small-business-india)). Software impact: import GSTR-2B / IMS JSON, match it against `purchases`, and show mismatches. That's Lane B, Phase 5.

### E-invoicing (IRN)
- **Mandatory for B2B invoices when the aggregate annual turnover (AATO) of any year from 2017-18 onward exceeds ₹5 crore.** B2C is exempt, so most pharmacy counter sales don't need it; sales to hospitals, clinics and other businesses do.
- **30-day reporting limit:** taxpayers with AATO ≥ ₹10 crore can't report an invoice to the IRP more than 30 days after its date (from 1 Apr 2025) ([Tally](https://tallysolutions.com/business-guides/e-invoicing-compliance-rules-in-2026/), [TaxGuru](https://taxguru.in/?p=1089104)).
- **2FA / MFA** on the e-invoice portals is being phased in; sources disagree on dates ([Tally](https://tallysolutions.com/business-guides/what-changed-in-e-invoicing-compliance-in-2026/), [Bajaj](https://www.bajajfinserv.in/hindi/gst-invoice)).
- Integration is through a **GSP** (GST Suvidha Provider) or the IRP's direct API, with a sandbox for testing. **Our current provider is a simulator** (doc 03, S5).

### E-way bill
- Required for goods movement over ₹50,000 consignment value (state rules vary). It's relevant for **inter-branch stock transfers** and large B2B deliveries, not counter sales.

## 3. Data protection: DPDP Act 2023 and DPDP Rules 2025

- The Rules were notified on **13–14 Nov 2025**, with a phased roll-out over about 18 months ([Hogan Lovells](https://www.hoganlovells.com/en/publications/indias-digital-personal-data-protection-act-2023-brought-into-force-), [BDO](https://www.bdo.in/en-gb/news/2025/digital-personal-data-protection-rules-2025-%E2%80%94-check-provisions,-implementation-plan,-penalties)). Core obligations (notice, consent, security safeguards, breach reporting, retention) apply from **May 2027** per most sources. One reading puts some provisions at **13 Nov 2026**, so verify with a lawyer ([Mondaq](https://webiis10.mondaq.com/india/data-protection/1706878/indias-digital-personal-data-protection-act-phased-rollout-and-key-compliance-milestones), [TCSA](https://www.tcsa.in/resources/dpdp-rules-2025-implementation-roadmap)).
- **Who is responsible:** the pharmacy is the *Data Fiduciary* for its patients. MediFlow is the *Data Processor*. We must give pharmacies the tools to comply:
  - A **consent and notice** capture point (at customer creation or the first WhatsApp message).
  - **Purpose-limited use:** marketing WhatsApps need separate consent from transactional ones.
  - **Access, correction and erasure requests.** Erasure must respect statutory retention (registers must be kept, so anonymise rather than delete where the law requires retention).
  - **Breach notification** process, security safeguards (encryption, access control, audit logs) and a retention schedule.
- Health data (diagnosis, prescriptions) is sensitive in practice even though the Act has no special category. Restrict it by permission.

## 4. Messaging rules (India)

- **SMS:** TRAI's DLT regulation requires registered sender IDs (headers) and pre-registered **templates**. An unregistered template is blocked by the operator. Model `sms_templates` with a `dlt_template_id`.
- **WhatsApp Business:** business-initiated messages outside the 24-hour customer service window need **approved templates** (MARKETING / UTILITY / AUTHENTICATION categories, each priced differently). Opt-in is required.

## 5. Constants to centralise in code (Roadmap B1.1)

Create `src/lib/regulatory.ts` and import from it everywhere:

```ts
export const GST_RATES_BP = [0, 500, 1800, 4000] as const;   // GST 2.0, from 2025-09-22
export const DEFAULT_MEDICINE_GST_BP = 500;
export const GST2_EFFECTIVE_DATE = "2025-09-22";
export const INVOICE_NO_MAX_LEN = 16;                          // CGST Rule 46(b)
export const EINVOICE_AATO_THRESHOLD_PAISE = 5_00_00_000_00;  // ₹5 crore
export const EINVOICE_30DAY_AATO_THRESHOLD_PAISE = 10_00_00_000_00; // ₹10 crore
export const REGISTER_RETENTION_YEARS = { schedule_h: 3, schedule_h1: 3, schedule_x: 2, narcotics: 2 } as const; // verify per state
export const SCHEDULED = ["H", "H1", "X", "narcotic"] as const;
```
