# Pilot Chain 2-Week Operational Runbook
**Target:** 3-Branch Retail Pharmacy Pilot | **Standard:** Zero-Disruption Production Go-Live

---

## 1. Pilot Objectives & Rules of Engagement
1. **Parallel Execution:** MediFlow runs in parallel with existing legacy software (Marg ERP / Vyapar) for 14 calendar days.
2. **Zero Financial Drift:** Daily closing totals must reconcile within ₹2.00 (fractional rounding tolerance) across all stores.
3. **Emergency Fallback:** If counter throughput drops or an unhandled hardware block occurs, staff switch to Marg instantly without patient delay.
4. **Direct Feedback Loop:** Staff reports friction via the in-app **Report Pilot Feedback** modal in under 15 seconds.

---

## 2. 14-Day Phased Rollout Schedule

### Phase 1: Days 1 to 3 — Shadow Billing & Setup Verification
- **Store Scope:** Primary Flagship Branch.
- **Workflow:** Cashier inputs customer bill in Marg first, prints paper receipt. The dispensing pharmacist replicates the bill simultaneously into MediFlow.
- **EOD Action:** Run **Pilot Daily ERP Reconciliation** (`/dashboard/reports/pilot-reconcile`) to verify Net Sales, CGST, SGST, and batch inventory deductions.

### Phase 2: Days 4 to 10 — Primary MediFlow Counter Billing
- **Store Scope:** All 3 branches.
- **Workflow:** MediFlow acts as the live billing terminal. Thermal 80mm receipts print directly via raw USB/Serial ESC/POS. Marg acts strictly as shadow ledger.
- **Cash Management:** Cashiers perform shift open (`X-Report`) and shift close (`Z-Report`) with physical cash drawer reconciliation.
- **EOD Action:** Download daily reconciliation CSV and upload to internal pilot tracking folder.

### Phase 3: Days 11 to 14 — Operational Drills & Standalone Cutover
- **Drill 1 (Offline Resilience):** Physically pull the router internet cable at Branch 2 during a peak 2-hour window. Verify counter continues billing uninterrupted via local desktop SQLite. Plug internet back in: verify automated background replay with zero collisions.
- **Drill 2 (Inspector Pack):** Perform mock regulatory audit. Export Drug Inspector pack (`/dashboard/compliance/export`) and verify Schedule H1 registers.
- **Drill 3 (Month-End CA Pack):** Generate GSTR-1 JSON (`/dashboard/accounting/export`) and upload to GSTN Offline Tool v1.4. Confirm zero schema errors.

---

## 3. Discrepancy Escalation & Resolution Matrix
| Discrepancy | Likely Root Cause | Immediate Action |
| :--- | :--- | :--- |
| **Delta $\le$ ₹2.00** | Fractional item-level vs invoice-level tax rounding | Marked as `TOLERABLE_ROUNDING`. No action needed. |
| **Delta $>$ ₹2.00** | Missing bill, omitted return, or cancelled invoice | Check invoice sequence count. Inspect Cancelled Sales tab. |
| **Tax Variance** | Marg using outdated 12% GST rate for formulation | Verify HSN 3004 tax rate in MediFlow (`GST_RATES_BP`). |
| **Scanner Lag** | Raw barcode buffer speed mismatch | Adjust USB HID inter-character delay in Settings $\rightarrow$ Devices. |

