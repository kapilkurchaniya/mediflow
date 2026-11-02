# MediFlow — Discovered Bugs, Deficiencies & Issues Audit

> **Audit Date:** November 2026  
> **Audited Viewports:** Desktop (`1440x900`), Tablet (`768x1024`), Mobile (`375x812`)  
> **Methodology:** Automated Playwright headless exploration + Static Code Inspection + DOM Overflow Analysis  

---

## 1. Issue Summary Matrix

| ID | Module / Route | Problem Summary | Priority | Category | Evidence |
| :--- | :--- | :--- | :---: | :--- | :--- |
| **BUG-01** | `/dashboard/sales/[id]/print` | Thermal & Invoice print views lack `@media print` CSS resets | **High** | UI / Print | `09-sales-x-report-print-desktop.png` |
| **BUG-02** | `/dashboard/sales/pos` | POS Billing Counter breaks layout on mobile viewports ($\le 768\text{px}$) | **High** | Responsiveness | `06-sales-pos-mobile.png` |
| **BUG-03** | `/dashboard/sales/register` | Z-Report Cash variance reconciliation lacks supervisor override PIN | **Medium** | Business Logic | `08-sales-register-desktop.png` |
| **BUG-04** | Global Data Tables | Horizontal scroll lack visual overflow indicator / cue on mobile | **Medium** | UI / UX | `14-inventory-batches-mobile.png` |
| **BUG-05** | `/dashboard/inventory` | Catalog queries lack cursor-based pagination for large inventories | **Medium** | Performance | `12-inventory-medicines-desktop.png` |
| **BUG-06** | Empty States Global | Read-only RBAC users see mutation action buttons on empty tables | **Medium** | RBAC / Auth | `20-purchases-list-desktop.png` |
| **BUG-07** | `/dashboard/settings/whatsapp` | Broadcast & Refill triggers fail silently when cloud API unconfigured | **Medium** | Integration | `78-whatsapp-broadcast-desktop.png` |
| **BUG-08** | `/dashboard/purchases/reorder`| Reorder suggestions trigger in loose units rather than full pack units | **Low** | Supply Chain | `25-purchases-reorder-desktop.png` |
| **BUG-09** | Global Header / Client | Dev HMR WebSocket handshake triggers console errors on navigation | **Low** | Developer Exp | `audit-results.json` console log |
| **BUG-10** | Search Input Elements | Text search filters trigger queries on each keystroke without debounce | **Low** | Performance | `31-customers-list-desktop.png` |

---

## 2. Detailed Bug Reports

### BUG-01: Thermal Print & Invoice Views Lack Dedicated Print Media Queries
* **Page & Route:**
  - `/dashboard/sales/[id]/print`
  - `/dashboard/sales/register/x-report/print`
  - `/dashboard/sales/register/z-report/[id]/print`
  - `/dashboard/compliance/[register]/print`
* **Description:**
  When a pharmacist triggers browser print (`Ctrl + P` or the Print button) on thermal slips or statutory register reports, the browser prints default page headers, footers (URL, page numbers, date), background shadows, and variable paper margins. On thermal receipt printers (80mm/58mm rolls like Epson TM-T82 or TVS RP3200), this causes receipt content to scale down awkwardly or print across multiple paper cuts.
* **Evidence:**
  Captured in `AUDIT/screenshots/09-sales-x-report-print-desktop.png`.
* **Expected Behavior:**
  A print-specific stylesheet (`@media print`) should remove browser margins, eliminate background box-shadows, set page width strictly to `80mm` (or `210mm` for A4 compliance registers), hide screen navigation controls, and ensure high-contrast thermal black rendering (`#000000`).
* **Actual Behavior:**
  The print view displays screen buttons ("Print", "Back to Register") and uses desktop screen padding (`p-6`) without CSS `@page { margin: 0; size: 80mm auto; }`.
* **Priority:** **High**
* **Recommended Solution:**
  Add a global thermal print utility in `src/app/globals.css` or dedicated print component wrapper:
  ```css
  @media print {
    @page { size: 80mm auto; margin: 0; }
    body { margin: 0; padding: 4mm; background: #fff !important; }
    .no-print, header, nav, button { display: none !important; }
    .thermal-receipt { width: 72mm !important; font-size: 11px !important; }
  }
  ```

---

### BUG-02: POS Billing Counter Layout Collapse on Mobile & Small Tablets
* **Page & Route:** `/dashboard/sales/pos`
* **Description:**
  The POS billing screen is optimized as a dual-pane desktop counter (Cart Table on left, Order Summary / Payment Tender on right). On mobile viewports (`375x812`), the dual columns stack into a long vertical page, pushing the Tender Amount, Payment Mode, and "Complete Sale" button completely off-screen below the fold. Furthermore, keyboard shortcuts (`F2`, `F8`, `F9`, `F10`) are unpressable on mobile touchscreens without on-screen floating action buttons.
* **Evidence:**
  Captured in `AUDIT/screenshots/06-sales-pos-mobile.png`.
* **Expected Behavior:**
  On screens $< 1024\text{px}$, POS should either:
  1. Present a bottom sticky sheet / bar displaying Total Bill Amount, item count, and a prominent "Tender & Pay" button.
  2. Switch to a mobile-optimized tabbed view (`[ 1. Items ] [ 2. Bill & Payment ]`).
* **Actual Behavior:**
  Desktop flex grid (`grid-cols-1 xl:grid-cols-3`) stretches horizontally and stacks, requiring extensive vertical scrolling between adding an item and hitting "Complete Sale".
* **Priority:** **High**
* **Recommended Solution:**
  Implement responsive drawer / bottom sticky bar for mobile viewports in `src/app/dashboard/sales/pos/page.tsx` with clear touch targets.

---

### BUG-03: Cash Register Shift Discrepancy Reconciliation Lacks Supervisor PIN Override
* **Page & Route:** `/dashboard/sales/register`
* **Description:**
  When a cashier closes a shift on the cash register and counts the physical drawer, if there is a cash shortage or excess exceeding normal tolerance (e.g. $> ₹500$), the system accepts the closing immediately with just a text note.
* **Evidence:**
  Captured in `AUDIT/screenshots/08-sales-register-desktop.png`.
* **Expected Behavior:**
  In pharmacy retail operations, cash shortages exceeding a configured threshold must require supervisor / owner authentication (PIN or password confirmation) before closing the shift to prevent unverified drawer discrepancies.
* **Actual Behavior:**
  Any user with `cash.manage` can close the shift with arbitrary discrepancies without secondary authorization.
* **Priority:** **Medium**
* **Recommended Solution:**
  Add supervisor PIN modal prompt in `src/app/dashboard/sales/register/page.tsx` when `Math.abs(actualCash - expectedCash) > threshold`.

---

### BUG-04: Multi-Column Data Tables Missing Horizontal Overflow Indicators on Mobile
* **Page & Route:**
  - `/dashboard/inventory/batches`
  - `/dashboard/inventory`
  - `/dashboard/accounting/trial-balance`
  - `/dashboard/compliance/schedule-h1`
* **Description:**
  The tables contain 8 to 11 columns (`Item`, `Batch`, `Expiry`, `PTR`, `MRP`, `Value`, `On hand`, `Actions`). On mobile (`375px`), the content renders cleanly with `overflow-x-auto`, but there is no visual cue (such as an edge gradient fade or sticky first column) to inform users that additional data and action buttons exist to the right.
* **Evidence:**
  Captured in `AUDIT/screenshots/14-inventory-batches-mobile.png`.
* **Expected Behavior:**
  The first column (`Item Name`) should remain sticky (`sticky left-0 bg-white shadow-r`), or a subtle right-edge fade indicator should prompt the user to swipe horizontally.
* **Actual Behavior:**
  Action buttons (`Edit`, `View`) are pushed off-screen to the right and appear cut off without visual feedback.
* **Priority:** **Medium**
* **Recommended Solution:**
  Apply `sticky left-0 bg-white z-10` to the primary column or add a CSS shadow fade on mobile table containers.

---

### BUG-05: Catalog Data Queries Lack Cursor-Based Pagination
* **Page & Route:**
  - `/dashboard/inventory`
  - `/dashboard/customers`
  - `/dashboard/suppliers`
* **Description:**
  The pages fetch records using fixed `limit(50)` without forward/backward pagination controls or infinite scroll.
* **Evidence:**
  Captured in `AUDIT/screenshots/12-inventory-medicines-desktop.png` and `31-customers-list-desktop.png`.
* **Expected Behavior:**
  Pharmacies frequently maintain 10,000 to 50,000 active medicines. The listing table should include pagination controls (`Page 1 of 240`, Next / Previous) or cursor-based infinite scrolling.
* **Actual Behavior:**
  Only the initial 50 records are accessible; records past index 50 can only be retrieved by typing specific search queries.
* **Priority:** **Medium**
* **Recommended Solution:**
  Introduce URL-based pagination (`?page=1&limit=50`) and render a standardized `<Pagination />` component at the bottom of data tables.

---

### BUG-06: Read-Only RBAC Users See Action Buttons on Empty States
* **Page & Route:**
  - `/dashboard/purchases`
  - `/dashboard/suppliers`
  - `/dashboard/inventory`
* **Description:**
  When a table has zero rows, the `<EmptyState />` component renders an action button (e.g. "+ Record purchase" or "+ Add supplier"). If a user with read-only permissions (such as a cashier or auditor) visits the page, they still see and can click the mutation button, leading to a server-side RBAC 403 authorization error alert.
* **Evidence:**
  Captured in `AUDIT/screenshots/20-purchases-list-desktop.png`.
* **Expected Behavior:**
  The empty state action button should be conditionally rendered based on whether the current user's session possesses the required permission (`purchases.create`, `suppliers.manage`).
* **Actual Behavior:**
  Action buttons are rendered unconditionally.
* **Priority:** **Medium**
* **Recommended Solution:**
  Pass user permissions or permission key to `<EmptyState actionPermission="purchases.create" />` and omit the action button when unauthorized.

---

### BUG-07: WhatsApp Broadcast & Refill Triggers Lack Web WhatsApp Direct Fallback
* **Page & Route:**
  - `/dashboard/whatsapp`
  - `/dashboard/reminders`
* **Description:**
  When a pharmacy has not configured Meta Cloud API credentials (phone number ID, permanent token), attempting to send automated customer reminders or invoices either displays an API error or fails silently.
* **Evidence:**
  Captured in `AUDIT/screenshots/78-whatsapp-broadcast-desktop.png`.
* **Expected Behavior:**
  If Cloud API credentials are not active, the system should offer a one-click **"Send via Web WhatsApp"** fallback button generating a `https://wa.me/91XXXXXXXXXX?text=...` URL, allowing the pharmacist to send the bill or refill reminder directly through WhatsApp Web on their counter PC.
* **Actual Behavior:**
  Broadcast is disabled completely unless enterprise Cloud API is provisioned.
* **Priority:** **Medium**
* **Recommended Solution:**
  Add a dual-mode trigger: Cloud API (automated) with fallback to `https://wa.me/` link generator when unconfigured.

---

### BUG-08: Reorder Suggestions Engine Triggers in Loose Units Rather than Pack Sizes
* **Page & Route:** `/dashboard/purchases/reorder`
* **Description:**
  The automated reorder engine calculates stock replenishment based on daily unit sales run rates and suggests ordering exact loose quantities (e.g., "Order 43 tablets"). In pharmaceutical wholesale distribution, distributors only sell in full commercial packaging (e.g., Strips of 10, Boxes of 100, Bottles).
* **Evidence:**
  Captured in `AUDIT/screenshots/25-purchases-reorder-desktop.png`.
* **Expected Behavior:**
  Suggested reorder quantities should round up to the nearest distributor packaging unit (`Math.ceil(suggestedLooseQty / unitsPerPack)`).
* **Actual Behavior:**
  Reorder engine passes fractional / loose quantities to Purchase Orders.
* **Priority:** **Low**
* **Recommended Solution:**
  Update `src/server/domain/purchasing/reorder.ts` to divide suggested replenishment by `unitsPerPack` and round up to whole packs.

---

### BUG-09: Next.js Dev HMR WebSocket Handshake Console Warnings
* **Page & Route:** Global Client Navigation (All pages)
* **Description:**
  Client console logs `WebSocket connection to 'ws://127.0.0.1:3000/_next/hmr?...' failed: Error during WebSocket handshake`.
* **Evidence:**
  Logged across 80% of navigated routes in `scratch/audit-results.json`.
* **Expected Behavior:**
  Zero browser console errors during navigation.
* **Actual Behavior:**
  Harmless Next.js development-mode hot module reloading handshake mismatch caused by local proxy bindings.
* **Priority:** **Low**
* **Recommended Solution:**
  Ensure Next.js development server is started with explicit port and host configuration (`next dev -H 127.0.0.1 -p 3000`).

---

### BUG-10: Search Input Elements Missing Debounce Threshold
* **Page & Route:**
  - `/dashboard/customers`
  - `/dashboard/inventory`
* **Description:**
  Typing rapidly into client search inputs triggers a URL search parameter update on every keystroke, causing rapid successive server component re-renders.
* **Evidence:**
  Captured in `AUDIT/screenshots/31-customers-list-desktop.png`.
* **Expected Behavior:**
  Search queries should debounce for 250ms–300ms before triggering navigation/server action requests.
* **Actual Behavior:**
  Every letter typed pushes a new router state.
* **Priority:** **Low**
* **Recommended Solution:**
  Wrap search input handlers in a standard `useDebounce` (300ms) hook.

