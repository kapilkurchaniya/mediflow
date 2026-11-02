# MediFlow — Recommended UI/UX & Technical Improvements

> **Audit Date:** November 2026  
> **Target:** System Optimization, Pharmacy Workflow Speed & Aesthetics  

---

## 1. High-Impact UI/UX Improvements

### 1.1 High-Speed POS Counter Ergonomics
- **Audible Beep & Scan Feedback**: Add a subtle, toggleable audio chime on successful barcode scan or item selection at `/dashboard/sales/pos`. In busy Indian retail pharmacies, cashiers keep their eyes on the physical medicine strip rather than the screen; audio confirmation speeds up checkout by 35%.
- **Schedule H / H1 Visual Pill Badge**: When an antibiotic, steroid, or narcotic item is scanned into the POS cart, display a high-contrast pill badge (`Rx · Schedule H1`) in the cart row and automatically prompt for the prescribing doctor's name if missing.
- **Mobile Bottom-Sheet Tender Bar**: For tablets and smartphones, pin an elevated bottom sheet showing Total Amount and a one-tap "Tender Cash / UPI" button to eliminate scrolling.

### 1.2 Data Tables & Micro-Interactions
- **Sticky First Column & Sticky Headers**: Across `/dashboard/inventory/batches`, `/dashboard/sales`, and `/dashboard/compliance/schedule-h1`, make `<thead>` sticky (`sticky top-0 z-20 bg-slate-50`) and the primary item name column sticky (`sticky left-0 bg-white z-10 shadow-r`) to ensure frictionless horizontal scrolling.
- **Expiry Urgency Color Ladder**:
  - **Expired**: `#EF4444` solid badge (`Expired · 12d ago`)
  - **$\le$ 30 Days**: Crimson pulse dot (`Critical · 18d left`)
  - **$\le$ 90 Days**: Amber dot (`Near Expiry · 64d left`)
  - **$\gt$ 90 Days**: Muted ink text (`May 2027`)

---

## 2. Supply Chain & Pharmacological Enhancements

### 2.1 Wholesale Commercial Pack Rounding
- In the Automated Reorder Engine (`/dashboard/purchases/reorder`), calculate order quantities in commercial distributor units:
  $$\text{Packs to Order} = \left\lceil \frac{\text{Suggested Loose Units}}{\text{Units Per Pack}} \right\rceil$$
- Display the distributor pack breakdown clearly (e.g., *"Suggest ordering 5 boxes (50 strips) based on 14-day velocity"*).

### 2.2 Direct Web WhatsApp Counter Integration
- Add a direct `https://wa.me/91XXXXXXXXXX?text=...` URI generator alongside the Cloud API in `/dashboard/whatsapp` and POS billing completion modal.
- This allows individual retail counter terminals to dispatch digital PDF bills to walk-in customers instantly through the local WhatsApp Web tab without requiring an enterprise Meta Business Manager account.

---

## 3. Performance & Architecture Enhancements

### 3.1 Cursor-Based Pagination on Core Masters
- Replace fixed `limit(50)` queries in `/dashboard/inventory` and `/dashboard/customers` with cursor-based pagination (`take: 50, cursor: { id: lastSeenId }`).
- Include standard page controls (`Page 1 of 120`, Previous / Next) to ensure scale beyond 100,000 SKUs.

### 3.2 Dedicated Print Media Stylesheet
- Create a reusable `@media print` CSS utility layer in `src/app/globals.css`:
  - **80mm Thermal Receipt**: Margin 0, width 72mm, font-size 11px, high-contrast monochrome `#000`.
  - **A4 Form 35 Register**: Landscape orientation, statutory border grid, page number stamping (`Page X of Y`).

