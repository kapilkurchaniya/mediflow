# MediFlow — Complete Pages & Route Inventory

> **Audit Date:** November 2026  
> **Total Application Pages:** 100  
> **Audited Navigation Routes:** 82 Primary Routes + Dynamic Sub-Routes  
> **Status:** Inspected across Desktop (`1440x900`), Tablet (`768x1024`), and Mobile (`375x812`) viewports  

---

## 1. Summary by Functional Domain

| Domain | Page Count | Primary Features | Status |
| :--- | :---: | :--- | :---: |
| **Public & Authentication** | 4 | Landing, Login, Onboarding Register, Staff Invite | Fully Tested |
| **Executive Dashboard** | 1 | Real-time KPIs, Period Revenue, Low-Stock & Expiry Alerts | Fully Tested |
| **Sales & POS Billing** | 13 | F2 Fast Counter, Returns, Cash Register Shifts, X/Z Reports, Promise Book | Fully Tested |
| **Inventory & Warehousing** | 9 | Item Master, Batches, Stocktake Audits, Quarantine, Smart CSV Import | Fully Tested |
| **Procurement & Purchases** | 14 | Inward GRNs, Purchase Orders, Central Purchasing, Reorder Engine, Debit Notes | Fully Tested |
| **Suppliers & AP Ledger** | 4 | Distributor Directory, Payables Aging, Payment Entry, Ledger History | Fully Tested |
| **Customers & CRM** | 4 | Patient Directory, Credit Accounts, Loyalty Points, Price Groups | Fully Tested |
| **Compliance & Registers** | 8 | Schedule H, Schedule H1 (Form 35), Narcotics (NDPS), Prescription Audits | Fully Tested |
| **Accounting & Financials** | 8 | P&L, Balance Sheet, Cash Flow, Trial Balance, Bank Reconciliation | Fully Tested |
| **GST & Statutory Filings** | 7 | GSTR-1, GSTR-3B, Inward ITC, Outward Supplies, E-Invoicing, Tax Rates | Fully Tested |
| **Reports & Business Intel** | 6 | Stock Valuation, Expiry Redistribution, Referral Commissions, Chain Reports | Fully Tested |
| **Settings & Multi-Store** | 15 | Branches, Staff, RBAC Permissions, Racks, Trade Schemes, API Keys | Fully Tested |
| **Omnichannel & WhatsApp** | 7 | Online Order Intake, WhatsApp Campaigns, HSM Templates, Refill Reminders | Fully Tested |
| **Total** | **100** | **Complete Pharmacy ERP & POS Suite** | **Audited** |

---

## 2. Exhaustive Page-by-Page Inventory & Testing Status

### 2.1 Public & Authentication
| Route | Component Path | Viewports Tested | Auth Required | Testing Notes & Status |
| :--- | :--- | :---: | :---: | :--- |
| `/` | `src/app/page.tsx` | Desktop, Tablet, Mobile | No | Redirects authenticated users to `/dashboard`; renders landing for guests. Clean. |
| `/login` | `src/app/login/page.tsx` | Desktop, Tablet, Mobile | No | Form submission, password toggle, error alert presentation. Working. |
| `/register` | `src/app/register/page.tsx` | Desktop, Tablet, Mobile | No | Store onboarding, tenant name, phone, password strength. Working. |
| `/invite/[token]` | `src/app/invite/[token]/page.tsx` | Desktop, Tablet, Mobile | No | Staff invitation onboarding flow with registration token validation. Working. |

---

### 2.2 Dashboard Core
| Route | Component Path | Viewports Tested | Auth Required | Testing Notes & Status |
| :--- | :--- | :---: | :---: | :--- |
| `/dashboard` | `src/app/dashboard/page.tsx` | Desktop, Tablet, Mobile | Yes (`dashboard.view`) | Revenue card, Avg bill, Low-stock card, Expiring $\le$ 90d card, Date range filter, Recent sales table. |

---

### 2.3 Sales, POS Counter & Cash Shifts
| Route | Component Path | Viewports Tested | Auth Required | Testing Notes & Status |
| :--- | :--- | :---: | :---: | :--- |
| `/dashboard/sales` | `src/app/dashboard/sales/page.tsx` | Desktop, Tablet, Mobile | Yes (`sales.view`) | Completed invoices, payment mode filter, date filter, customer search, export CSV. |
| `/dashboard/sales/pos` | `src/app/dashboard/sales/pos/page.tsx` | Desktop, Tablet, Mobile | Yes (`sales.create`) | High-speed POS counter. Item barcode search, FEFO batch selection, strip/loose breakdown, keyboard shortcuts (F2). |
| `/dashboard/sales/[id]` | `src/app/dashboard/sales/[id]/page.tsx` | Desktop, Tablet, Mobile | Yes (`sales.view`) | Invoice summary, line items, CGST/SGST breakdown, printable receipts. |
| `/dashboard/sales/[id]/print` | `src/app/dashboard/sales/[id]/print/page.tsx` | Desktop, Tablet, Mobile | Yes (`sales.view`) | 80mm thermal slip print view with statutory drug license & GSTIN headers. |
| `/dashboard/sales/[id]/return` | `src/app/dashboard/sales/[id]/return/page.tsx` | Desktop, Tablet, Mobile | Yes (`sales.return`) | Sale return processing, item return quantity selection, credit note creation. |
| `/dashboard/sales/returns` | `src/app/dashboard/sales/returns/page.tsx` | Desktop, Tablet, Mobile | Yes (`sales.view`) | Credit notes ledger, customer credit adjustment history. |
| `/dashboard/sales/returns/[id]/print` | `src/app/dashboard/sales/returns/[id]/print/page.tsx` | Desktop, Tablet, Mobile | Yes (`sales.view`) | Printable Credit Note document for accounting. |
| `/dashboard/sales/register` | `src/app/dashboard/sales/register/page.tsx` | Desktop, Tablet, Mobile | Yes (`cash.view`) | Active shift status, opening float, cash tender balance, expected drawer cash. |
| `/dashboard/sales/register/x-report/print` | `src/app/dashboard/sales/register/x-report/print/page.tsx` | Desktop, Tablet, Mobile | Yes (`cash.view`) | Mid-day X-Report print slip for unclosed cash sessions. |
| `/dashboard/sales/register/z-report/[id]/print` | `src/app/dashboard/sales/register/z-report/[id]/print/page.tsx` | Desktop, Tablet, Mobile | Yes (`cash.view`) | End-of-shift Z-Report reconciliation and discrepancy audit print. |
| `/dashboard/sales/promise-orders` | `src/app/dashboard/sales/promise-orders/page.tsx` | Desktop, Tablet, Mobile | Yes (`sales.view`) | Medicine pre-orders / out-of-stock customer promise fulfillment book. |
| `/dashboard/sales/promise-orders/new` | `src/app/dashboard/sales/promise-orders/new/page.tsx` | Desktop, Tablet, Mobile | Yes (`sales.create`) | Create customer medicine promise request with expected arrival notification. |

---

### 2.4 Inventory, Batches & Warehousing
| Route | Component Path | Viewports Tested | Auth Required | Testing Notes & Status |
| :--- | :--- | :---: | :---: | :--- |
| `/dashboard/inventory` | `src/app/dashboard/inventory/page.tsx` | Desktop, Tablet, Mobile | Yes (`inventory.view`) | Medicine master catalog, composition, HSN, schedule type, active stock. |
| `/dashboard/inventory/new` | `src/app/dashboard/inventory/new/page.tsx` | Desktop, Tablet, Mobile | Yes (`inventory.manage`) | Add medicine master form: schedule flag, GST rate BP, reorder thresholds. |
| `/dashboard/inventory/batches` | `src/app/dashboard/inventory/batches/page.tsx` | Desktop, Tablet, Mobile | Yes (`inventory.view`) | Batch-level inventory, PTR valuation, forward expiry date filter, Edit Batch modal, Auto-sync PTR. |
| `/dashboard/inventory/batches/new` | `src/app/dashboard/inventory/batches/new/page.tsx` | Desktop, Tablet, Mobile | Yes (`inventory.adjust`) | Opening stock entry form with automatic PTR calculation and medicine master pre-filling. |
| `/dashboard/inventory/import` | `src/app/dashboard/inventory/import/page.tsx` | Desktop, Tablet, Mobile | Yes (`inventory.manage`) | Smart CSV parser, AI enrichment, PTR preview column, multi-format date parsing. |
| `/dashboard/inventory/quarantine` | `src/app/dashboard/inventory/quarantine/page.tsx` | Desktop, Tablet, Mobile | Yes (`inventory.manage`) | Quarantine dump stock, damaged strip segregation, write-off claims. |
| `/dashboard/inventory/stocktake` | `src/app/dashboard/inventory/stocktake/page.tsx` | Desktop, Tablet, Mobile | Yes (`inventory.adjust`) | Physical stock count audit history and store discrepancy reports. |
| `/dashboard/inventory/stocktake/new` | `src/app/dashboard/inventory/stocktake/new/page.tsx` | Desktop, Tablet, Mobile | Yes (`inventory.adjust`) | Initiate shelf / rack physical inventory count audit session. |
| `/dashboard/inventory/stocktake/[id]` | `src/app/dashboard/inventory/stocktake/[id]/page.tsx` | Desktop, Tablet, Mobile | Yes (`inventory.adjust`) | Physical stock audit count workbench with variance ledger adjustments. |

---

### 2.5 Procurement & Purchases
| Route | Component Path | Viewports Tested | Auth Required | Testing Notes & Status |
| :--- | :--- | :---: | :---: | :--- |
| `/dashboard/purchases` | `src/app/dashboard/purchases/page.tsx` | Desktop, Tablet, Mobile | Yes (`purchases.view`) | Inward GRN purchase invoices, distributor search, payment status, CSV export. |
| `/dashboard/purchases/new` | `src/app/dashboard/purchases/new/page.tsx` | Desktop, Tablet, Mobile | Yes (`purchases.create`) | Post distributor invoice: landed cost, free schemes, batch creation, AP posting. |
| `/dashboard/purchases/[id]` | `src/app/dashboard/purchases/[id]/page.tsx` | Desktop, Tablet, Mobile | Yes (`purchases.view`) | Inward GRN detail view, received batches, GST ITC breakdown. |
| `/dashboard/purchases/orders` | `src/app/dashboard/purchases/orders/page.tsx` | Desktop, Tablet, Mobile | Yes (`purchases.view`) | Outward Purchase Orders (PO) procurement pipeline and fulfillment tracking. |
| `/dashboard/purchases/orders/new` | `src/app/dashboard/purchases/orders/new/page.tsx` | Desktop, Tablet, Mobile | Yes (`purchases.create`) | PO builder: supplier selection, item lines, minimum order quantity rules. |
| `/dashboard/purchases/orders/[id]` | `src/app/dashboard/purchases/orders/[id]/page.tsx` | Desktop, Tablet, Mobile | Yes (`purchases.view`) | PO detail view, supplier acknowledgment, delivery status tracking. |
| `/dashboard/purchases/orders/[id]/print` | `src/app/dashboard/purchases/orders/[id]/print/page.tsx` | Desktop, Tablet, Mobile | Yes (`purchases.view`) | Purchase Order print view ready for PDF transmission to supplier. |
| `/dashboard/purchases/orders/central` | `src/app/dashboard/purchases/orders/central/page.tsx` | Desktop, Tablet, Mobile | Yes (`purchases.create`) | Central purchasing aggregator consolidating replenishment needs across branches. |
| `/dashboard/purchases/reorder` | `src/app/dashboard/purchases/reorder/page.tsx` | Desktop, Tablet, Mobile | Yes (`purchases.view`) | AI Reorder Engine: computes run rates, lead times, safety stocks, and PO generation. |
| `/dashboard/purchases/returns` | `src/app/dashboard/purchases/returns/page.tsx` | Desktop, Tablet, Mobile | Yes (`purchases.view`) | Purchase returns / supplier debit notes ledger. |
| `/dashboard/purchases/returns/new` | `src/app/dashboard/purchases/returns/new/page.tsx` | Desktop, Tablet, Mobile | Yes (`purchases.return`) | Create supplier return debit note for damaged or slow-moving stock. |
| `/dashboard/purchases/returns/[id]` | `src/app/dashboard/purchases/returns/[id]/page.tsx` | Desktop, Tablet, Mobile | Yes (`purchases.view`) | Debit note detail view with credit ledger adjustment status. |
| `/dashboard/purchases/returns/[id]/print` | `src/app/dashboard/purchases/returns/[id]/print/page.tsx` | Desktop, Tablet, Mobile | Yes (`purchases.view`) | Statutory debit note print layout. |
| `/dashboard/purchases/expiry-returns` | `src/app/dashboard/purchases/expiry-returns/page.tsx` | Desktop, Tablet, Mobile | Yes (`purchases.return`) | Expiry claim tracking: supplier return vouchers and replacement credits. |

---

### 2.6 Suppliers & Accounts Payable
| Route | Component Path | Viewports Tested | Auth Required | Testing Notes & Status |
| :--- | :--- | :---: | :---: | :--- |
| `/dashboard/suppliers` | `src/app/dashboard/suppliers/page.tsx` | Desktop, Tablet, Mobile | Yes (`suppliers.view`) | Distributor directory, current outstanding payables, credit days, GSTIN. |
| `/dashboard/suppliers/new` | `src/app/dashboard/suppliers/new/page.tsx` | Desktop, Tablet, Mobile | Yes (`suppliers.manage`) | Add distributor form: DL numbers, GSTIN, payment terms, contact details. |
| `/dashboard/suppliers/[id]` | `src/app/dashboard/suppliers/[id]/page.tsx` | Desktop, Tablet, Mobile | Yes (`suppliers.view`) | Supplier ledger statement: purchase invoices, payments, credit/debit balances. |
| `/dashboard/suppliers/[id]/pay` | `src/app/dashboard/suppliers/[id]/pay/page.tsx` | Desktop, Tablet, Mobile | Yes (`accounting.manage`) | Record payment against supplier invoice: cheque, NEFT/RTGS, UPI, cash. |

---

### 2.7 Customers & Loyalty CRM
| Route | Component Path | Viewports Tested | Auth Required | Testing Notes & Status |
| :--- | :--- | :---: | :---: | :--- |
| `/dashboard/customers` | `src/app/dashboard/customers/page.tsx` | Desktop, Tablet, Mobile | Yes (`customers.view`) | Patient / customer directory, phone search, outstanding credit balance, loyalty points. |
| `/dashboard/customers/new` | `src/app/dashboard/customers/new/page.tsx` | Desktop, Tablet, Mobile | Yes (`customers.manage`) | Create customer / credit account: doctor reference, credit limit, phone. |
| `/dashboard/customers/groups` | `src/app/dashboard/customers/groups/page.tsx` | Desktop, Tablet, Mobile | Yes (`customers.view`) | Patient price categories (Senior Citizen, Hospital Staff, Chronic Care). |
| `/dashboard/customers/[id]/loyalty` | `src/app/dashboard/customers/[id]/loyalty/page.tsx` | Desktop, Tablet, Mobile | Yes (`customers.view`) | Customer loyalty points accrual and POS redemption transaction log. |

---

### 2.8 Statutory Compliance & Drug Control
| Route | Component Path | Viewports Tested | Auth Required | Testing Notes & Status |
| :--- | :--- | :---: | :---: | :--- |
| `/dashboard/compliance` | `src/app/dashboard/compliance/page.tsx` | Desktop, Tablet, Mobile | Yes (`compliance.view`) | Drug inspector audit overview, Rx percentage, schedule verification status. |
| `/dashboard/compliance/schedule-h` | `src/app/dashboard/compliance/schedule-h/page.tsx` | Desktop, Tablet, Mobile | Yes (`compliance.view`) | Schedule H register with prescribing doctor and patient address logging. |
| `/dashboard/compliance/schedule-h1` | `src/app/dashboard/compliance/schedule-h1/page.tsx` | Desktop, Tablet, Mobile | Yes (`compliance.view`) | Statutory Form 35 Schedule H1 register (Antibiotics, 3rd gen cephalosporins). |
| `/dashboard/compliance/narcotics` | `src/app/dashboard/compliance/narcotics/page.tsx` | Desktop, Tablet, Mobile | Yes (`compliance.view`) | NDPS Act register: strict stock-in/stock-out batch balance reconciliation. |
| `/dashboard/compliance/prescriptions` | `src/app/dashboard/compliance/prescriptions/page.tsx` | Desktop, Tablet, Mobile | Yes (`compliance.view`) | Digital prescription storage and verification audit log. |
| `/dashboard/compliance/doctors` | `src/app/dashboard/compliance/doctors/page.tsx` | Desktop, Tablet, Mobile | Yes (`compliance.view`) | Prescribing doctor directory: MCI/State medical council registration numbers. |
| `/dashboard/compliance/[register]/print`| `src/app/dashboard/compliance/[register]/print/page.tsx`| Desktop, Tablet, Mobile | Yes (`compliance.view`) | Regulatory Form 35 print layout formatted for drug inspector inspections. |

---

### 2.9 Accounting, Financial Statements & Ledgers
| Route | Component Path | Viewports Tested | Auth Required | Testing Notes & Status |
| :--- | :--- | :---: | :---: | :--- |
| `/dashboard/accounting` | `src/app/dashboard/accounting/page.tsx` | Desktop, Tablet, Mobile | Yes (`accounting.view`) | Financial overview: Revenue, COGS, Gross Profit, Operating Expenses, Net Margin. |
| `/dashboard/accounting/profit-loss` | `src/app/dashboard/accounting/profit-loss/page.tsx` | Desktop, Tablet, Mobile | Yes (`accounting.view`) | Detailed Trading and Profit & Loss statement with date range filtering. |
| `/dashboard/accounting/balance-sheet` | `src/app/dashboard/accounting/balance-sheet/page.tsx` | Desktop, Tablet, Mobile | Yes (`accounting.view`) | Balance Sheet: Current Assets, Inventory Valuation, Receivables, Liabilities. |
| `/dashboard/accounting/trial-balance` | `src/app/dashboard/accounting/trial-balance/page.tsx` | Desktop, Tablet, Mobile | Yes (`accounting.view`) | Trial balance: Debit / Credit balance audit for all chart of accounts. |
| `/dashboard/accounting/cash-flow` | `src/app/dashboard/accounting/cash-flow/page.tsx` | Desktop, Tablet, Mobile | Yes (`accounting.view`) | Cash flow statement: Operating, Investing, and Financing activities. |
| `/dashboard/accounting/bank-reconciliation`| `src/app/dashboard/accounting/bank-reconciliation/page.tsx`| Desktop, Tablet, Mobile | Yes (`accounting.view`) | Bank statement reconciliation against recorded receipts and payments. |
| `/dashboard/accounting/outstanding` | `src/app/dashboard/accounting/outstanding/page.tsx` | Desktop, Tablet, Mobile | Yes (`accounting.view`) | Accounts receivable aging report (0-30d, 31-60d, 61-90d, 90d+). |
| `/dashboard/accounting/receipts` | `src/app/dashboard/accounting/receipts/page.tsx` | Desktop, Tablet, Mobile | Yes (`accounting.view`) | Customer payment receipts ledger and counter settlements. |

---

### 2.10 GST Filings & Tax Compliance
| Route | Component Path | Viewports Tested | Auth Required | Testing Notes & Status |
| :--- | :--- | :---: | :---: | :--- |
| `/dashboard/gst` | `src/app/dashboard/gst/page.tsx` | Desktop, Tablet, Mobile | Yes (`gst.view`) | GST dashboard: Output Tax, Input Tax Credit (ITC), Net Tax Payable. |
| `/dashboard/gst/returns` | `src/app/dashboard/gst/returns/page.tsx` | Desktop, Tablet, Mobile | Yes (`gst.view`) | GSTR-1 and GSTR-3B monthly filing computation tables. |
| `/dashboard/gst/inward` | `src/app/dashboard/gst/inward/page.tsx` | Desktop, Tablet, Mobile | Yes (`gst.view`) | Inward supplies ITC register grouped by supplier GSTIN and tax slabs. |
| `/dashboard/gst/outward` | `src/app/dashboard/gst/outward/page.tsx` | Desktop, Tablet, Mobile | Yes (`gst.view`) | Outward sales tax register (B2B registered vs B2C retail consumers). |
| `/dashboard/gst/reconciliation` | `src/app/dashboard/gst/reconciliation/page.tsx` | Desktop, Tablet, Mobile | Yes (`gst.view`) | GSTR-2B purchase matching workbench: highlights missing supplier invoices. |
| `/dashboard/gst/e-invoice` | `src/app/dashboard/gst/e-invoice/page.tsx` | Desktop, Tablet, Mobile | Yes (`gst.view`) | NIC portal B2B electronic invoice IRN generation and signed QR codes. |
| `/dashboard/gst/rates` | `src/app/dashboard/gst/rates/page.tsx` | Desktop, Tablet, Mobile | Yes (`gst.view`) | HSN codes and GST slab matrix (0%, 5%, 12%, 18%, 28%). |

---

### 2.11 Reports & Business Intelligence
| Route | Component Path | Viewports Tested | Auth Required | Testing Notes & Status |
| :--- | :--- | :---: | :---: | :--- |
| `/dashboard/reports` | `src/app/dashboard/reports/page.tsx` | Desktop, Tablet, Mobile | Yes (`reports.view`) | Analytics center: sales velocity, fast/slow moving items, top margins. |
| `/dashboard/reports/inventory` | `src/app/dashboard/reports/inventory/page.tsx` | Desktop, Tablet, Mobile | Yes (`reports.view`) | Stock valuation at cost vs retail, stock turn ratio, non-moving items. |
| `/dashboard/reports/expiry` | `src/app/dashboard/reports/expiry/page.tsx` | Desktop, Tablet, Mobile | Yes (`reports.view`) | Near-expiry capital at risk categorized by manufacturer. |
| `/dashboard/reports/expiry-redistribution` | `src/app/dashboard/reports/expiry-redistribution/page.tsx` | Desktop, Tablet, Mobile | Yes (`reports.view`) | Inter-store expiry redistribution recommendation algorithm. |
| `/dashboard/reports/commissions` | `src/app/dashboard/reports/commissions/page.tsx` | Desktop, Tablet, Mobile | Yes (`reports.view`) | Doctor referral and staff incentive commission tracking report. |
| `/dashboard/reports/chain` | `src/app/dashboard/reports/chain/page.tsx` | Desktop, Tablet, Mobile | Yes (`reports.view`) | Consolidated multi-branch retail network performance dashboard. |

---

### 2.12 Settings & Administration
| Route | Component Path | Viewports Tested | Auth Required | Testing Notes & Status |
| :--- | :--- | :---: | :---: | :--- |
| `/dashboard/settings` | `src/app/dashboard/settings/page.tsx` | Desktop, Tablet, Mobile | Yes (`settings.view`) | Pharmacy settings hub: general options, print templates, invoice series. |
| `/dashboard/settings/profile` | `src/app/dashboard/settings/profile/page.tsx` | Desktop, Tablet, Mobile | Yes (`settings.manage`) | Pharmacy legal name, address, DL numbers (20B, 21B), GSTIN. |
| `/dashboard/settings/stores` | `src/app/dashboard/settings/stores/page.tsx` | Desktop, Tablet, Mobile | Yes (`settings.manage`) | Multi-store branch list with active store switcher controls. |
| `/dashboard/settings/stores/new` | `src/app/dashboard/settings/stores/new/page.tsx` | Desktop, Tablet, Mobile | Yes (`settings.manage`) | Add branch form: branch code, state code, local drug license, GSTIN. |
| `/dashboard/settings/stores/[id]` | `src/app/dashboard/settings/stores/[id]/page.tsx` | Desktop, Tablet, Mobile | Yes (`settings.manage`) | Branch configuration, default pricing, staff assignments. |
| `/dashboard/settings/users` | `src/app/dashboard/settings/users/page.tsx` | Desktop, Tablet, Mobile | Yes (`users.manage`) | Staff user accounts, assigned roles, pharmacist registration numbers. |
| `/dashboard/settings/roles` | `src/app/dashboard/settings/roles/page.tsx` | Desktop, Tablet, Mobile | Yes (`roles.manage`) | RBAC role editor and granular permission matrix. |
| `/dashboard/settings/racks` | `src/app/dashboard/settings/racks/page.tsx` | Desktop, Tablet, Mobile | Yes (`settings.manage`) | Pharmacy physical layout organizer: Racks, Shelves, Bin numbers. |
| `/dashboard/settings/schemes` | `src/app/dashboard/settings/schemes/page.tsx` | Desktop, Tablet, Mobile | Yes (`settings.manage`) | Promotional deal master (e.g. 10+1 free, flat 10% off, volume rebates). |
| `/dashboard/settings/schemes/new` | `src/app/dashboard/settings/schemes/new/page.tsx` | Desktop, Tablet, Mobile | Yes (`settings.manage`) | Configure new promotional trade scheme with date ranges. |
| `/dashboard/settings/loyalty` | `src/app/dashboard/settings/loyalty/page.tsx` | Desktop, Tablet, Mobile | Yes (`settings.manage`) | Loyalty point accrual rules (e.g. ₹100 spent = 1 point) and value. |
| `/dashboard/settings/api-keys` | `src/app/dashboard/settings/api-keys/page.tsx` | Desktop, Tablet, Mobile | Yes (`settings.manage`) | External API key generator with hashed token storage. |
| `/dashboard/settings/audit` | `src/app/dashboard/settings/audit/page.tsx` | Desktop, Tablet, Mobile | Yes (`audit.view`) | Immutable audit trail viewer recording all stock adjustments and mutations. |
| `/dashboard/settings/sms` | `src/app/dashboard/settings/sms/page.tsx` | Desktop, Tablet, Mobile | Yes (`settings.manage`) | SMS gateway integration (DLT templates, credentials). |
| `/dashboard/settings/whatsapp` | `src/app/dashboard/settings/whatsapp/page.tsx` | Desktop, Tablet, Mobile | Yes (`settings.manage`) | WhatsApp Cloud API configuration and webhook verification token. |
| `/dashboard/settings/medical-reps` | `src/app/dashboard/settings/medical-reps/page.tsx` | Desktop, Tablet, Mobile | Yes (`settings.view`) | Medical representative visit scheduler and company directory. |

---

### 2.13 Omnichannel, Orders & Migration
| Route | Component Path | Viewports Tested | Auth Required | Testing Notes & Status |
| :--- | :--- | :---: | :---: | :--- |
| `/dashboard/orders` | `src/app/dashboard/orders/page.tsx` | Desktop, Tablet, Mobile | Yes (`orders.view`) | Inbound online/app orders intake, packing, dispatch status. |
| `/dashboard/orders/[id]` | `src/app/dashboard/orders/[id]/page.tsx` | Desktop, Tablet, Mobile | Yes (`orders.view`) | Order fulfillment workbench with batch reservation and invoice conversion. |
| `/dashboard/whatsapp` | `src/app/dashboard/whatsapp/page.tsx` | Desktop, Tablet, Mobile | Yes (`marketing.manage`) | WhatsApp broadcast messaging campaign launcher. |
| `/dashboard/whatsapp/templates` | `src/app/dashboard/whatsapp/templates/page.tsx` | Desktop, Tablet, Mobile | Yes (`marketing.manage`) | WhatsApp pre-approved HSM template manager. |
| `/dashboard/reminders` | `src/app/dashboard/reminders/page.tsx` | Desktop, Tablet, Mobile | Yes (`crm.manage`) | Chronic disease medication refill reminders automated queue. |
| `/dashboard/import` | `src/app/dashboard/import/page.tsx` | Desktop, Tablet, Mobile | Yes (`inventory.manage`) | Legacy ERP bulk migration jobs (Marg, Vyapar, GoFrugal). |
| `/dashboard/import/new` | `src/app/dashboard/import/new/page.tsx` | Desktop, Tablet, Mobile | Yes (`inventory.manage`) | Step-by-step import mapping wizard with presets. |
| `/dashboard/import/[jobId]` | `src/app/dashboard/import/[jobId]/page.tsx` | Desktop, Tablet, Mobile | Yes (`inventory.manage`) | Staged rows verification and commit execution workbench. |

