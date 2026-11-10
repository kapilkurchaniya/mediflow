# Quick Desk Reference: Sales Returns & GST Credit Notes
**Document ID:** SOP-POS-002 | **Target:** Cashiers & Store Managers

---

## 1. Sales Return Standard Operating Procedure
1. Navigate to **Sales $\rightarrow$ Returns** (`/dashboard/sales/returns`).
2. Search for the original sale by typing the 16-character canonical invoice number (e.g. `INV/26-27/000042`) or scanning the invoice QR code.
3. Verify that the batch number printed on the returned medicine box/strip matches the batch recorded in MediFlow.
4. Enter the quantity returned and select the return reason code:
   - `EXPIRED`: Transferred to quarantine for distributor return.
   - `DAMAGED`: Stock write-off with damage justification.
   - `CUSTOMER_CHANGE`: Returned to active saleable shelf inventory (if unsealed/intact).

---

## 2. Refund Settlement Modes
- **Cash Refund:** Drawn from the active cashier session cash drawer (requires manager sign-off if $>$ ₹1,000).
- **Store Credit Note:** Issues a 16-character credit note under GST Rule 53 with 6-month validity.
- **Original UPI Reversal:** Initiates webhook refund through payment provider.

---

## 3. Statutory Accounting Impact
- MediFlow automatically updates the GST Outward Register and reverses proportional CGST + SGST.
- Credit note serial numbers strictly adhere to GST Rule 46(b) formatting.
