# MediFlow User Manual

**For pharmacy owners, managers, pharmacists, cashiers, purchase staff and accountants.**

This manual teaches you how to run your pharmacy in MediFlow: how to bill a customer, add medicines and stock, buy from suppliers, keep your legal registers, file GST and read your reports. You don't need any technical knowledge.

> **Testing the app instead of using it?** Use [MANUAL_TESTING.md](MANUAL_TESTING.md). This file is the "how do I use it" guide.

---

## Contents

1. [What MediFlow does](#1-what-mediflow-does)
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
19. [Not available yet](#19-not-available-yet)
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

---

## 2. Getting started

### 2.1 Signing in

1. Open MediFlow in your browser.
2. Type your **Email address** and **Password**, then press **Sign in**.
3. You land on the **Overview** (dashboard).

If the email or password is wrong you'll see *Invalid email or password*. If you aren't signed in and open any page, MediFlow sends you to the sign-in screen first and brings you back afterwards.

To leave, press the **Sign out** icon at the bottom of the left menu, next to your name.

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
| **Owner** | Pharmacy owner | **Everything**, including Settings. Only the owner opens *Settings* (profile, WhatsApp, SMS, API keys). |
| **Store Manager** | Branch manager | Everything except Settings, user/store management, API keys and all-store reports. Can approve large discounts and export data. |
| **Pharmacist** | Registered pharmacist | Billing, medicines, racks, customers, prescriptions and doctors, WhatsApp and reminders, AI assistant, view sales and stock. |
| **Cashier** | Counter staff | Billing, view stock, customers (add and view), WhatsApp and reminders. Cannot see accounts, GST, purchases or reports. |
| **Purchase Manager** | Buyer | Suppliers, purchases, medicines, racks, trade schemes, reports, AI assistant, view stock and legal registers. No billing. |
| **Accountant** | Accounts / CA | Accounting, GST, reports, view sales and purchases, export data. No billing. |
| **Auditor** | Inspector / external CA | **View only**: reports, accounting, GST, sales, purchases, registers. Cannot change or export anything. |

Examples of what a role does **not** see:
- A cashier won't see *Accounting*, *GST & Tax*, *Purchases* or *Reports* in the menu.
- Only the owner and manager can enter **opening stock** or use **Bulk import**.
- Discounts above your pharmacy's limit need owner or manager approval.

> **Not available yet:** the screen to create staff logins, assign roles, and limit people to certain branches. For now accounts are created by your administrator.

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
8. **Payment Method:** choose **Cash**, **UPI** or **Card**.
9. Check the summary: **Subtotal (Gross)**, **Discount**, **Taxable Value**, the GST split, **Round Off** (to the nearest rupee) and **Net Payable**.
10. Press **Complete & Print (₹ amount)**.

When it succeeds, the invoice opens and can be printed. To start the next bill press **F2** (or **Clear (F2)**; you'll be asked to confirm because it empties the current bill).

**Audio:** a small beep confirms each scan and a chime confirms a completed bill. Use the speaker icon at the top to mute it.

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

> **Not available yet:** cancelling a bill, returning items / credit notes, split payments (part cash, part UPI), holding a bill to finish later, and the cash-register shift. See [chapter 19](#19-not-available-yet).

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

**Inventory → Item master** lists **Item, Category, Rack, Pack, HSN / GST, MRP, Sale price, Status**. Search by name, composition or barcode.

### 6.4 Racks and shelves

**Inventory → Racks & shelves → Add Rack / Shelf.** Give a **Rack / Shelf Code** (e.g. *R1-S3*; saved in capitals), a **Name** (*Front Counter Shelf Top*) and an optional description. You can edit or delete a rack (you'll be asked to confirm; medicines on it become "no rack"). Codes must be unique in your store.

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

### 7.3 Looking back at purchases

**Operations → Purchases (GRN)** lists **Supplier invoice, Date, Supplier, Taxable, GST, Total, Status**. Search by invoice number or supplier. Open one to see **Inward Medicine Batches** (medicine, batch, expiry, billed qty, free qty, rate, MRP, GST %, line total). **Export** downloads the list (owner, manager, accountant).

> **Not available yet:** purchase orders, returning goods to a supplier (debit notes), paying a supplier and seeing a supplier ledger, and reorder suggestions. See [chapter 19](#19-not-available-yet).

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

### 13.1 Bank reconciliation

**Finance → Bank reconciliation** matches your bank statement to the payments recorded in MediFlow.

1. **Upload Bank Statement CSV:** choose the **Bank Name** (HDFC, ICICI, State Bank of India, Axis, or *Other / Standard CSV*), **Account Number** and **Statement Date**, then paste the statement's CSV text (date, description, debit, credit, balance).
2. Let it **auto-match**, or link a line yourself with **Link System Payment**. You can unmatch a mistake.

> Recording payments you receive from customers and pay to suppliers (receipt and payment vouchers) is **not available yet**, so most lines will stay unmatched for now.

> **Not available yet:** recording expenses (rent, salaries), closing a period so old entries can't change, and aged receivables with reminders.

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
Racks ([6.4](#64-racks-and-shelves)), Trade schemes ([6.8](#68-trade-schemes)), Loyalty ([8.3](#83-setting-up-the-rewards-loyalty-programme)), Medical reps ([8.5](#85-medical-representatives-and-commission)), WhatsApp and SMS ([chapter 11](#11-whatsapp-and-sms)). Several of these appear in other menu sections; each is visible only to the roles that may use it. A shop-wide **maximum discount** (see [5.5](#55-discounts)) is currently set by your administrator.

### 15.3 API keys for connected apps
For a website or partner app that checks your stock or sends you orders. This page isn't in the menu; your administrator opens `/dashboard/settings/api-keys`.

1. Enter a **Key name** and tick what it may do: **stock.read** (read catalogue and stock), **orders.write** (create orders), **orders.read** (see orders). You may tie the key to one store.
2. Press create and **copy the key straight away** (it starts with `mf_live_`). It is shown **only once**.
3. The list later shows name, scopes, last-used and created dates. **Revoke** a key to stop it immediately.

Treat a key like a password; never share it by chat or email. The connected app sends it as `Authorization: Bearer mf_live_…`.

---

## 16. The AI assistant

Press **Ctrl + J** (or choose *Ask MediFlow AI* in the palette) to open a chat panel. Ask in plain English, for example:

- *"Which items are low in stock?"*
- *"Give me today's sales summary."*
- *"Is there an interaction between ibuprofen and aspirin?"*

It answers from your live data. If it hasn't been set up with an AI key, it will tell you so. It only shows **your** pharmacy's data. The assistant is available to the owner, manager, pharmacist and purchase manager. **Always double-check medical advice with a pharmacist**: the assistant is a helper, not a doctor.

---

## 17. Keyboard shortcuts

| Where | Keys | What they do |
|---|---|---|
| Anywhere | **Ctrl/⌘ + K** | Search or jump to any page |
| Anywhere | **Ctrl + B** | Collapse / expand the left menu |
| Anywhere | **?** | Show this list of shortcuts |
| Anywhere | **Ctrl + J** | Open / close the AI assistant |
| Anywhere | **Esc** | Close a window, panel or the search results |
| Billing | **F2** | Start a new / clear the bill |
| Billing | **F3** (or **Ctrl+F**, or **/**) | Jump to the medicine search box |
| Billing | **F4** | Quick-add a customer |
| Billing | **↑ / ↓**, then **Enter** | Choose a medicine from the search results |
| Billing | Barcode scanner | Scan a pack to add it to the bill |

---

## 18. Common questions and error messages

| You see… | What it means / what to do |
|---|---|
| *Invalid email or password* | Check both. Passwords are case-sensitive. |
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
| I made a mistake on a bill | Cancelling and returns are not available yet. Ask your manager how to handle it for now. |

**Good habits**
- Keep batch numbers and expiry dates exactly as printed on the pack.
- Record supplier bills the same day so stock and GST stay accurate.
- Check **Needs attention** and **Expiry exposure** every week.
- Print the Schedule H1 register for the month before any inspection.

---

## 19. Not available yet

These are planned but **cannot be used today**. If you can't find a button for them, that's expected.

| Area | Planned feature |
|---|---|
| Billing | Cancel a bill; sales returns and credit notes; split payment (cash + UPI); credit sales; hold and resume a bill; cash register open/close; using loyalty points as a discount; billing without internet |
| Stock | Stock adjustments and write-offs; transfers between branches; warehouse; physical stock count; reorder suggestions |
| Buying | Purchase orders; returning goods to suppliers (debit notes); paying suppliers; supplier ledger |
| People & security | Creating staff logins and roles from the screen; locking out repeated wrong passwords; changing your own password; activity (audit) log screen |
| Multi-branch | Adding branches; switching between branches; chain-wide reports |
| Accounts | Expenses; day-book drill-down and ledgers by party; receivables ageing with reminders; period locking; year-end closing |
| GST & messaging | Live e-invoice and e-way bill with the government portal; GSTR-2B / IMS matching; production WhatsApp and SMS rules; customer consent and privacy tools |
| Setup | Import wizard for data from Marg or other software; guided onboarding; one-click inspector and CA export packs; built-in help guides |

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
