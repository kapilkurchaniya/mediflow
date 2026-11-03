# MediFlow User Manual

**For pharmacy owners, managers, pharmacists, cashiers, purchase staff and accountants.**

This manual teaches you how to run your pharmacy in MediFlow: how to bill a customer, add medicines and stock, buy from suppliers, keep your legal registers, file GST and read your reports. You don't need any technical knowledge.

> **Testing the app instead of using it?** Use [MANUAL_TESTING.md](MANUAL_TESTING.md). This file is the "how do I use it" guide.

---

## Contents

1. [What MediFlow does](#1-what-mediflow-does)
   - [1.1 Features and workflows at a glance](#11-features-and-workflows-at-a-glance)
2. [Getting started](#2-getting-started)
3. [Finding your way around](#3-finding-your-way-around)
4. [Who can do what (roles)](#4-who-can-do-what-roles)
5. [Selling: the billing counter](#5-selling-the-billing-counter)
6. [Medicines and stock](#6-medicines-and-stock)
7. [Buying from suppliers](#7-buying-from-suppliers)
8. [Customers, family groups and loyalty](#8-customers-family-groups-and-loyalty)
9. [Prescriptions and legal registers](#9-prescriptions-and-legal-registers)
10. [Orders, promises and reminders](#10-orders-promises-and-reminders)
11. [WhatsApp and SMS](#11-whatsapp-and-sms)
12. [Reports](#12-reports)
13. [Accounts and money](#13-accounts-and-money)
14. [GST](#14-gst)
15. [Settings](#15-settings)
16. [The AI assistant](#16-the-ai-assistant)
17. [Keyboard shortcuts](#17-keyboard-shortcuts)
18. [Common questions and error messages](#18-common-questions-and-error-messages)
19. [Platform architecture & future scope](#19-platform-architecture--future-scope)
20. [Glossary](#20-glossary)

---

## 1. What MediFlow does

MediFlow connects everything that happens in a pharmacy, so you type each thing **once**:

```
 Supplier bill  ──►  Stock (by batch & expiry)  ──►  Customer bill
      │                     │                              │
      ▼                     ▼                              ▼
 Money you owe       Expiry & low-stock alerts      Money you earned
      │                                                    │
      └───────────►  Accounts  ◄───────────────────────────┘
                        │
        GST returns · Schedule H/H1/X registers · Reports
```

When you bill a customer, MediFlow automatically:
- reduces the stock of the exact **batch** you sold,
- posts the accounting entries (so your books always balance),
- prepares the GST invoice record,
- writes the legal register entry for Schedule H/H1/X medicines,
- gives loyalty points to the customer, if you run a rewards programme.

**Good to know:** all prices include GST (like the MRP on the pack). MediFlow works backwards to show you the taxable value and the CGST/SGST split.

### 1.1 Features and workflows at a glance

Here is a clear summary of all the core features and flows MediFlow provides to run your pharmacy:

#### 1. Point of Sale (POS) & Counter Billing Flow
- **High-speed billing:** Search medicines instantly by brand name, generic molecule (e.g. *Paracetamol*), or by scanning pack barcodes with a handheld hardware scanner.
- **Auto-FEFO batch allocation:** MediFlow automatically picks the batch expiring soonest so you never sell older stock accidentally. If a batch doesn't have enough units, it slices stock across multiple batches seamlessly.
- **Loose tablet cutting (Unit conversions):** Sell individual tablets or capsules out of strips or boxes. Prices and stock update automatically without rounding errors.
- **Held / Parked bills (`F6` / `F7`):** Park an active customer's cart when they step away to fetch cash or call their doctor. Serve the next patient in line, and resume the parked cart later with live stock revalidation.
- **Split-tender & credit sales (`F8`):** Split a single payment across Cash, UPI, and Card. Allow registered customers to take medicines on credit within their credit limit, with automatic change calculation for cash overpayment.
- **Salt / Substitute finder (`F9`):** When a prescribed brand is out of stock, press `F9` to instantly see all available in-stock alternatives sharing the exact same active pharmaceutical molecule.
- **Prescription & Schedule H/H1/X compliance:** The counter alerts you when prescription drugs are in the cart and mandates entering the prescribing doctor and patient details before completing the sale.
- **Instant invoice printing:** Print 2-inch or 3-inch thermal receipts or full A4/A5 tax invoices with HSN summaries.
- **Offline POS synchronization infrastructure (Phase 4):** Counter terminals authenticate with secure device tokens and pre-reserve consecutive invoice number blocks. Sales recorded while offline are automatically queued and synced back to cloud inventory and accounting once reconnected.
- **Same-day bill cancellation (`Alt + C`):** Void bills made by mistake on the same business day with automated batch stock restoration, reversing journal entries, and GSTR-1 voiding.
- **Sale returns & GST credit notes (`Alt + R`):** Process customer medicine returns (full or partial strips/loose tablets), restore inventory to exact batches, automatically quarantine expired batches (`hold`), post balanced credit note journals, and issue GST Credit Notes (`CN/YY-YY/000000`).

#### 2. Inventory & Batch Management Flow
- **Batch & expiry tracking:** Full visibility into every batch, its manufacturer, manufacturing date, expiry date, purchase rate, and current stock on shelf.
- **Rack & shelf locations:** Assign medicines to specific physical racks (e.g. *Rack A-12*); rack locations appear directly on the POS search dropdown for instant retrieval.
- **Opening stock entry:** Rapidly add your starting inventory with batch numbers, MRP, and landed cost.
- **Expiry & low-stock monitoring:** Built-in dashboard alerts identify batches expiring within 30, 60, or 90 days and medicines falling below reorder thresholds.
- **Bulk spreadsheet import:** Import thousands of medicines and batch records from Excel or CSV files in minutes.

#### 3. Purchasing & Supplier Operations Flow
- **Supplier directory & ledgers:** Maintain distributor profiles, GSTINs, drug licences, payment terms, and live account balances.
- **Purchase Orders (PO):** Generate formal purchase orders for suppliers, print or export them to PDF, and convert them directly into Goods Received Notes.
- **Goods Received Notes (GRN / Supplier Bills):** Record incoming supplier shipments with batch numbers, expiry dates, trade rates, and tax rates.
- **Pharma purchase schemes:** Automatically compute deals like *10+1 free*, Trade Discounts (TD%), Cash Discounts (CD%), and effective landed cost per tablet.
- **Supplier debit notes:** Issue debit notes for damaged stock, expired goods, or rate differences with automated supplier ledger debits.
- **Supplier payments:** Record bank, UPI, cheque, or cash payments against distributor bills and keep a running supplier ledger.

#### 4. Prescriptions & Statutory Legal Registers Flow
- **Schedule H, H1 & X registers:** Auto-generate official dispensing registers as required by Indian Drug & Cosmetics Rules.
- **Doctor master:** Save prescribing doctors with their state Medical Council Registration numbers and hospitals.
- **Prescription tracking:** Link dispensing records to prescription slip numbers and doctor details.
- **Inspection-ready printouts:** Filter and print Form 35 and Schedule H1 registers by date range ready for drug inspector audits.

#### 5. Customer Care, Loyalty & CRM Flow
- **Customer directory & credit limits:** Store patient phone numbers, addresses, outstanding balances, and credit limits.
- **Quick customer creation (`F4`):** Add a new customer directly from the billing counter in 3 seconds without losing your current bill.
- **Family health groups:** Group family members together under one head-of-household to track shared credit and prescriptions.
- **Customer loyalty rewards:** Award reward points for every purchase to encourage repeat pharmacy visits.

#### 6. Patient Care, Orders & Reminders Flow
- **Promise orders:** When a customer requests a medicine that is currently out of stock, record a promise order. When the medicine arrives via supplier GRN, notify the customer.
- **Omnichannel order desk:** Receive and manage phone, prescription-photo, and online customer orders for counter pickup or home delivery.
- **Chronic refill reminders:** Track regular patients taking daily medications (hypertension, diabetes, thyroid) and send refill reminders before they run out.

#### 7. Accounting & Financial Ledgers Flow
- **Automated double-entry bookkeeping:** Every sale, purchase, customer receipt, and supplier payment automatically writes debit and credit journal entries.
- **Day book:** Review every transaction recorded on any day with complete debit/credit breakdowns.
- **Customer receipts:** Accept pending balance payments from credit customers and issue official payment receipts.
- **Trial Balance, P&L & Balance Sheet:** Real-time financial reports showing gross profit, net profit, assets, liabilities, and ledger balances.

#### 8. GST & Tax Compliance Flow
- **Pharma GST 2.0:** Full support for 0%, 5%, 12%, and 18% GST rates, including the 5% medicine GST transition.
- **Intrastate vs. Interstate tax:** Automatically splits taxes into CGST + SGST for local sales, or IGST for out-of-state business customers.
- **GSTR-1 tax summary:** Monthly sales summaries grouped into B2B, B2C Large, B2C Small, and HSN-wise breakdowns for GST filing.
- **Input Tax Credit (ITC):** Track all GST paid on supplier purchases to offset against your monthly output GST liability.

#### 9. Staff Roles, Security & Auditing Flow
- **7 Pharmacy roles:** Assign staff members exact roles (*Owner, Manager, Pharmacist, Cashier, Purchase Manager, Accountant, Auditor*) so they only see what their job allows.
- **Manager discount overrides:** Limit how much discount cashiers can give; require a manager's permission to exceed the pharmacy discount limit.
- **Audit logs:** Every sensitive change (price edits, manual FEFO overrides, stock adjustments, voided bills) is permanently logged with timestamp and staff name.

#### 10. Pharmacy AI Assistant Flow
- **Smart natural language queries:** Ask questions like *"Which medicines are expiring this month?"* or *"What were our top 5 selling products yesterday?"* directly in natural language.

---

## 2. Getting started

### 2.1 Signing in

1. Open MediFlow in your browser.
2. Type your **Email address** and **Password**, then press **Sign in**.
3. You land on the **Overview** (dashboard).

If the email or password is wrong you'll see *Invalid email or password*. If you aren't signed in and open any page, MediFlow sends you to the sign-in screen first and brings you back afterwards.

**Too many wrong passwords:** after 10 wrong attempts for the same email, sign-in is paused for **15 minutes** (even with the right password) and you'll see *Too many attempts, try again in 15 minutes*. This protects your account from guessing. A successful sign-in starts the count again. If you still can't sign in, ask your owner.

**Which branch you start in:** MediFlow opens the branch you used last time, if you're still allowed to use it; otherwise the first branch you have access to. If your access has been suspended or you have no branch, you'll be told to ask your administrator.

To leave, press the **Sign out** icon at the bottom of the left menu, next to your name.

### 2.1a Changing your password

Click **your name** at the bottom of the left menu to open **My profile**. Enter your **Current password**, then the **New password** twice (at least 8 characters, different from the current one) and press **Change password**. You stay signed in here; **every other device you were signed in on is signed out**. Your name, email and phone are shown above the form.

### 2.1b Joining your team through an invitation

Your owner sends you a link that looks like `…/invite/…`. Open it (you don't need to be signed in), type **Your name** and choose a **password** (8 or more characters), then press **Join and sign in**. If you already have a MediFlow account with that email, you enter your **existing password** instead. You land on the dashboard with the role your owner chose. A link works **once** and **expires after 7 days**; if it says the link is invalid or has expired, ask the owner for a new one.

### 2.2 Registering a new pharmacy

On the sign-in page choose **Register**. Enter your pharmacy and personal details and choose an email and password. You become the **Owner** of the new pharmacy and can use every feature. (If the email is already registered, you'll be told.)

### 2.3 First-time setup checklist

Do these once, in this order.

| # | Step | Where | Chapter |
|---|---|---|---|
| 1 | Enter your pharmacy details: name, drug licence number, GSTIN, address, **bill prefix** | Settings | [15.1](#151-your-pharmacy-profile) |
| 2 | Add your medicines (or import them) | Inventory → Item master | [6.2](#62-adding-a-medicine) |
| 3 | Add the stock you already have | Inventory → Batches & stock → Opening stock, or Bulk import | [6.5](#65-adding-the-stock-you-already-have) / [6.6](#66-bulk-import-from-a-spreadsheet) |
| 4 | Add your suppliers | Directory → Suppliers | [7.1](#71-adding-a-supplier) |
| 5 | Add your regular customers | Directory → Customers | [8.1](#81-adding-a-customer) |
| 6 | (Optional) Add racks, doctors, medical reps, schemes, loyalty rules | Settings / Compliance | chapters 6, 8, 9 |
| 7 | Make a test bill and check the printed invoice | New bill | [5.1](#51-making-a-bill) |

---

## 3. Finding your way around

### 3.1 The screen

```
┌──────────────┬───────────────────────────────────────────────────────┐
│  MediFlow    │  Home › Sales & invoices          Search or jump to… ⌘K │
│  ┌────────┐  │                                    ⌨ ?   🔔   [New bill] │
│  │Store   │  ├───────────────────────────────────────────────────────┤
│  │ name   │  │                                                       │
│  └────────┘  │                 The page you are working on           │
│  Overview    │                                                       │
│  New bill    │                                                       │
│  Operations  │                                                       │
│  Compliance  │                                                       │
│  Inventory   │                                                       │
│  GST & Tax   │                                                       │
│  Finance     │                                                       │
│  Comms       │                                                       │
│  Directory   │                                                       │
│  Settings    │                                                       │
│  ────────    │                                                       │
│  Your name ⏻ │                                                       │
└──────────────┴───────────────────────────────────────────────────────┘
```

**Left menu (sidebar)**
- Your pharmacy's name is at the top. Click the small arrow (or press **Ctrl + B**) to shrink or expand the menu.
- Sections: **Operations**, **Compliance (Rx)**, **Inventory**, **GST & Tax**, **Finance**, **Comms & Alerts**, **Directory**, and **Settings** at the bottom.
- You only see the pages your role is allowed to use (see [chapter 4](#4-who-can-do-what-roles)). A cashier sees a short menu; the owner sees everything.
- On a phone or narrow window, open the menu with the ☰ button at the top left.

**Top bar**
- **Breadcrumbs** (e.g. *Home › Settings › Racks*) show where you are.
- **Branch / Warehouse Switcher (Ctrl + Shift + S)**: Displays the active branch name, store code, and operating kind (`Retail` vs `Warehouse`). Click or press **Ctrl + Shift + S** to quickly switch branches with instant search.
- **Search or jump to… (⌘K / Ctrl + K)** opens the command palette (see below).
- **⌨ icon** (or press **?**) shows all keyboard shortcuts.
- **🔔 bell** shows alerts: *Near Expiry Alert*, *Low Stock Warning*, and a reminder that the day's sales register is ready to reconcile. *View all inventory alerts* takes you to the stock pages.
- **New bill** button opens the billing counter from anywhere.
- An **Offline Mode** badge appears if your internet drops. (Billing offline is not available yet; see [chapter 19](#19-not-available-yet).)

### 3.2 The command palette (fastest way to get anywhere)

Press **Ctrl + K** (Mac: ⌘K). Start typing what you want, for example *purchase*, *customer* or *expiry*, then press **Enter**.

You'll find every page you may open plus quick actions: **Record purchase**, **Add customer**, **Near-expiry batches**, **Toggle sidebar**, **Keyboard shortcuts**, **Ask MediFlow AI**. Press **Esc** to close it.

### 3.3 Date filters

Report and list pages have a date filter with these quick choices: **Today, Yesterday, Last 7 days, Last 30 days, This month, Last month, This quarter, This year, All time**, or pick your own *From* and *To* dates.

### 3.4 Searching and exporting

- Most lists have a search box at the top (by name, phone, invoice number and so on). Type and the list narrows as you type.
- Lists of sales, purchases and batches have an **Export** button that downloads a spreadsheet (CSV). Only the owner, manager and accountant may export; for others the export is refused.

### 3.5 "You don't have access to this page"

If you open a page your role can't use, you'll see this message with a **Back to dashboard** button. Nothing is broken: ask your owner to change your role if you need the page.

---

## 4. Who can do what (roles)

Every staff login has a **role**. A role decides which pages you see and which actions you can do. This keeps mistakes down, hides profit figures from counter staff, and lets the owner control who can give discounts.

| Role | Typical person | What they can do |
|---|---|---|
| **Owner** | Pharmacy owner | **Everything**, including Settings and the Audit log. Only the owner opens *Settings* (profile, WhatsApp, SMS, API keys). |
| **Store Manager** | Branch manager | Everything except Settings, user/store management, API keys and all-store reports. Can approve large discounts and export data. |
| **Pharmacist** | Registered pharmacist | Billing, medicines, racks, customers, prescriptions and doctors, WhatsApp and reminders, AI assistant, view sales and stock. |
| **Cashier** | Counter staff | Billing, view stock, customers (add and view), WhatsApp and reminders. Cannot see accounts, GST, purchases or reports. |
| **Purchase Manager** | Buyer | Suppliers, purchases, medicines, racks, trade schemes, reports, AI assistant, view stock and legal registers. No billing. |
| **Accountant** | Accounts / CA | Accounting, **receipts**, GST, reports, view sales and purchases, export data. No billing. |
| **Auditor** | Inspector / external CA | **View only**: reports, accounting, GST, sales, purchases, registers, **audit log**. Cannot change or export anything. |

Examples of what a role does **not** see:
- A cashier won't see *Accounting*, *GST & Tax*, *Purchases* or *Reports* in the menu.
- Only the owner and manager can enter **opening stock** or use **Bulk import**.
- Discounts above your pharmacy's limit need owner or manager approval.

> The **owner** creates staff logins, picks each person's role and limits them to branches in **Directory → Staff & access** (see [15.6](#156-staff--access-invite-and-manage-your-team)). The list of what each role may do is under **Directory → Roles & permissions**.

---

## 5. Selling: the billing counter

Open it with **New bill** (left menu, top-bar button, or **F2** on the keyboard).

### 5.1 Making a bill

The billing screen has two halves:

- **Left:** the search box and the bill (cart) table.
- **Right:** customer, doctor details, bill summary and payment.

**Step by step**

1. **Find the medicine.** Click the search box (or press **F3**, or **/**) and type the brand name, the salt/composition (e.g. *Paracetamol*) or scan the barcode.
2. A list appears showing, for each batch: **Medicine & Generic**, **Batch / Expiry**, **Stock**, **Rate**. Medicines with no stock show an **Out of Stock** badge (see [5.4](#54-when-a-medicine-is-out-of-stock)).
3. **Choose the batch.** Click the row's add button, or use **↑ / ↓** and **Enter**. Expired batches are never offered. A barcode scanner adds the item automatically.
4. The item appears in the bill table with columns **Item & Batch**, **Qty**, **Rate**, **Disc %**, **Total**. Change **Qty** as needed (you can't bill more than the stock on hand).
5. (Optional) Type a **Disc %** on a line to give a discount on that item.
6. **Customer:** leave **Walk-in Customer**, or pick a regular customer from the list. For someone new, press **Quick Add (F4)**, enter *Patient / Customer Name* and *Mobile Phone (for WhatsApp bill)*, and save. When you pick a customer who has reward points, their points and rupee value are shown.
7. **Prescription medicines:** if the bill has a prescription medicine, the doctor box turns amber. See [5.3](#53-prescription-medicines-schedule-h-h1-x).
8. **Payment Method:** choose **Cash**, **UPI** or **Card**, or press **F8** to open the split-tender payment panel to mix modes or put an unpaid balance on customer credit.
9. Check the summary: **Subtotal (Gross)**, **Discount**, **Taxable Value**, the GST split, **Round Off** (to the nearest rupee) and **Net Payable**.
10. Press **Complete & Print (₹ amount)** (or press **F10** / **End**).

When it succeeds, the invoice opens and can be printed. To start the next bill press **F2** (or **Clear (F2)**; you'll be asked to confirm because it empties the current bill).

**Audio:** a small beep confirms each scan and a chime confirms a completed bill. Use the speaker icon at the top to mute it.

### 5.1a Loose tablet & strip cutting

When a customer wants individual tablets instead of a full strip:
- In the cart, the quantity column allows entering loose tablets from a strip (e.g., 3 tablets from a 10-tablet strip).
- The system calculates the unit price proportionally ($\text{Strip Price} / 10$) without rounding errors.
- The invoice displays the exact units billed (e.g. `3 Tabs @ ₹10.00 = ₹30.00`), and your batch inventory is deducted by exactly 3 tablets.

### 5.1b Split-tender payments & customer credit ("Khata")

Press **F8** on the billing screen to open the payment modal:
- **Split Payment:** A customer can pay partially in Cash (e.g., ₹200) and the rest via UPI (e.g., ₹300).
- **Cash Overpayment & Change Due:** If a customer hands you ₹1,000 cash for an ₹850 bill, type ₹1,000 in Cash. MediFlow displays **Change Due: ₹150** and posts the net ₹850 to your Cash on Hand ledger.
- **Customer Credit (Udhaar / Khata):** Any remaining balance on a bill is placed on the customer's account. Selling on credit requires:
  1. Selecting an identified customer (not a walk-in).
  2. Having the `customer.credit` staff permission.
  3. The customer having an approved credit limit with enough available balance.
- Credit sales post directly to your double-entry Accounts Receivable ledger and appear in the customer's outstanding balance. Customers can settle their account later via **Accounting → Receipts**.

### 5.1c Parking and resuming bills (Hold / Recall)

When customers step away to fetch cash from an ATM or consult their doctor, cashiers can park the current transaction to immediately serve the next patient in line:
- **Hold Bill (F6):** Press **F6** or click **Hold (F6)** at the top of the POS screen. You can optionally add a note (e.g., "Customer went to ATM", "Awaiting prescription verification"). The cart, customer, prescriber details, and packaging conversions are safely stored as a held bill without deducting stock or allocating an invoice number.
- **Recall / Resume (F7):** Press **F7** or click **Parked ({count}) [F7]** to open the parked bills queue.
  - **Live Inventory Revalidation:** When resuming a bill, MediFlow instantly re-verifies batch stock and expiry against live inventory. If another counter sold the remaining stock in the meantime, or if a batch expired while parked, an inventory warning alert is displayed with full shortage details.
  - **Aged Bills Warning:** Parked bills older than 24 hours display a prominent **`⚠️ > 24h`** badge, alerting cashiers to verify patient intention before finalizing.
  - **Discarding Stale Bills:** If a customer never returns, click the **Discard** trash icon to cancel the parked bill and clear the queue. An audit log is automatically recorded.
  - **Atomic Checkout Cleanup:** When a resumed bill is finalized at checkout, the parked record is automatically removed from the queue and a completed, gap-free tax invoice is generated.

### 5.1d Automatic FEFO (First-Expiry, First-Out) batch allocation

To protect your pharmacy from expired inventory losses and speed up checkout:
- **Automatic Selection:** When you scan a barcode or press **Enter** on a medicine search result, MediFlow automatically selects the batch expiring soonest (`expiry_date > today`, active status) that has stock on hand.
- **Visual FEFO Badge:** In the search dropdown, the earliest-expiring batch is highlighted with a green **`⚡ Auto-FEFO`** badge. Later-expiring batches are tagged with a neutral badge.
- **Multi-Batch Slicing:** If the soonest batch only has 4 tablets in stock but the customer needs 10, MediFlow automatically allocates 4 tablets from the first batch and slices the remaining 6 tablets from the next earliest batch. The cart displays a breakdown badge showing the multi-batch allocation.
- **Audited Manual Overrides:** If a customer or doctor specifically insists on a newer batch, the cashier can manually click and select that batch. To prevent stock dumping, MediFlow records an immutable **`fefo_override`** audit event noting the selected batch and the earlier-expiring batches that were bypassed. Store owners and auditors can review all overrides in **Settings → Audit log**.

### 5.2 What MediFlow does for you when you complete a bill

- Takes the quantity out of the **exact batch** sold (so stock is always right).
- Numbers the invoice like **INV/26-27/000001**: your prefix, the financial year (1 April–31 March), and a running number with no gaps. The number is at most 16 characters, as GST law requires.
- Records the accounts entries, the GST record, and (for scheduled drugs) the register entry.
- Gives loyalty points if the customer is in your rewards programme.
- Charges **IGST instead of CGST + SGST** when you bill a business customer (one with a GSTIN) from another state. Ordinary customers are always billed CGST + SGST.
- If the customer has a phone number, queues a **WhatsApp receipt** that goes out shortly after, so the bill itself never waits.

If something goes wrong in the optional steps (such as the GST record or loyalty points), **your bill is still saved**.

### 5.3 Prescription medicines (Schedule H, H1, X)

When a medicine in the bill is marked **Schedule H, H1, X or narcotic**, the right-hand panel asks for prescription details. A warning explains what is needed:

| Medicine type | You must enter |
|---|---|
| **Schedule H** (prescription only) | **Doctor name** (type it or pick from the doctor registry) |
| **Schedule H1 / X** (stricter) | Doctor name **and Medical Council registration number** (e.g. *MCI-12345*), plus the **Rx slip / ref no**, **patient name**, **age & gender** and the **patient's full address** |

If something is missing, the bill won't complete and you'll see a message such as *Doctor's name is mandatory for Schedule H / Prescription (Rx) medicines in this bill.*

After the sale, an entry is written automatically in the legal register (see [chapter 9](#9-prescriptions-and-legal-registers)). You can optionally pick a **Medical Rep / Consultant** on the bill if you pay commission (see [8.5](#85-medical-representatives-and-commission)).

### 5.4 When a medicine is out of stock

Two helpers sit on the search result:

- **Find other brands with this molecule (substitutes).** Opens a window listing in-stock alternatives with the same composition. If there are none it says *No alternate brands currently in stock*.
- **Record patient demand (promise order).** Opens a short form: **Patient / Customer Name**, **Mobile Number**, **Quantity Needed**, **Urgency / Instructions (Optional)**. It saves a request you can follow up (see [10.2](#102-promise-orders)).

### 5.5 Discounts

- **Per line:** the **Disc %** box.
- Your owner can set a **maximum discount** for the shop. Staff who try to go above it see a message like *Discounts above 10% need a manager's approval*. Only the owner and manager can exceed it.
- A discount can't be negative or above 100%.

### 5.6 Finding and printing invoices later

Open **Operations → Sales & invoices**.

- Search by **invoice number** or **customer**.
- The table shows **Invoice**, **Customer**, **Prescribed by**, **Amount**, **Status**, **Actions**.
- **View Invoice Details** shows every billed medicine with batch, expiry, taxable value and total.
- **Print Thermal 80mm Slip** opens a print-ready slip for a receipt printer. Use your browser's print command.
- Use **Export** to download the list (owner, manager, accountant).

### 5.7 Cancelling a bill (Same-day cancellation)

When a customer changes their mind before leaving the pharmacy, or when an accidental entry error is identified immediately after completing a bill:

- **Where to cancel:** Open the invoice under **Operations → Sales & invoices** (or press **Alt + M** from the counter and click the bill).
- **Staff permissions:** Only staff with the **`sale.cancel`** permission (**Owner** or **Store Manager**) can cancel a bill. Cashiers cannot void bills without manager oversight.
- **Same-day rule:** Under Indian Pharma retail and GST compliance rules, bill cancellations are strictly limited to the **same business day** (before midnight IST, `Asia/Kolkata`). For past transactions, please issue a **Sale Return & Credit Note** instead.
- **No prior returns:** A bill that already has partial returns cannot be cancelled directly; issue a credit note for the remaining items.
- **Mandatory reason:** You must type an explicit reason for cancellation (minimum 3 characters) for statutory audit compliance.
- **Dual input ergonomics:**
  - **Mouse:** Click the red **Cancel Bill** button, review the reversal summary, enter the reason, and click **Confirm Cancellation**.
  - **Keyboard:** Press **Alt + C** on the invoice page to open the cancellation modal, type your reason, press **Enter** to confirm, or **Esc** to dismiss.

#### What MediFlow does automatically when a bill is cancelled:
1. **Batch Stock Restored:** Medicine units are immediately added back into the **exact batches** originally sold with an immutable, traceable **`sale_return`** movement (`refType: "sale_cancel"`).
2. **Double-Entry Journal Reversal:** MediFlow automatically posts a reversing Journal Voucher (`JV`) mirroring the original lines (original debits become credits, and credits become debits). This guarantees an exact 0-paise balance with zero rounding drift. Any unpaid customer credit is removed from their outstanding balance.
3. **GST Document Voided:** The outward tax invoice in your GSTR-1 register is marked **`cancelled`**. In compliance with GST law, the invoice number is never deleted or reused; it remains permanently reported under cancelled documents in GSTR-1 Table 13 (Document Summary).
4. **Statutory Legal Registers Preserved:** Under Indian Drug & Cosmetics Rules, Schedule H, H1, and X dispensing records can **never be deleted**. MediFlow keeps the original dispensing log and stamps it with an indelible audit annotation: `[CANCELLED: <reason> at <timestamp>]`.
5. **Loyalty Points Reversal:** Any customer loyalty reward points earned on the bill are automatically deducted from the customer's balance.
6. **Immutable Audit Trail:** An audit row is written to **Settings → Audit log** recording who cancelled the bill, at what exact second, and why.

### 5.8 Customer Sale Returns & GST Credit Notes

When a patient brings back unconsumed medicines, when a doctor alters an ongoing course of treatment, or when a return occurs after the same-day cancellation window:

- **Where to process a return:**
  - Open the invoice under **Operations → Sales & invoices** (or press **Alt + M**) and click **Return Items** (or press **Alt + R**).
  - Or review past returns under **Operations → Sale returns (Credit Notes)**.
- **Permissions:** Staff with the **`sale.return`** permission (Owner, Store Manager, Pharmacist, Cashier) can process customer returns.
- **Completed bills only:** Returns can be performed only on completed sales. Cancelled bills cannot be returned.
- **Partial returns supported:** You do not have to return the entire bill. Customers can return 1 strip out of 3, or even 2 loose tablets out of a strip.
- **Enforced quantity caps:** MediFlow tracks `returned_qty` per line item. You cannot return more than the remaining sold units. Once a line is fully returned, it is disabled.
- **Dual input ergonomics:**
  - **Mouse:** Click **Return Items**, adjust pack and loose quantities, pick the refund method, type the mandatory reason, and click **Issue Credit Note**.
  - **Keyboard:**
    - On the invoice page, press **Alt + R** to open the Return form.
    - Press **Tab** or **↑ / ↓** to navigate between items.
    - Type the return pack or loose quantity.
    - Press **Alt + S** (or **Ctrl + Enter**) to issue and save the Credit Note.
    - Press **Esc** to cancel and return to the invoice.

#### What MediFlow does automatically when a return is submitted:
1. **Batch Stock Restoration & Expiry Quarantine:** Returned units are restored to the **exact batch** originally sold (`type: "sale_return"`, `refType: "sale_return"`).
   - **Automatic Statutory Quarantine:** If the batch expired between the original bill date and the return date, MediFlow automatically changes the batch status to **`hold`** (quarantine). This guarantees expired medicines can never be accidentally re-sold at the counter, pending supplier return.
2. **Double-Entry General Ledger Credit Note:** Automatically generates a balanced General Ledger Credit Note voucher (`refType: "sale_return"`). Debits Sales Revenue and Output GST (CGST/SGST or IGST), and credits the chosen refund account (Cash on Hand, Bank/Digital Payments, or Customer Receivables). Balanced to 0 paise.
3. **GST Credit Note (GSTR-1 Table 9B):** Generates an official Credit Note document linked to the original tax invoice. B2B credit notes are reported under GSTR-1 CDNR; B2C returns are reported under CDNUR or net turnover adjustments.
4. **Permanent Sequence Number:** Generates a compliant Credit Note number (`CN/YY-YY/000000`) adhering to GST Rule 46 (maximum 16 characters).
5. **Loyalty Reward Points Reversal:** Reverses customer loyalty points earned on the returned items proportionally (`fraction = returnTotal / billTotal`).
6. **Customer Account Credit:** If the customer has an account and you select **Customer Ledger** (`credit_note`), their outstanding balance is credited immediately.
7. **Print-Ready Documents:** Automatically opens the Credit Note print preview with options for **80mm Thermal POS Slip** or **Full A4 GST Tax Credit Note** with statutory customer acknowledgement and pharmacist signature blocks.

### 5.9 Cash Register & Shifts (Drawer Tally, X-Report & Z-Report)

In retail pharmacies, shift handover and physical drawer cash reconciliation protect against counter discrepancies, till shortages, and unrecorded cash leakages. MediFlow provides end-to-end shift lifecycle management accessible via **Operations → Cash register (Shifts)** or directly from the POS billing counter.

#### 1. Shift Open & Cash Float Tally (`F4`)
- When starting your morning or evening shift, click **Open Register** or press **F4**.
- **Denomination Tally Counter:** Count physical notes and coins in your drawer. Enter the count for ₹500, ₹200, ₹100, ₹50, ₹20, ₹10, ₹5, ₹2, ₹1, and coins. MediFlow automatically sums the float in real-time.
- Press **Enter** on any denomination row to jump immediately to the next note.
- Optionally type shift notes or cashier handover instructions.
- Click **Confirm & Open Register** to activate the till.
- **One Open Shift Rule:** MediFlow strictly enforces a single open shift per pharmacy branch (`cash_sessions_one_open_uq`). A cashier cannot open a new shift until the preceding shift is formally closed.

#### 2. Billing Counter Enforcement (`requireShift`)
- If your pharmacy enables the **Shift Required** setting, billing is blocked whenever the register is closed:
  - A prominent banner appears across the POS terminal: *"Open the register to start billing"*.
  - The **Complete & Print** button is disabled until an open shift is active.
  - Cashiers can click **Open Register (F4)** to open their drawer in seconds without leaving the POS.

#### 3. Real-Time Expected Drawer Cash Calculation
Throughout the shift, MediFlow continuously computes the exact physical cash that must be present in the till:
$$\text{Expected Cash} = \text{Opening Float} + \text{Cash Sales} + \text{Cash Receipts} - \text{Cash Returns} - \text{Cash Cancels} - \text{Cash Payouts}$$
- **Cash Sales:** Sum of all physical cash collected from completed retail bills.
- **Cash Receipts:** Customer khata debt settlements paid in cash at the counter.
- **Cash Returns:** Cash refunded to customers for medicine returns.
- **Cash Cancellations:** Same-day cancelled bills refunded in cash at the counter.
- **Cash Payouts:** Petty cash vouchers paid out (e.g., daily tea, stationery, or supplier cash payments).
- **Non-Cash Tenders Separated:** Digital payments (UPI QR, Debit/Credit Card, Bank NEFT, and Store Credit) do not alter drawer cash and are audited in a separate Tender Breakdown table.

#### 4. Mid-Shift Snapshot: The X-Report (`Alt + P`)
- At any time during an active shift (e.g., during lunchtime cashier relief or manager spot-checks), click **X-Report** or press **Alt + P**.
- Generates an interim, non-closing snapshot of drawer contents, gross sales, payment splits, and transaction counts.
- Available in **80mm Thermal POS slip format** and **A4 sheet format**.
- **Non-closing:** The shift remains open and billing continues uninterrupted.

#### 5. Shift Closing Audit: The Z-Report (`F8`)
- At the end of the cashier's shift, click **Close Register** or press **F8**.
- MediFlow displays the **Expected Cash** calculated by the system.
- Count the drawer cash using the **Denomination Tally Counter** (₹500, ₹200, ₹100, etc.).
- **Live Discrepancy Tracking (Over / Short):**
  - **Balanced:** Exact match (₹0.00 variance).
  - **Shortage (Red):** Physical cash is missing (e.g., `-₹50.00 Short`).
  - **Overage (Amber):** Excess cash in till (e.g., `+₹100.00 Over`).
- Enter an explanatory note if there is any variance.
- Click **Confirm & Lock Shift (Z-Report)**.
- **Z-Report Printout:** Automatically opens the official closing audit slip containing opening float, net sales, expected cash, counted actual cash, variance, cashier signature block, and manager approval line.
- The shift is permanently locked and stamped in the immutable audit log.

### 5.10 Modular POS Counter & Loyalty Points Redemption

MediFlow's point-of-sale interface provides lightning-fast counter operations built for dual ergonomics: 100% keyboard-drivable for veteran Marg ERP pharmacists, and 100% mouse-friendly with visual controls, buttons, and tooltips for new staff.

#### 1. Dual Ergonomics & Counter Shortcuts
- **F2 (Search & Focus):** Jumps cursor directly to the medicine search input. Type brand name, generic composition, or scan product barcodes.
- **F3 (Substitutes Finder):** Opens therapeutically equivalent salt alternatives when an item is out of stock or price-sensitive.
- **F4 (Cash Register):** Checks shift status or opens the drawer management screen.
- **F6 (Hold Bill):** Parks the active cart to serve another customer waiting in queue.
- **F7 (Parked Bills):** Opens the parked bills list with age indicators and stock revalidation alerts.
- **F8 (Payment & Split Tender):** Opens the settlement panel to split across Cash, UPI, Card, and Credit.
- **F9 (Promise Order):** Logs customer demand for out-of-stock items for immediate purchase replenishment.
- **F10 (Finalize Bill):** Completes checkout and generates thermal receipt.
- **Mouse Navigation:** Every single feature has prominent buttons, visual badges, and tooltips for staff who prefer using a mouse.

#### 2. Customer Loyalty Points Redemption
When a customer has accumulated loyalty reward points:
1. Select the customer in the **Customer & Loyalty** picker.
2. The picker immediately surfaces their verified live redeemable points balance and monetary rupee value (e.g. `⭐ 50 Pts (₹50)`).
3. In the payment panel (**F8** or click **Split Tender**), enter the number of points to redeem or click **Redeem Max**.
4. MediFlow automatically deducts the loyalty discount from the bill total, verifies customer balance using row-level locking (`SELECT ... FOR UPDATE`), updates the customer balance, and stamps an immutable `redeem` loyalty transaction linked to the completed invoice.
5. If the bill is ever cancelled or returned, MediFlow automatically restores the customer's redeemed loyalty points.

---

## 6. Medicines and stock

### 6.1 The two ideas to understand

- **Item (medicine):** the product itself: name, price, GST rate, schedule.
- **Batch:** a particular lot of that medicine with its own **batch number, expiry date, cost and quantity**. Stock is always counted **per batch**, because that is how expiry and recalls work.

You add stock by recording a **batch** (opening stock, an import, or a purchase bill). Selling reduces a batch. You never type a stock number directly: every change is recorded, so the quantity always matches the history.

### 6.2 Adding a medicine

**Inventory → Item master → New item.** The form has four parts:

**Identification**
- **Name** (e.g. *Dolo 650 Tablet*) and **Generic name / composition** (e.g. *Paracetamol 650 mg*).
- **Category** and **Manufacturer**: pick from the list, or type a new one into **New category** / **New manufacturer**.

**Pricing & tax**
- **MRP** and **Sale price** (both include GST).
- **GST rate**. The default is **5% — Most medicines (GST 2.0)**. Other choices: 0% Exempt, 12%, 18%, 28%. Choose what applies to your product.
- **HSN code** (medicines are usually 3003 or 3004, e.g. *30049099*).

**Packaging & compliance**
- **Unit** (Strip, Bottle, Pack, Box, Vial, Tube, Piece), **Pack size** (e.g. *15 tablets*), **Barcode** (scan or type).
- **Schedule:** *None (OTC)*, *Schedule H*, *Schedule H1*, *Schedule X* or *Narcotic*. This decides what the billing counter asks for ([5.3](#53-prescription-medicines-schedule-h-h1-x)).

**Storage location:** pick a **Rack** (or *No rack assigned*).

Press **Save**. Only roles that can manage medicines (owner, manager, pharmacist, purchase manager) see this page.

### 6.3 Finding and reading the Item master

**Inventory → Item master** lists **Item, Category, Rack, Pack, HSN / GST, MRP, Sale price, Status, Branch**. Search by name, composition or barcode.

- **Branch-Specific Racks & Overrides:** In a multi-store chain, physical racks, reorder thresholds, and selling prices vary by branch. Click the **Branch Settings** (gear icon) on any item row to configure:
  - **Store Rack / Shelf:** Physical storage bin or rack assignment for the active branch.
  - **Reorder Level & Maximum Stock:** Custom replenishment thresholds specific to branch sales velocity (falls back to catalog master defaults if unconfigured).
  - **Branch Price Override (₹):** Localized selling rate (e.g. airport/mall branches). Cannot exceed legal batch MRP at POS.
- **Branch Pricing Indicator:** Items with an active branch price override display an amber **Branch override** badge under the Sale price column.

### 6.4 Racks and shelves

**Inventory → Racks & shelves → Add Rack / Shelf.** Give a **Rack / Shelf Code** (e.g. *R1-S3*; saved in capitals), a **Name** (*Front Counter Shelf Top*) and an optional description. You can edit or delete a rack (you'll be asked to confirm; medicines on it become "no rack"). Codes must be unique in your store. Racks are store-scoped, ensuring that shelf assignments in one branch never overwrite or conflict with another branch.

### 6.5 Adding the stock you already have

**Inventory → Batches & stock → Opening stock** (owner and manager).

1. Pick the **Item**.
2. Enter the **Batch** number (e.g. *BT-99382*), **Expiry**, and **Quantity**.
3. Enter the **Pricing (per unit)**: purchase rate, MRP and sale rate.
4. **Save.** The batch now appears in *Batches & stock*.

### 6.6 Bulk import from a spreadsheet

**Inventory → Bulk import** (*Smart Stock Import*; owner and manager).

1. Prepare a CSV with a header row and columns for medicine, batch, expiry, quantity, MRP and purchase rate. The names are matched loosely: *Medicine/Item/Product/Name*, *Batch/Lot*, *Exp/Expiry*, *Qty/Quantity/Stock*, *MRP/Retail*, *Purchase/Cost/PRate*.
2. Drop the file where it says **Drop your CSV file here**.
3. Review the preview table (**Status, Medicine, Batch, Expiry** …). Rows with **errors** (missing medicine, batch or expiry, or a bad expiry date) need fixing. Rows with **warnings** (quantity or MRP is 0) can still be imported.
4. Expiry can be written as `12/27`, `12/2027` (month/year, treated as the last day of that month) or a full date.
5. Commit the import. An optional "enrich" step can fill in missing details with AI if an AI key is set up.

### 6.7 Reading Batches & stock

**Inventory → Batches & stock** shows three numbers at the top (**Active batches**, **Stock valuation**, **Expiring ≤ 90 days**) and a table: **Item, Batch, Expiry, PTR, MRP, Value, On hand**.

- The **Near expiry** tab shows batches expiring within 90 days. You can also use *Near-expiry batches* in the command palette.
- Expired batches show a red **Expired** badge; the billing counter will not sell them.
- Use the date range and **Export** if you need a file.

> **Not available yet:** a screen for stock adjustments or breakage write-offs, transfers between branches, and stock counts. See [chapter 19](#19-not-available-yet).

### 6.8 Trade schemes

**Inventory → Trade schemes → New scheme.** A scheme records a supplier offer such as *Buy 10 Get 1 Free*.

- **Scheme / Promotion Title**, **Scheme Promotion Type** (free quantity or discount), **Applicable Target Scope** (a single **medicine**, a **category**, or a **supplier**).
- **Buy Quantity (Trigger Threshold)** and **Free Bonus Quantity**, or **Discount Percentage (%)** / **Flat Discount Amount (₹)**, and **Minimum Purchase Quantity**.
- Optional **Valid From / Valid To** dates.

The list shows **Scheme Name, Applicability, Terms, Validity, Status**, with a delete (bin) button. Roles that can view purchases (owner, manager, purchase manager, accountant, auditor) open this page.

---

## 7. Buying from suppliers

### 7.1 Adding a supplier

**Directory → Suppliers → New supplier** (owner, manager, purchase manager).

- **Basic information:** name (e.g. *M/s Pharma Distributors*), contact person, phone.
- **Statutory:** **GSTIN** (15 characters, e.g. *22AAAAA0000A1Z5*) and **Drug licence** number. The first two digits of the GSTIN are the supplier's state, which decides whether you pay CGST + SGST or IGST.
- **Address** and **Trade terms** (such as credit days).

The list shows **Supplier, Contact, GSTIN, Drug licence, Address, Status**, and you can search by name, phone or GSTIN.

### 7.2 Recording a supplier bill (GRN)

When goods arrive, record the supplier's invoice so stock and accounts update. **Operations → Purchases (GRN) → Record Purchase Invoice** (or **Ctrl+K → Record purchase**).

1. **Supplier / Distributor:** pick one.
2. **Supplier Bill / Invoice No:** copy it from the paper bill (e.g. *INV-2024-9841*). The same supplier's invoice number can only be entered once.
3. **Invoice Date.**
4. Add one line per medicine. For each line enter:
   - **Medicine** and **Batch** number (e.g. *LOT101*),
   - **Expiry**,
   - **Quantity** you were billed for and **Free quantity** (e.g. "10 + 1" → quantity 10, free 1),
   - **Purchase rate** (before GST), **MRP**, **GST %**, and any discount.
5. Watch the **GRN Invoice Summary** (taxable value, GST, total) update.
6. **Save.**

**What MediFlow does for you**
- Creates a **new batch** for each line with quantity = billed + free.
- Works out the **true cost per unit** ("landed cost"): the money you paid divided by *all* units including free ones. Example: 100 strips at ₹60 plus 10 free = ₹6,000 ÷ 110 = **₹54.55** per strip. Your margins are therefore correct.
- Works out all totals itself (it ignores any total typed on the screen) so figures can't be tampered with.
- Splits GST as **CGST + SGST** when the supplier is in your state, or **IGST** when the supplier is in another state.
- Posts the accounting entries and the GST input record.

### 7.2a Pharma purchase schemes & layered discounts (10+1 free, TD%, CD%)

Indian pharmaceutical distributors frequently supply medicines with promotional free goods and tiered discounts. MediFlow supports standard pharma trade terms directly on the purchase entry screen:
- **Free Goods / Schemes (10+1, 10+2 free):** Enter the billed pack quantity under **Billed** and the bonus quantity under **Free (Scheme)**. MediFlow automatically displays the scheme badge (e.g. `10+1 Free`) and updates your physical stock ledger with the total units ($10 + 1 = 11$ packs, or 110 base units).
- **Trade Discount (TD %):** Reduces the taxable gross purchase amount before GST. MediFlow calculates GST exclusively on the net taxable amount.
- **Cash Discount (CD %):** Prompt settlement discount applied on the bill. Cash discount reduces your supplier payable amount and is credited to your **Discount Received** accounting ledger without disturbing statutory GST inputs.
- **Landed Unit Cost Dilution:** The screen displays live calculations of your **Landed Cost per Pack** and **Landed Cost per Loose Tablet** ($(\text{Taxable} - \text{Cash Discount}) / \text{Total Base Units}$). This ensures profit margins are always derived from your true acquisition cost.

### 7.3 Looking back at purchases

**Operations → Purchases (GRN)** lists **Supplier invoice, Date, Supplier, Taxable, GST, Total, Status**. Search by invoice number or supplier. Open one to see **Inward Medicine Batches** (medicine, packaging, batch, expiry, billed qty, free qty, rate, MRP, GST %, line total). **Export** downloads the list (owner, manager, accountant).

### 7.4 Purchase orders, supplier debit notes & payments

- **Purchase Orders (B2.3):** Create formal POs in **Purchases → Purchase Orders**, specify ordered quantities, rates and expected schemes, and generate printable PDF order sheets to email to distributors. When receiving goods against a PO, clicking **Receive Goods** pre-fills the GRN invoice automatically.
- **Supplier Returns & Debit Notes (B1.2):** Generate statutory Debit Notes for near-expiry, damaged, or recalled stock directly from **Purchases → Returns**, adjusting supplier accounts and returning inventory.
- **Supplier Payments (B2.4):** Settle distributor bills with multi-mode vouchers (Bank Transfer, Cheque, UPI) and view live balances on the supplier ledger under **Purchases → Suppliers → [Supplier Name] → Record Payment**.

---

## 8. Customers, family groups and loyalty

### 8.1 Adding a customer

**Directory → Customers → Add customer** (or **F4** at the billing counter for a quick add). Owner, manager, pharmacist and cashier can add customers.

- **Contact:** name, phone, email.
- **Billing & credit:** **GSTIN** (for business customers; the state fills in automatically from it), a **credit limit** and **address**.
- **Notes:** anything useful, e.g. *Prefers generics, diabetic, monthly refill*.

The customer list shows **Customer, Phone, Loyalty Points, Credit limit, Status**; use the search box for name, phone or email. The small icon next to the points opens the customer's **points ledger**.

### 8.2 Family groups

For a household that shares a credit account. **Directory → Family groups.**

1. **Create Family Group:** **Family / Household Name** (e.g. *Gupta Family*), **Pooled Credit Limit (₹)**, **Notes / Address**.
2. **Add Member to Household:** choose a customer and add them.
3. The group page shows the **Consolidated Family Bill History** (date, invoice number, patient, total, paid).

### 8.3 Setting up the rewards (loyalty) programme

**Directory → Loyalty rewards.** Turn on **Enable Customer Rewards & Loyalty**, then set:

- **Earning Ratio:** points given per ₹100 billed (e.g. 1).
- **Point Redemption Value (₹):** rupees of discount each point is worth (e.g. ₹1).
- **Minimum Points to Redeem:** how many points a customer needs before using them.

### 8.4 How customers earn and keep points

- A customer earns points automatically when you bill them: **points = floor(bill amount ÷ 100) × earning ratio**, e.g. a ₹1,250 bill at 1 point per ₹100 earns **12 points**.
- Open the points icon beside the customer to see the **Points History & Ledger** (date, details, points, balance after).
- To correct a balance, use **Adjust Loyalty Points**: enter **Points to Add / Deduct** (use a minus to deduct) and a **Reason / Note**, then save.

> **Not available yet:** using ("redeeming") points as a discount at the billing counter.

### 8.5 Medical representatives and commission

If you pay commission to a medical rep or consultant who brings prescriptions:

1. **Directory → Medical reps (MR) → Add Medical Representative:** name, **Pharma Company**, **Commission Rate (%)**, phone, email.
2. When billing, pick the rep under **Medical Rep / Consultant (Optional)**.
3. See what you owe in **Finance → MR commissions** ([12.5](#125-medical-rep-commissions)).

---

## 9. Prescriptions and legal registers

Indian law requires pharmacies to keep records of certain medicines. MediFlow keeps them for you.

### 9.1 What gets recorded automatically

Whenever you sell a **Schedule H, H1, X or narcotic** medicine, the billing counter collects the doctor and patient details and MediFlow adds a line to the right **register**: date and bill, medicine and batch, schedule, quantity, patient details, prescribing doctor and a pharmacist signature column. These records can **never be deleted**.

### 9.2 Viewing a register

**Compliance (Rx) → Drug registers** shows all entries, with four counts at the top (**Schedule H1 Dispensed, Schedule H Dispensed, Schedule X & Narcotics, Active Prescriptions**). Use the tabs to see one register at a time (all, Schedule H, **Schedule H1 (Form 35)**, X and narcotics). Narrow it with **From date**, **To date** and the search box (patient, doctor, batch). Owner, manager, purchase manager, accountant and auditor can open registers.

### 9.3 Printing a register for the inspector

On a register page press the **printer icon** (*Open inspector-ready printable statutory register*). A clean page opens showing your **drug licence number**, the **pharmacist**, the legal rule, and the entries for the dates you chose. Use your browser's print command (Ctrl + P) to print or save as PDF. Pick the date range first.

### 9.4 Doctors

**Compliance (Rx) → Doctor master → add doctor:** **Doctor Full Name**, **Medical Council Reg No** (required and unique), qualification, specialization, hospital/clinic, phone, email, address. Doctors you save can be picked quickly at the billing counter. Owner, manager and pharmacist use this page.

### 9.5 Recording a prescription

**Compliance (Rx) → Prescriptions (Rx) → New Prescription Record.**

1. **Patient Details:** full name, phone, age, gender, address.
2. **Prescribing Doctor:** pick from the registry, or type a new doctor's name and registration number.
3. **Rx Date**, then add each medicine with its **dosage** (e.g. *500mg*), **frequency** (e.g. *1-0-1*) and quantity.
4. **Save.** The list is searchable by patient, doctor or Rx number.

> **Note:** at the billing counter you type the prescription reference. MediFlow does not yet tick off the prescription's quantities automatically as you sell against it.

---

## 10. Orders, promises and reminders

### 10.1 Online / omnichannel orders

**Operations → Omnichannel orders** lists orders that arrive from partner apps or websites. Search by order number or customer and filter by status.

Move each order forward with the button on its row: **received → preparing → ready → delivered**. Open an order to see **Ordered Items** (medicine and quantity).

Your technical team can connect a website or app so it creates orders automatically (see [15.3](#153-api-keys-for-connected-apps)).

### 10.2 Promise orders

For customers who ask for a medicine you don't have. **Operations → Promise orders** (use **New** to add one, or create it from the billing counter).

The list shows **Customer Details, Requested Medicine, Promised Date, Status, Notes**. Use the action icons to mark **PO Raised** (you've ordered it), **Delivered to Customer**, or **Cancel Request**.

### 10.3 Patient reminders

**Comms & Alerts → Patient reminders → Schedule Patient Reminder.**

- **Patient Name**, **Phone Number**, **Reminder Type** (*Medicine Refill, Doctor Followup, Ledger Payment Due, General Custom*), **Scheduled Date**, optional **Linked Medicine**, **Dispatch Channel** (*WhatsApp & SMS, WhatsApp Only, SMS Only*), and **Message Text**.
- The list shows **Patient, Medicine / Reason, Scheduled Date, Channel, Status, Message Preview**. A due reminder moves from *pending* to *sent*.

---

## 11. WhatsApp and SMS

### 11.1 Setting up (owner only)

**Settings → WhatsApp** has your **Meta Graph API Credentials** (phone number ID, business account ID, access token) and a **Webhook Configuration** block, plus a switch **Enable WhatsApp Live Integration**.
**Settings → SMS** lets you choose a provider (**MSG91, TextLocal, Twilio**), enter the sender ID (e.g. *MEDFLW*) and token, and send a **Test SMS Dispatch**.

Secrets such as access tokens are stored securely and shown masked (like `••••oken`). If you save the page again without touching a masked field, the stored value is kept.

**While live sending is switched off**, messages are only *recorded as if sent*, so you can practise safely without messaging real people.

### 11.2 The inbox

**Comms & Alerts → WhatsApp inbox:** search conversations on the left, open one, type your message and send. A *WhatsApp Business Active* tag appears when live sending is on.

### 11.3 Templates

**WhatsApp inbox → Templates → Create WhatsApp Template** (owner only): **Template Name** (e.g. *refill_reminder_v1*), **Category** (*Utility* for bills and reminders, *Marketing* for offers, *Authentication* for codes), optional **Header** and **Footer**, and the **Body Text**. WhatsApp requires approved templates for messages you start.

---

## 12. Reports

**Finance → Reports & Analytics** is the home for reports; it links to each one below. Owner, manager, purchase manager, accountant and auditor can open reports.

### 12.1 Dashboard (Overview)

The home page shows: revenue for the period you choose, **Average bill value**, **Low-stock items** and **Expiring ≤ 90 days**; plus **Recent invoices**, **Needs attention** (items below reorder level) and **Quick actions** (New bill, Record purchase, Import stock, Add customer).

### 12.2 Expiry exposure

**Reports → Expiry exposure.** Shows your money at risk:
- **Already Expired Loss** and **Near-Expiry Exposure (≤ 90 d)**, split into **Urgent (≤ 30 days)** and **Next 60–90 days**.
- Tables list **Medicine, Batch No., Expiry Date, Qty left, Unit PTR** and the loss/exposure in ₹.

Use it to return stock to suppliers before it expires.

### 12.3 Fast and slow movers

**Reports → Stock movement.** **Fast Moving Medicines** (top sellers) and **Dead Inventory** (stock on hand but zero sales in the period). Choose the date range to match your buying cycle.

### 12.4 Batches and valuation

**Inventory → Batches & stock** gives the value of your stock (see [6.7](#67-reading-batches--stock)).

### 12.5 Medical rep commissions

**Finance → MR commissions.** Table of **Invoice & Date, Medical Representative, Pharma Company, Prescribing Doctor, Sale Amount, Commission Rate, Commission (₹)**. Filter by one rep or *All Medical Reps & Doctors*, or search.

### 12.6 Customer and supplier balances

From **Reports & Analytics** open **Customer Credit & Debtor Ageing** (who owes you) or **Supplier Payables & Creditors** (whom you owe).

### 12.7 Exporting

Use the **Export** button on sales, purchases and batches pages to download a CSV for Excel or your CA. Only the owner, manager and accountant can export.

---

## 13. Accounts and money

MediFlow keeps proper double-entry books automatically; you don't post entries by hand for sales and purchases. **Finance → Accounting** is the starting point. Owner, manager, accountant and auditor can open it. The Accounting page has a card for each statement below.

| Screen | What it tells you |
|---|---|
| **Accounting & Day Book** | **Total Debits**, **Total Credits**, whether the ledger is balanced; a *Trial Balance Preview* and the *Day Book (Journal)* of every entry. |
| **Trial Balance** | Every account's balance (**Code, Account, Type, Debit, Credit**). Debits always equal credits. |
| **Profit & Loss** | Revenue, costs and profit for a period. |
| **Balance Sheet** | What you own and owe on a date. |
| **Cash Flow** | Money in and out. |
| **Outstanding** | Who owes you and whom you owe, in age buckets (*Current 0–30 days, Overdue 31–60, Critical over 60*). |
| **Receipts** | Record money received from a customer against their unpaid bills (see 13.1). |

### 13.1 Receiving money from a customer (receipts)

When a customer pays an outstanding credit balance ("Khata"), record it in **Finance → Receipts** (owner, manager and accountant). This keeps the customer's balance, the individual bills, and your general ledger perfectly in step.

1. **Choose the customer:** The left list shows all customers with outstanding credit balances, sorted with the highest balance first. Search by customer name or phone number.
2. **Allocate payment against bills:** The customer's unpaid invoices appear, listed oldest first. You can:
   - Type a specific amount against individual bills in the **Receive now (₹)** box.
   - Click **Full** to pay an individual bill completely.
   - Click **Settle all bills in full** to distribute the total outstanding amount across all bills.
3. **Handle Customer Advances & Overpayments:** If the customer pays more than their unpaid invoices, the remaining excess is safely recorded as an unallocated **Customer Advance / Party Credit**, automatically reducing their total outstanding debt without creating dummy invoices.
4. **Choose payment details:** Pick the **Payment method** (Cash, UPI, Card, or Bank transfer), the **Date**, an optional **Reference** (UPI transaction ID, cheque number), and an optional **Note**.
5. **Save voucher:** Click **Record receipt of ₹…**. MediFlow generates a sequence voucher such as **RCT/26-27/000001**, writes balanced double-entry journals (debiting *Cash on Hand* or *Bank*, and crediting *Accounts Receivable*), and updates the customer's live credit balance instantly.

### 13.2 Paying suppliers (Payment vouchers)

When paying pharmaceutical distributors and suppliers for stock purchases:
1. Navigate to **Finance → Payments** or **Directory → Suppliers → [Supplier Profile]**.
2. Select the distributor to view all pending Goods Received Notes (GRNs) and purchase bills.
3. Allocate the payment amount against specific purchase bills, or record a general advance payment.
4. Choose the disbursement method (**Bank Transfer, Cheque, UPI, or Cash**) with cheque/transaction reference.
5. MediFlow posts double-entry journal entries (debiting *Sundry Creditors / Accounts Payable* and crediting *Bank Account* or *Cash on Hand*), and updates the distributor's running ledger and outstanding age buckets.

### 13.3 Bank reconciliation

**Finance → Bank reconciliation** matches your bank statement to the payments recorded in MediFlow.

1. **Upload Bank Statement CSV:** choose the **Bank Name** (HDFC, ICICI, State Bank of India, Axis, or *Other / Standard CSV*), **Account Number** and **Statement Date**, then paste the statement's CSV text (date, description, debit, credit, balance).
2. Let it **auto-match**, or link a line yourself with **Link System Payment**. You can unmatch a mistake.

> **Not available yet:** recording operational overhead expenses (rent, staff salaries, electricity), closing a financial period so historical entries can't change, and automated CA audit export bundles.

---

## 14. GST

**GST & Tax** is for owners, managers, accountants and auditors. Everything is built from your sales and purchases, so you don't re-type anything. Use the month selector at the top of the GST pages to choose the period.

### 14.1 GST Overview
Cards for **Outward Tax Liability**, **Eligible ITC (Inward)**, **Net Cash Tax Payable** and **Pending E-Invoices**, plus *Recent Tax Invoices & Supply Bills* (date, document no., party, GSTIN, supply type, taxable, tax, total, e-invoice).

### 14.2 Outward supplies (GSTR-1)
**Outward (GSTR-1)** shows your sales for the month: totals for **Taxable Value, CGST, SGST, IGST**; invoice-wise tables for business customers (B2B) and consumers (B2C); an **HSN summary**; and *Cancelled Invoices*.
- **Export B2B CSV** and **Download Portal JSON** give you a file in the format the GST portal expects, so you can upload your return.

### 14.3 Inward supplies (ITC)
**Inward (ITC)** lists your purchases with **Supplier Invoice No, Supplier GSTIN, Taxable, CGST, SGST, IGST, Total, ITC Status**, and totals of tax credit you can claim.

### 14.4 Reconciliation
Open **Reconciliation** from a link on the GST Overview or Inward page. It compares what you owe with what you can claim: **Total Output Tax Liability**, **Total Input Tax Credit**, **Net Cash Tax Payable**, **ITC Carried Forward**, with a table by tax type and a list of *Audit Discrepancies & Mismatch Checks*.

### 14.5 Returns & filing worksheets
**Returns & Filing** prepares worksheets for **GSTR-1** and **GSTR-3B** (Table 3.1 outward supplies, Table 4 eligible ITC, Table 6.1 payment of tax). Use them as the basis for your filing.

### 14.6 E-invoice and e-way bill
**E-Invoice & E-Way** lists your B2B invoices (invoice no., customer, GSTIN, taxable, total, **IRN Status**, **E-Way Bill**).
- **Generate IRN** creates the 64-character invoice reference number and QR code. **View IRN & Signed QR** shows or copies it. **Cancel IRN** works within 24 hours (choose a reason: duplicate invoice, data entry mistake, order cancelled by buyer, others).
- **Generate E-Way Bill** asks for the **approximate road distance (km)**, **Vehicle Registration Number** and optional **Transporter ID**.

> **Important:** e-invoicing is **switched off** by default and, when your administrator switches it on for practice, it is only a **simulator**. It does **not** connect to the government portal, and numbers it makes are **not valid** for filing. Wait for the live GST connection before relying on it.

### 14.7 Changing GST rates in bulk (rate rationalisation)
When the government changes the GST rate on medicines (for example the 12% → 5% change under GST 2.0), you can update many medicines at once. This page isn't in the menu; ask your administrator for the page `/dashboard/gst/rates`.

1. Choose the **Current GST Rate (Source)**, the **New GST Rate (Target)** and an **HSN Prefix Filter** (3004, 3003, a custom prefix, or all).
2. Edit the **reason**, press **Preview** and check the count and sample medicines.
3. Press **Apply**.

Only the **item master** changes. **Old invoices keep the rate they were issued with**. A record of the change is saved.

---

## 15. Settings

**Settings** (owner only) is at the bottom of the left menu.

### 15.1 Your pharmacy profile
Fill in: **Pharmacy name**, **Drug licence no.**, **GSTIN** (e.g. *27AAAAA0000A1Z5*), phone, address, city, **State code** (e.g. 27), pincode and the **Bill / Invoice Serial Prefix**.

- The **bill prefix** is at most **3 capital letters or digits** (e.g. *INV*, *MED*), because GST allows an invoice number of only 16 characters. Typing more is blocked; symbols such as `/` are rejected.
- Your licence number and name appear on invoices and registers; your pharmacy name shows in the left menu.

### 15.2 Other settings pages
Racks ([6.4](#64-racks-and-shelves)), Trade schemes ([6.8](#68-trade-schemes)), Loyalty ([8.3](#83-setting-up-the-rewards-loyalty-programme)), Medical reps ([8.5](#85-medical-representatives-and-commission)), WhatsApp and SMS ([chapter 11](#11-whatsapp-and-sms)), POS Devices and offline counters ([15.4](#154-pos-devices--offline-terminals-settings--devices)). Several of these appear in other menu sections; each is visible only to the roles that may use it. A shop-wide **maximum discount** (see [5.5](#55-discounts)) is currently set by your administrator.

### 15.3 API keys for connected apps
For a website or partner app that checks your stock or sends you orders. This page isn't in the menu; your administrator opens `/dashboard/settings/api-keys`.

1. Enter a **Key name** and tick what it may do: **stock.read** (read catalogue and stock), **orders.write** (create orders), **orders.read** (see orders). You may tie the key to one store.
2. Press create and **copy the key straight away** (it starts with `mf_live_`). It is shown **only once**.
3. The list later shows name, scopes, last-used and created dates. **Revoke** a key to stop it immediately.

Treat a key like a password; never share it by chat or email. The connected app sends it as `Authorization: Bearer mf_live_…`.

---

### 15.4 POS Devices & Offline Terminals (Settings → Devices)

For pharmacies operating physical checkout counters, MediFlow allows registering dedicated POS terminals that can continue billing offline during broadband outages.

**Register a counter device:**
1. Go to **Settings → Devices** (or navigate to `/dashboard/settings/devices`). Only owners and store managers (`settings.manage`) have access.
2. Select your store branch, enter a **Device name** (e.g., *Counter 1 (Main Cashier)*), and assign a **2-digit Device Code** from `01` to `99` (e.g., `01`).
3. Press **Register Device**.
4. **Copy the Device Token immediately**: MediFlow generates a secure, one-time authentication token. For security, it is hashed on the server and shown **only once**.
5. Save the token into your counter terminal's offline setup. The terminal uses this token to authenticate against the `/api/sync/*` endpoints.

**Why each device has its own 2-digit code:**
GST Rule 46(b) mandates that invoice serial numbers must be consecutive, unique per financial year, and strictly $\le 16$ characters. MediFlow assigns each physical counter terminal its own independent invoice series:
- Format: `{StoreCode}{DeviceCode}/{FY}/{Sequence}` (e.g. `ST01/2526/000001` = 15 characters).
- Each device reserves sequential blocks of numbers from the server while online (e.g., 200 numbers at a time).
- When internet drops, Counter 1 and Counter 2 can issue bills simultaneously without contacting the cloud or causing sequence collisions.

**Revoke a device:**
If a terminal is retired, reassigned, or compromised, click **Revoke** on its row in the Devices list. Revocation is instantaneous: any further sync requests from that device token are immediately rejected.

---

### 15.5 Audit log: who changed what
**Finance → Audit log** is a permanent record of important changes, so you can always answer "who did that, and when?". It is open to the **owner, manager and auditor**.

It records, with the person's name, the time and the **old and new values**:
- **Stock changes** (opening stock and adjustments), showing the quantity before and after and the reason.
- **New medicines**, with price, GST rate and schedule.
- **Changes to your pharmacy profile** (only the fields that changed).
- **Discount overrides**: when a manager gives a discount above the shop's limit.
- Changes made in GST rates, suppliers, prescriptions and loyalty points.

Use the filters at the top (**User, Record type, Action, From, To**) and press **Apply**; **Reset** clears them. Entries can never be edited or deleted. Staff sign-ins, role changes and returns will be added as those features arrive.

---

### 15.6 Staff & access: invite and manage your team

**Directory → Staff & access** (owner only) is where you decide who can use MediFlow and what they can do.

**Invite someone**
1. Press **Invite person**.
2. Type their **Email address**, choose a **Role** (the line under it explains the role) and the **Branch access**: **All branches**, or untick it and tick the branches they may work in.
3. Press **Create invitation link**, then **Copy** the link and send it to the person yourself (WhatsApp, SMS, email). For safety **the link is shown only once**. If you lose it, create a new invitation for the same email: the old link stops working.
4. The invitation waits under **Waiting to join** until they accept it (links last 7 days). Press **Revoke** to cancel one.

**Change someone's access:** press **Edit** on their row, pick a different role or branches, **Save**. The change applies the next time they open a page.

**Suspend:** press **Suspend** to sign a person out everywhere and stop them signing in (use it when someone leaves). **Re-activate** gives access back. You can't suspend yourself, and there must always be **at least one active owner**.

**Roles & permissions** (also under Directory) lists every role and exactly what it can do. Roles are fixed for now: choose the one closest to the person's job.

---

## 16. The AI assistant

Press **Ctrl + J** (or choose *Ask MediFlow AI* in the palette) to open a chat panel. Ask in plain English, for example:

- *"Which items are low in stock?"*
- *"Give me today's sales summary."*
- *"Is there an interaction between ibuprofen and aspirin?"*

It answers from your live data. If it hasn't been set up with an AI key, it will tell you so. It only shows **your** pharmacy's data. The assistant is available to the owner, manager, pharmacist and purchase manager. **Always double-check medical advice with a pharmacist**: the assistant is a helper, not a doctor.

---

## 17. Keyboard shortcuts

| Where | Keys | What they do | macOS Equivalent |
|---|---|---|---|
| Anywhere | **Ctrl/⌘ + K** | Search or jump to any page | `Cmd + K` |
| Anywhere | **Ctrl + Shift + S** | Switch branch or warehouse | `Cmd + Shift + S` |
| Anywhere | **Ctrl + B** | Collapse / expand the left menu | `Cmd + B` / `Ctrl + B` |
| Anywhere | **?** or **Ctrl + F1** | Show Marg ERP & system shortcuts cheat sheet | `?` or `Cmd + ?` |
| Anywhere | **Ctrl + J** | Open / close the AI assistant | `Cmd + J` |
| Anywhere | **F12** / **Alt + F12** | Open floating counter calculator | `F12` or `Option + F12` |
| Anywhere | **Alt + N** | Navigate to POS Billing Counter | `Option + N` |
| Anywhere | **Alt + P** | Navigate to New Purchase GRN Bill | `Option + P` |
| Anywhere | **Alt + M** | Navigate to Sales Register (Modify Bill) | `Option + M` |
| Anywhere | **Alt + I** | Navigate to Inventory & Batch Stock Lookup | `Option + I` |
| Anywhere | **Alt + L** | Navigate to Customer Ledgers & Khata | `Option + L` |
| Anywhere | **Esc** | Close active dialog, modal, or cancel search | `Esc` |
| Billing | **F2** | Start a new bill / clear current bill | `F2` (or `Fn + F2`) |
| Billing | **Insert** / **F3** / **/** | Jump to medicine search box to add items | `Insert`, `F3`, or `/` |
| Billing | **↑ / ↓** (in search) | Navigate autocomplete batches | `↑ / ↓` |
| Billing | **Enter** (in search) | Add selected medicine/batch to cart | `Enter` |
| Billing | **↓** (from empty search) | Enter cart table and focus active line item | `↓` |
| Billing | **↑ / ↓** (in cart) | Navigate between cart line items (Roving cursor) | `↑ / ↓` |
| Billing | **+** / **-** | Increment / decrement active quantity (pack/loose) | `+` / `-` |
| Billing | **Delete** (on cart row) | Delete the selected medicine line from bill | `Delete` (on focused row) |
| Billing | **Tab** / **Enter** | Advance to next field (Pack &rarr; Loose &rarr; Search) | `Tab` / `Enter` |
| Billing | **F4** | Quick-add a new customer | `F4` (or `Fn + F4`) |
| Billing | **F6** | Park (hold) the active bill | `F6` (or `Fn + F6`) |
| Billing | **F7** | Recall (resume) parked bills list | `F7` (or `Fn + F7`) |
| Billing | **F8** | Open split-tender payment & customer credit panel | `F8` (or `Fn + F8`) |
| Billing | **F9** | Substitute medicine / chemical salt lookup | `F9` (or `Fn + F9`) |
| Billing | **End** / **F10** | Complete bill and print receipt (Classic Marg key) | `End` or `Cmd + Enter` / `F10` |
| Billing | Barcode scanner | High-speed scan to add pack to bill automatically | Automatic |
| Invoice page | **Alt + C** | Cancel bill (same-day void) | `Option + C` |
| Invoice page | **Alt + R** | Return items & issue GST Credit Note | `Option + R` |
| Return form | **Alt + S** / **Ctrl + Enter** | Issue and save GST Credit Note | `Option + S` / `Cmd + Enter` |
| Register screen | **F4** | Open register shift modal | `F4` (or `Fn + F4`) |
| Register screen | **F8** | Close register shift & tally modal | `F8` (or `Fn + F8`) |
| Register screen | **Alt + P** / **Ctrl + P** | Print mid-shift X-Report snapshot | `Option + P` / `Cmd + P` |
| Tally counter | **Enter** | Move to next currency denomination input | `Enter` |

### 17.1 Marg ERP Migration Guide: Shortcut Cross-Reference

If your pharmacy staff is accustomed to Marg ERP 9+ or Marg Books, here is how the primary keyboard workflows map to MediFlow:

| Workflow / Action | Marg ERP Key | MediFlow Key | MediFlow Advantage |
|---|---|---|---|
| **New Sale Bill** | `Alt + N` / `F2` | **`F2`** / **`Alt + N`** | Clears counter and focuses search box instantly |
| **Search Medicine / Add Row** | `Insert` / Item search | **`Insert`** / **`F3`** / **`/`** | Instant search across brand, generic molecule, and barcode |
| **Delete Cart Row** | `Delete` | **`Delete`** | Deletes highlighted row; normal text editing inside inputs |
| **Adjust Quantity** | `+` / `-` | **`+` / `-`** | Dynamically increments pack or loose units |
| **Batch Selection** | `Ctrl + Tab` / `Enter` | **`↑ / ↓` + `Enter`** | **Auto-FEFO**: automatically selects earliest expiring batch |
| **Substitute / Molecule Finder** | `F7` (Books) / `F9` | **`F9`** | Compares active molecule, available stock, and price difference |
| **Quick Customer Creation** | `F2` on ledger | **`F4`** | Adds patient in 3 seconds without losing entered items |
| **Hold / Park Active Bill** | Special menu | **`F6`** | Frees counter for next patient; zero stock deduction |
| **Recall / Resume Parked Bill** | Bill lookup | **`F7`** | Instant resume with live stock shortage and expiry alerts |
| **Split Tender / Store Credit** | `Tab` / `Ctrl + W` | **`F8`** | Splits across Cash, UPI, Card, and Customer Ledger |
| **Cancel Bill (Same-Day)** | Void bill menu | **`Alt + C`** | Exact batch stock restoration, reversing JV, and GSTR-1 voiding |
| **Sale Return / Credit Note** | `*` / Special return | **`Alt + R`** | Full or partial strip/loose returns, automatic expiry quarantine (`hold`), and GSTR-1 Table 9B |
| **Cash Register / Shift Open** | Cash drawer menu | **`F4`** | Opening cash float with Indian banknote denomination tally |
| **Close Register (Z-Report)** | Day close | **`F8`** | Reconciles expected cash against counted till with over/short variance |
| **Mid-Shift Snapshot (X-Report)** | Till summary | **`Alt + P`** | Real-time audit snapshot without closing shift |
| **Save & Print Receipt** | `End` / `Ctrl + W` / `F10`| **`End`** / **`F10`** | Traditional Marg `End` key prints invoice in 1 press |
| **Counter Calculator** | `F12` / `Alt + F12` | **`F12`** / **`Alt + F12`** | Integrated safe arithmetic calculator with copy to bill |
| **Switch Branch / Location** | Company / branch menu | **`Ctrl + Shift + S`** | Instant branch switcher with search across retail branches and warehouses |
| **Global ERP Navigation** | `Alt + P/M/I/L` | **`Alt + P/M/I/L`** | One-key jump to Purchases, Register, Inventory & Ledgers |
| **Barcode Scanner** | Fast scan mode | **Automatic** | High-speed hardware buffer (<45ms) auto-adds scanned packs |
| **Help / Cheat Sheet** | `Ctrl + F1` / `Alt + F1` | **`Ctrl + F1`** / **`?`** | Instant on-screen cheat sheet |

---

## 18. Common questions and error messages

| You see… | What it means / what to do |
|---|---|
| *Invalid email or password* | Check both. Passwords are case-sensitive. |
| *Too many attempts, try again in 15 minutes* | There were 10 wrong passwords for this email. Wait 15 minutes, then try again. |
| *Your access has been suspended* / *no branch access* | Ask your owner to restore your access. |
| *Your current password is not correct* | You typed the wrong current password on the My profile page. |
| *You don't have access to this page* | Your role can't use this page. Ask the owner. |
| *Insufficient stock for … Available: N* | You asked for more than the batch has. Lower the quantity or choose another batch. |
| An item doesn't appear in billing search | It has no stock, only expired batches, or is misspelled. Check **Inventory → Batches & stock**. |
| *Doctor's name is mandatory …* / *Doctor Medical Council Registration Number is mandatory …* | The bill contains Schedule H/H1/X medicine. Fill in the doctor (and for H1/X the registration number, patient and Rx details). |
| *Discounts above N% need a manager's approval* | The shop's discount limit is lower than what you entered. Ask a manager to bill it. |
| *Bill prefix can be at most 3 characters* | Shorten the prefix in Settings. |
| *Use only capital letters and digits for the bill prefix* | Remove symbols and spaces from the prefix. |
| *Rack code '…' already exists* / *Rack code is required* | Use a different or non-empty rack code. |
| *Choose a valid GST rate* | Pick one of the listed GST rates. |
| A supplier bill is rejected as a duplicate | That supplier's invoice number is already recorded. |
| *E-invoicing is not configured* | E-invoicing hasn't been switched on by your administrator. |
| *Something went wrong. Please try again.* | A temporary problem. Try again; if it repeats, tell your administrator. |
| The page says "Offline Mode" | Your internet dropped. Wait until it returns before saving. |
| I made a mistake on a bill | Use **Cancel Bill** (Alt+C) on the same business day, or **Return Items** (Alt+R) to issue a GST Credit Note. |
| *An open cash register shift is required to complete sales* | Your store has shift enforcement enabled. Open a shift with your initial float under **Operations → Cash register (Shifts)** or press **F4** on POS. |
| *An active register shift is already open for this store* | Exactly one shift can be open per branch. Close the previous cashier's shift before opening a new one. |

**Good habits**
- Keep batch numbers and expiry dates exactly as printed on the pack.
- Record supplier bills the same day so stock and GST stay accurate.
- Check **Needs attention** and **Expiry exposure** every week.
- Print the Schedule H1 register for the month before any inspection.

---

## 19. Platform Architecture & Future Scope

### 19.1 Multi-Platform Deployment Strategy

MediFlow provides a dual-delivery model so pharmacy owners and cashiers can use the software however best fits their business needs:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MediFlow Architecture                           │
├───────────────────────────────────┬────────────────────────────────────┤
│       Cloud Web SaaS (Next.js)    │   Native Windows Executable (.exe) │
│  • Browser-hosted (Chrome/Edge)   │  • High-speed desktop installation │
│  • Instant access from any device │  • Offline billing with local sync │
│  • Ideal for managers & accounts  │  • Direct USB/serial POS printers  │
├───────────────────────────────────┴────────────────────────────────────┤
│                       Future Scope Platforms                           │
│  • Native macOS Desktop (.dmg) for Apple Mac hardware                  │
│  • Mobile Companion App (iOS & Android) for on-the-go pharmacy audits  │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Cloud Web SaaS (Browser-Hosted)**
   - Open MediFlow in any modern web browser (Google Chrome, Microsoft Edge, Mozilla Firefox, Apple Safari).
   - Instant access from anywhere without installing or updating software.
   - Ideal for chain owners reviewing store dashboards from home, traveling managers, and accountants filing monthly GST returns.

2. **Native Windows Desktop Executable (`.exe` / `.msi`)**
   - Packaged as a downloadable, native Windows installer.
   - **Offline-First Billing (Phase 4):** Operates at maximum hardware speed. Even during complete internet or broadband outages, the counter bills without stopping, saving sales to a secure local database and automatically syncing back to the cloud when internet returns.
   - **Direct POS Hardware Integration:** Communicates directly with thermal receipt printers (ESC/POS), hardware barcode scanners, cash drawers, and electronic weighing scales over USB or Serial ports without browser print-dialog delays.

3. **Native macOS Desktop Application (`.dmg` / `.app`) [Future Scope]**
   - A dedicated Apple macOS desktop package for pharmacy owners and managers operating Mac hardware (Apple Silicon M1/M2/M3/M4 & Intel).
   - Features native macOS menu bar integration, system notifications, and built-in Marg ERP keyboard parity tailored to Mac keyboard layouts (`Option ⌥`, `Command ⌘`, `Cmd + Enter`).

4. **Mobile Companion Application (iOS & Android) [Future Scope]**
   - A dedicated mobile app for pharmacy owners, partners, and store managers.
   - **Planned Capabilities:**
     - **Live Store Dashboard:** Real-time counter sales, customer footfall, gross margin, and cash register float tallies.
     - **Inventory Audits & Camera Scanner:** Use the phone camera as a barcode scanner for physical rack stocktaking and shelf counts.
     - **Critical Alerts:** Instant push notifications for near-expiry batches, critical low-stock thresholds, and promise order arrivals.
     - **Customer Khata & Reminders:** Review patient credit balances and send WhatsApp payment reminders directly from your phone.
     - **Purchase & Delivery Approvals:** Approve purchase orders and distributor bills remotely.

---

### 19.2 Other Planned Roadmap Features

These features are part of upcoming development phases and are planned for future release:

| Area | Planned feature | Status |
|---|---|---|
| Billing | Offline counter billing with IndexedDB/SQLite sync (Phase 4) | Backend sync API (A4.1–A4.3) and Browser offline DB & sync engine (A4.4) completed; PWA shell & POS offline mode UI next (A4.5–A4.6) |
| Platforms | Native Windows desktop `.exe` installer (via Tauri) | In Roadmap (Phase 4) |
| Platforms | Native macOS desktop `.dmg` application | Future Scope |
| Platforms | Mobile companion app (iOS & Android) for store owners | Future Scope |
| Stock | Stock adjustments and write-offs; warehouse transfers; physical stock count | In Roadmap (Phase 3) |
| Buying | Automated reorder suggestions based on sales velocity | In Roadmap (Phase 3) |
| People & security | Password reset by email; custom permissions; email invitation delivery | In Roadmap |
| Multi-branch | Adding branches; branch switcher; chain-wide consolidated reports | In Roadmap (Phase 3) |
| Accounts | Operational overhead expenses; period locking; year-end closing | In Roadmap (Phase 5) |
| GST & messaging | Live GSP/ASP e-invoice and e-way bill with government portal; GSTR-2B matching | In Roadmap (Phase 5) |
| Setup | Import wizard for data from Marg or other software; guided onboarding | In Roadmap (Phase 4 / 6) |

---

## 20. Glossary

| Term | Meaning |
|---|---|
| **Batch / lot** | A production run of a medicine with its own batch number and expiry. Stock is counted per batch. |
| **MRP** | Maximum Retail Price printed on the pack, GST included. |
| **PTR** | Price to Retailer: what you pay the supplier, before GST. |
| **GRN** | Goods Received Note: recording a supplier delivery/bill into stock. |
| **Free quantity** | Extra units a supplier gives, e.g. buy 10 get 1 free. |
| **Landed cost** | The true cost per unit after discounts and free units. |
| **Schedule H / H1 / X** | Categories of prescription medicines with legal record-keeping rules. H1 and X are the strictest. |
| **Register** | The legal log of scheduled medicines you dispensed. |
| **Rx** | A doctor's prescription. |
| **GSTIN** | 15-character GST registration number. The first 2 digits are the state. |
| **HSN** | Product classification code (medicines are mostly 3003/3004). |
| **CGST + SGST** | GST for sales within a state, split equally. |
| **IGST** | GST for sales between states. |
| **GST 2.0** | Rate change from 22 Sep 2025: most medicines moved from 12% to 5%. |
| **ITC** | Input Tax Credit: GST you paid on purchases that you can set off against GST on sales. |
| **GSTR-1 / GSTR-3B** | Monthly GST returns: sales detail / summary and payment. |
| **IRN / e-invoice** | A government-registered number for B2B invoices. |
| **E-way bill** | A permit for moving goods worth over ₹50,000. |
| **B2B / B2C** | Sale to a business with a GSTIN / sale to an ordinary consumer. |
| **Trial balance** | List of all account balances; debits must equal credits. |
| **Day book** | Chronological list of all accounting entries. |
| **Outstanding / ageing** | Money owed, grouped by how long it's overdue. |
| **Promise order** | A request for a medicine you don't currently have. |
| **Omnichannel order** | An order that arrives from an app or website. |
| **Medical rep (MR)** | A pharma company's representative; may earn commission. |
| **Role** | The set of things a staff login is allowed to do. |
| **Financial year** | 1 April to 31 March; invoice numbering restarts each year. |
| **Device Code** | A unique 2-digit identifier (`01`–`99`) assigned to each physical POS counter terminal to isolate its offline invoice series under GST Rule 46(b). |
| **Device Token** | A secure, one-time Bearer token used by POS counter devices to authenticate with MediFlow synchronization endpoints. |
| **Number Reservation Block** | A pre-allocated range of sequential invoice numbers granted to an offline counter terminal so it can issue gap-free bills without contacting the server. |
| **Stock Reconciliation (Offline)** | Server handling of offline sales where a bill is accepted even if shelf stock temporarily went negative during a network outage, accompanied by an automatic conflict notification for store management. |
