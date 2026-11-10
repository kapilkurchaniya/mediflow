# Quick Desk Reference: Counter Offline Continuity & Auto-Sync
**Document ID:** SOP-SYS-005 | **Target:** All Store Counter Staff

---

## 1. What Happens During an Internet Outage?
- **Zero Interruption:** When the internet connection drops, the top bar displays an amber **"Offline Mode"** badge.
- **Counter Remains Live:** You can continue scanning barcodes, searching the medicine catalog, and printing receipts without delay.
- **Local SQLite Engine:** Data is securely cached on the local desktop drive.

---

## 2. Invoicing During Outages
- Invoices are issued with provisional offline numbers (e.g., `OFF-0001`).
- The thermal receipt prints with standard GST breakdown and clear notice of offline registration.
- Cash and UPI manual reference collection work normally.

---

## 3. What Happens When Internet Restores?
1. The top bar indicator turns green: **"Online — Syncing"**.
2. MediFlow's background sync engine sends queued offline sales to the cloud server.
3. Official 16-character canonical GST invoice numbers are assigned in exact sequence.
4. Cloud inventory balances and accounting ledgers update automatically with zero data collision.
5. If a sync collision occurs, the system logs it to the Manager Review Drawer.

