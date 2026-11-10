# Quick Desk Reference: Monthly GST Filing & CA Audit Pack
**Document ID:** SOP-ACC-004 | **Target:** Accountants & Pharmacy Business Owners

---

## 1. Month-End Pre-Filing Checklist
- [ ] Ensure all counter cash sessions for the month are closed and banked.
- [ ] Verify all distributor purchase bills (inwards) are recorded and approved.
- [ ] Reconcile GSTR-2B against local purchase register (flag Section 16(2)(aa) mismatches).

---

## 2. Generating the Official GSTR-1 JSON
1. Navigate to **Accounting $\rightarrow$ Export CA Pack** (`/dashboard/accounting/export`).
2. Select the filing tax period (Month and Year, e.g., November 2026).
3. Click **Export GSTR-1 JSON**.
4. The downloaded file matches the GSTN Offline Tool v1.4 schema directly (B2B, B2CS, CDNR, and HSN-level breakdowns).

---

## 3. CA Complete Audit Bundle Export
- Click **Download Complete CA Audit Pack** for the ZIP containing:
  - `gstr1_payload.json`: Direct upload to GST portal offline tool.
  - `sales_register.csv`: Outward supplies with dual CGST/SGST/IGST breakdown.
  - `purchase_register.csv`: Inward ITC register with eligibility flags.
  - `trial_balance.csv`: General ledger debit and credit reconciliation.
  - `profit_and_loss.csv`: Gross margin and net pharmacy income.
  - `stock_valuation.csv`: FIFO inventory valuation at cost vs MRP.
