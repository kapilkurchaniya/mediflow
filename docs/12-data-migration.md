# 12 · Data migration from Marg & other software

**Status:** proposed. Owner: Lane B. Built in Phase 4B.

## Why this matters

A chemist with 8 years of Marg data won't re-type 6,000 items. The import wizard **is** the sales pitch: "Send us your Marg export and you're billing on MediFlow this afternoon."

## What we need from a real shop first (action item for Lane B, Phase 1)

We couldn't find public documentation of Marg's export formats, so **don't guess**. Collect anonymised sample exports from 2–3 real pharmacies:
- Item master (name, pack, company, salt, HSN, GST %, MRP, rate, rack, schedule)
- Batch-wise stock (item, batch, expiry, quantity, MRP, purchase rate, sale rate)
- Customers (name, phone, address, GSTIN, opening balance, credit limit)
- Suppliers (name, GSTIN, DL no., phone, opening balance, credit days)
- Optional: doctors, outstanding bills (bill-wise receivables and payables)

Marg can usually export reports to Excel/CSV. Some shops will only have the raw data folder; we don't parse proprietary binary formats in v1. Store samples in a **private** location (not the repo); they contain customer phone numbers.

## Design: a generic mapping wizard, plus saved presets per source

```
Upload (CSV / XLSX) ─► Detect columns ─► Map columns → our fields ─► Validate (dry run)
      ─► Review errors / fix / skip ─► Commit (background job) ─► Report
```

- **Presets** (`src/server/domain/import/presets/marg.ts`, `gofrugal.ts`, `generic.ts`): column-name synonyms, e.g. `"Item Name" | "Product" | "ITEMNAME" → name`, and value parsers such as Marg-style dates `MM/YY` → last day of month, and `"12%"` → 1200.
- **Entities, in dependency order:** manufacturers and categories → medicines → suppliers → customers → doctors → batches/opening stock → opening balances.
- **Matching:** medicines match by barcode, then by normalised name + pack + manufacturer. The user chooses *create new / match existing / skip* for ambiguous rows.
- **Idempotent:** each row has a stable `external_ref` (source system + source code, or a row hash). Re-running an import updates rather than duplicates.
- **GST 2.0 on import:** if a medicine's imported rate is 12%, offer "convert to 5%" (doc 05).
- **Opening stock** uses `recordStockMovement(type: "opening")`, so the stock ledger is complete from day one.
- **Opening balances** post one opening journal entry per party (Dr customer receivables / Cr opening balance equity; reversed for suppliers) through Lane A's accounting API 🤝.

## Tables (`schema/import.ts`, Lane B)

```
import_jobs
  id, tenant_id, store_id, entity, source (marg|gofrugal|generic), file_name,
  status: uploaded | mapped | validated | committing | done | failed,
  mapping jsonb, totals jsonb {rows, valid, errors, created, updated, skipped},
  created_by, created_at, finished_at

import_job_rows
  id, job_id, row_no, raw jsonb, normalized jsonb, status: valid|error|skipped|committed,
  errors jsonb, target_id uuid, external_ref text
```

## Processing large files

- Parse in the browser (PapaParse is already a dependency) and send chunks of 1,000 rows to the server, so we never upload 20 MB JSON in one action. Server Action body limits apply; check `serverActions.bodySizeLimit` in the Next 16 docs before raising it.
- For XLSX, convert in the browser with **ExcelJS** or SheetJS. Pin a version, and check the licence and security advisories. SheetJS's npm package is outdated; it's distributed from its own CDN.
- Commit in batches of 500 rows per transaction, updating `import_jobs.totals` so the UI can show progress.

## Files (full list in ROADMAP Phase 4B)

```
src/server/domain/import/{index.ts, normalize.ts, match.ts, commit.ts, presets/*.ts}
src/app/actions/import.ts
src/app/dashboard/import/{page.tsx, [jobId]/page.tsx, ImportWizard.tsx, MappingStep.tsx, ReviewStep.tsx}
tests/unit/import-normalize.test.ts, tests/integration/import-commit.test.ts, tests/fixtures/marg-*.csv (synthetic only)
```
