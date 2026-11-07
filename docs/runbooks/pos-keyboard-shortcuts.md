# Mediflow Runbook: POS Counter Keyboard-Only Billing Flow

> **Applicability:** Retail POS Counters (`/dashboard/sales/pos`)  
> **Target Audience:** High-velocity retail pharmacists, cashiers, and implementation engineers.  
> **Ergonomic Objective:** 100% touchless, mouse-free counter operation matching Marg ERP / Busy keyboard speeds (sub-15 second bill turnaround).

---

## 1. High-Velocity Counter Workflow (Marg ERP Sequence)

```text
[Insert] Search Medicine
    │
    ▼
[↓ / ↑] Navigate Results  ──►  [Enter] Select Medicine & Batch
                                      │
                                      ▼
                        [Number] Set Pack Qty ──► [Tab] Loose Qty
                                      │
                                      ▼
                                [Enter] Commit Line to Cart
                                      │
                                      ▼ (Next item or finalize)
                              [F8] Open Tender & Payment
                                      │
                                      ▼
                      [Number] Enter Received Amount
                                      │
                                      ▼
                          [End] Finalize Bill & Print
```

---

## 2. Complete POS Keyboard Hotkey Reference

### 2.1 Navigation & Global Shortcuts
| Key | Action | Description |
|---|---|---|
| `Insert` / `F2` | **Focus Search** | Highlights product barcode / medicine search input from anywhere on screen. |
| `F8` | **Tender / Payment** | Opens tender calculation dialog with Cash, UPI, and Card split breakdown. |
| `F9` | **Hold Bill (Park)** | Holds active counter draft for later recall when a customer steps aside. |
| `F10` | **Recall Held Bills** | Opens list of parked counter sales to resume checkout. |
| `F12` / `Alt+F12` | **Counter Calculator** | Opens floating retail counter calculator with single-key result copying. |
| `F4` | **Substitutes** | Displays generic molecule matches for the currently highlighted item. |
| `F7` | **Sales Register** | Jumps directly to sales invoice history and returns. |
| `Ctrl+Shift+S` | **Switch Store** | Switches active branch/store for authorized multi-store pharmacists. |
| `?` / `F1` | **Shortcuts Sheet** | Displays interactive on-screen keyboard cheat sheet. |
| `Escape` | **Dismiss / Close** | Closes any open modal dialog or returns focus to search input. |

### 2.2 In-Cart Table Navigation
| Key | Action | Description |
|---|---|---|
| `↓` / `↑` | **Move Rows** | Navigate up and down through cart items. |
| `Enter` | **Edit Field** | Focuses and edits quantity, pack/loose units, or line item discount. |
| `Tab` | **Next Column** | Jumps from Pack Qty $\to$ Loose Qty $\to$ Discount $\to$ Batch override. |
| `Delete` | **Remove Line** | Removes highlighted medicine row from active cart. |
| `Alt+F` | **FEFO Switch** | Toggles First-Expiry-First-Out batch selection or selects older batch. |

---

## 3. High-Velocity Barcode Scanner Integration

- **Hardware Mode:** USB Barcode / 2D Scanner configured in **HID Keyboard Emulation Mode** with `Enter` (`\r` or `\n`) suffix.
- **Background Scan Bridge:** Scanners trigger instant batch lookups even if the input field is not actively focused.
- **Audio Feedback:** Synthetic Web Audio chime confirms successful scan without requiring the cashier to look away from medicines.

---

## 4. Crash Resilience & Draft Recovery

1. **Zero-Loss Guarantee:** Every keystroke and scanned line is continuously persisted to client-side IndexedDB with multi-tenant/store/cashier composite keys.
2. **Crash Remount:** If the browser tab is accidentally refreshed or an unhandled exception triggers the POS error boundary, selecting **"Recover Counter Session"** remounts the terminal and instantly restores all cart rows, quantities, customer loyalty selections, and statutory compliance entries.
3. **Clean Commit:** Draft carts are cleared from IndexedDB only upon verified invoice creation (`200 OK`) or explicit cashier reset (`RESET_SALE`).
