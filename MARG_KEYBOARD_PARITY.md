# Keyboard Parity with Marg ERP, and How to Beat It

> **Date:** 25 November 2026 · **Codebase audited at:** `main` @ `5de601a`
> **Companion:** `docs/MARG_ERP_COMPLETE_GAP_ANALYSIS.md` (row A19), `docs/MARG_COMPETITIVE_RESEARCH.md`
> **Goal:** a counter operator with years of Marg muscle memory sits at MediFlow and bills at full speed in the first hour, without MediFlow turning into a copy of Marg.
> **Platform (decided 25 Nov 2026):** MediFlow ships **only as a Tauri 2 desktop app**, on **Windows first, then macOS, and Linux where possible**. There is no web version. Every key decision below is made for the three desktop webviews: WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux. A browser tab is not a target.

---

## 0. Brief overview: what this file covers

| § | Section | What you get |
|---|---|---|
| 1 | **How Marg's keyboard model works** | The 8 rules behind Marg's keys. Copying the rules matters more than copying individual keys |
| 2 | **MediFlow's keyboard today** | Everything that actually works, read from code, plus **9 bugs and mismatches** found |
| 3 | **The complete Marg shortcut map vs MediFlow** | 140 rows covering every Marg shortcut found, by screen, each with MediFlow's equivalent and a status |
| 4 | **Desktop key capture on Windows, macOS and Linux** | Which keys each OS, webview or desktop environment takes before MediFlow sees them, and the fix for each |
| 5 | **Design: Marg-compatible, not Marg-shaped** | Two keymap profiles, one registry, and what we adopt, adapt or reject |
| 6 | **Target key map** | The proposed binding for every action, per profile, with reasons |
| 7 | **Where MediFlow beats Marg** | 15 keyboard and speed advantages Marg doesn't have |
| 8 | **Onboarding an ex-Marg operator** | First-hour plan |
| 9 | **Implementation plan** | Phases K0–K4, effort and files, plus a keyboard-only test spec |
| 10 | **Sources** | |

**Status legend used in §3**

| Mark | Meaning |
|---|---|
| ✅ | Same key, same job in MediFlow |
| 🔁 | MediFlow has the feature, on a different key or only by mouse |
| ⚠️ | Bound, but broken or does something else |
| ❌ | The feature itself is missing (key irrelevant until it's built) |
| 🚫 | Will not copy (reason given) |

**Evidence.** Marg keys come from Marg's official help page *"Marg Shortcut keys"* ([Marg Care #166661](https://care.margcompusoft.com/margerp/general-queries/166661/1/SHORTCU)) and the single-answer Marg Care pages listed in §10. A 2022 dealer/training list covers Transactions and Reports, which the official table doesn't ([computer-ability](https://computer-ability.blogspot.com/2022/07/shortcut-key-for-marg-erp.html)), and agrees with the official table wherever they overlap. A second dealer list repeats the official table row for row ([Anil Computers](https://www.anilcomputersudaipur.com/blogs/marg-shortcut-keys/988)). MargBooks, the cloud product, has its own list ([Marg Care MargBooks](https://care.margcompusoft.com/marg-books/dashboard-detailss/179187/9/marg-books-shortcut-keys)); where it differs from Marg ERP 9+ it is marked **(MB)**. Some keys vary between Marg versions; §10 of the gap analysis has a demo checklist to confirm them.

---

## 1. How Marg's keyboard model works

Marg feels fast because of a small set of rules applied everywhere, not because of any single key. An ex-Marg operator has internalised these rules, so these are what we must honour.

1. **Alt + letter opens a document from anywhere.** Alt+N sale, Alt+P purchase, Alt+C challan, Alt+A counter sale, Alt+M modify bill, Alt+V vouchers, Alt+L all ledgers, Alt+O outstanding, Alt+Q PDC, Alt+U cheque/cash.
2. **Ctrl + letter opens a list.** Ctrl+L ledgers, Ctrl+I items.
3. **Menu walking by letters.** Long sequences such as `Ctrl+J+U+I+A` (Control Room) or `Alt+R+M+U+S+S` (Structure) are menu accelerators pressed in sequence ([Marg Care #3039](https://care.margcompusoft.com/margerp/others/3039/1/null)). **Ctrl+J, "Switch over", is Marg's command palette.**
4. **Function keys depend on the screen, but follow a habit:** F2 = new/create, F3 = modify, F5 = index/sort, F10 = filter/"available only", Del = delete, F12 = calculator. Inside the sale bill, though, the F-keys mean something else (F4 bill discount, F9 old dealing, F10 tax detail).
5. **Field-level keys.** The same key does different things depending on the field the cursor is in. In the qty field: F2 tax status, F3 change deal/discount, `+` change margin, F7 lot rate. In the rate field: F5 or `*` change net rate.
6. **Enter moves forward, Esc goes back one level.** Ctrl+W or End saves from anywhere in a form ([Marg Care](https://care.margcompusoft.com/margerp/others/31536/1/What-is-the-shortcut-key)). Esc never jumps to the home screen in one press.
7. **One bill window changes mode.** Inside a sale bill: Ctrl+A → counter sale, Alt+Insert → cash challan, Ctrl+Y → purchase challan, Ctrl+D → stock receive, Ctrl+K → stock issue, `*` → return/breakage/replacement **on the same bill**.
8. **One selection grammar for every list or report.** Space toggles a row, `+` selects, `-` unselects, `*` selects all, `/` unselects all. Then Alt+P (or Ctrl+Y) prints or exports what's selected.

**Marg's weak points** (where §7 attacks):
- **No discoverability.** Keys are learned from colleagues, dealers or a PDF, and there's no on-screen key bar.
- **Inconsistent.** F2 has at least 6 meanings and F4 has 5.
- **Hostile to newcomers.** Multi-key menu sequences, "type *sure* to confirm".
- **No search tolerance.** Item search assumes you know how the name starts.
- **No customisation, and no feedback** on how operators actually work.

---

## 2. MediFlow's keyboard today

### 2.1 What actually works (read from code)

| Scope | Key | Action | Where |
|---|---|---|---|
| Global | Ctrl/Cmd+K | Command palette (navigation + 5 utilities) | `ShellContext.tsx:212`, `CommandPalette.tsx` |
| Global | Ctrl+B | Collapse sidebar | `ShellContext.tsx:219` |
| Global | Ctrl+Shift+S | Store switcher | `ShellContext.tsx:226` |
| Global | `?` / Ctrl+F1 | Shortcuts cheat sheet | `ShellContext.tsx:233` |
| Global | F12 / Alt+F12 | Calculator (**broken on POS**, see B3) | `ShellContext.tsx:240` |
| Global | Alt+N | POS (warehouse store → new transfer) | `ShellContext.tsx:249` |
| Global | Alt+P | New purchase (GRN) | `ShellContext.tsx:258` |
| Global | Alt+M | Sales register | `ShellContext.tsx:263` |
| Global | Alt+I | Inventory | `ShellContext.tsx:270` |
| Global | Alt+L | "Customers": **404**, see B2 | `ShellContext.tsx:275` |
| Global | F2 | Go to POS (off the POS page) | `Topbar.tsx:52` |
| Global | Ctrl+J | AI assistant | `AIAssistant.tsx:88` |
| Global | Esc | Close any shell modal | `ShellContext.tsx:283` |
| POS | F2 | New bill / reset (confirms if cart has lines) | `usePosShortcuts.ts` |
| POS | F3, Insert, `/` | Focus medicine search | `usePosShortcuts.ts` |
| POS | F4 | Go to cash register | `usePosShortcuts.ts` |
| POS | F6 / F7 | Park bill / recall parked bills | `usePosShortcuts.ts` |
| POS | F8 | Payment / split tender (runs compliance check first) | `usePosShortcuts.ts`, `RetailPosTerminal.tsx:229` |
| POS | F9 | **Promise order** (cheat sheet says substitute, see B1) | `usePosShortcuts.ts`, `RetailPosTerminal.tsx:238` |
| POS | F10 / End | Complete sale (End only outside inputs) | `usePosShortcuts.ts` |
| POS | Ctrl+F1 | Cheat sheet | `usePosShortcuts.ts` |
| POS search | ↑ ↓ Enter Esc | Move through results / add batch / clear; ↓ with no results jumps to cart | `SearchBar.tsx:150–180` |
| POS cart | ↑ ↓ | Move between rows (↑ on first row → search) | `useCartKeyboard.ts:27–43` |
| POS cart | Delete / Backspace | Remove line | `useCartKeyboard.ts:45` |
| POS cart | `+` `-` | Change pack qty (row) or the focused qty field | `useCartKeyboard.ts:63–110` |
| POS cart | Enter | Row → pack qty → loose qty → back to search | `useCartKeyboard.ts:57,77` |
| Register | F4 / F8 / Ctrl+P or Alt+P / Esc | Open shift / close shift / print X-report / close | `RegisterClient.tsx:141–157` |
| Sale return | Alt+S or Ctrl+Enter | Save return | `ReturnForm.tsx:240` |
| Desktop | (scanner) | Keyboard-wedge scanner buffered and separated from typing | `desktop/hardware-bridge.ts:136–177` |

**Not keyboard-driven at all:** purchase entry (GRN), receipts/payments, ledgers, outstanding, reports, inventory list and batch screens, settings. Marg covers all of these by keyboard. The POS screen is the only place we're close.

### 2.2 Bugs and mismatches found

| # | Problem | Evidence | Fix |
|---|---|---|---|
| **B1** | F9 opens **Promise Order**, but the cheat sheet says "Substitute molecule / salt finder". The `onOpenSubstitutes` handler is defined but **never bound to a key**. | `usePosShortcuts.ts` (`case "F9"` → `onOpenPromiseModal`); `RetailPosTerminal.tsx:222` vs `:238`; `ShortcutsModal.tsx:26` | Bind substitutes (§6). Fix the sheet. |
| **B2** | Alt+L goes to `/dashboard/crm/customers`, **which doesn't exist** (there is no `crm` folder; customers live under `/dashboard/customers`). | `ShellContext.tsx:275` | Point it at ledgers (§6). |
| **B3** | **F12 does nothing on POS.** The shell listener and the POS listener both toggle `calculatorOpen` on the same keypress, so they cancel out. | `ShellContext.tsx:240` + `usePosShortcuts.ts` (`case "F12"`), both on `window`, neither stops propagation | One dispatcher (K1). Quick fix: drop F12 from `usePosShortcuts`. |
| **B4** | On the Register page, Alt+P means "print X-report", but the global Alt+P also navigates to New Purchase, and both fire. | `RegisterClient.tsx:151` vs `ShellContext.tsx:258` | Scoped dispatcher: screen scope wins over global. |
| **B5** | **The in-app Help gives wrong keys:** "F8 to park, Alt+P to recall" (actually F6 / F7, and Alt+P = purchase); "F4 or Ctrl+Enter" for payment (F4 = register, F8 = payment); "Alt+H" sales history and "Alt+S" (neither exists on POS). | `help/catalog.ts:52,66–72` | Generate help text from the keymap registry (K1). |
| **B6** | Three separate hand-written key lists (cheat sheet, help catalog, tooltips) have drifted from the code. | `ShortcutsModal.tsx`, `help/catalog.ts`, `GlobalTooltipLayer.tsx` | One registry → all three (K1). |
| **B7** | 25 files each add their own `window` keydown listener, with no scope or priority, so conflicts (B3, B4) are inevitable. | `grep keydown src` → 25 files | K1. |
| **B8** | Alt+letter is matched on `e.key`. On macOS, Option+P gives `π`, so the Alt shortcuts fail for Mac owners. | `ShellContext.tsx:248` (`e.key.toLowerCase()`) | Match on `e.code` (`KeyP`). |
| **B9** | The cheat sheet's first group is titled **"Marg ERP Counter Billing"**: a competitor's trademark in our UI. | `ShortcutsModal.tsx:16` | Rename to "Counter billing (classic keys)". |

---

## 3. The complete Marg shortcut map vs MediFlow

### 3.1 Hot keys (work from any screen)

| Marg key | Marg action | MediFlow today | Status |
|---|---|---|---|
| F1 | Change company | Ctrl+Shift+S store switcher | 🔁 |
| Ctrl+U | Change user | Log out, log in | 🔁 (slow on a shared counter PC) |
| Ctrl+J | Switch over (jump anywhere) | Ctrl+K palette; **Ctrl+J = AI** | 🔁 key clash |
| F12 | Calculator | F12 (broken on POS: B3) | ⚠️ |
| Shift+F12 | Calendar | — | ❌ (low value) |
| Ctrl+F1 | Personal directory | Ctrl+F1 = cheat sheet | 🔁 different meaning |
| Ctrl+F11 | Printer setup | Settings › Printers (mouse) | 🔁 |
| Ctrl+F12 | Standard narration | — | ❌ |
| Ctrl+F9 | Bill adjustments (adjust receipts against bills by ref.) | Receivables (mouse) | 🔁 |
| Ctrl+7 | Data entry | — | ❌ |
| Ctrl+F3 | Modify vouchers | Sales register (Alt+M) for sales only | 🔁 |
| Ctrl+F7 | Re-enter invoice data by invoice no. | — | ❌ |
| Ctrl+S | Flush memory / refresh | Nothing. F5 / Ctrl+R reload the whole webview on Windows, which can wipe the screen state (§4) | ❌ |
| Ctrl+Q | Quit | Log out (mouse) | 🔁 |
| Ctrl+W / End | Save anything | F10 / End on POS only; Alt+S on returns | 🔁 partly. Ctrl+W is free in the desktop app (no tabs), so we can adopt it. Mac laptops have no End key (§4) |
| Esc | Back one step | Closes modals; no "back one level" in forms | 🔁 partly |
| Alt+Esc | Minimise Marg | OS-level | 🚫 not ours |
| Alt+X | Shut company | — | 🚫 (no "company open" concept) |
| F11 (gateway) | Search tab | Ctrl+K | 🔁 |

### 3.2 Home and navigation

| Marg key | Marg action | MediFlow today | Status |
|---|---|---|---|
| Alt+N / F2 | Sale bill | Alt+N / F2 → POS | ✅ |
| Alt+A | Counter sale | POS (no separate counter-sale mode) | 🔁 add Alt+A alias |
| Alt+C | Sale challan | — | ❌ (no challans) |
| Alt+Insert | Cash challan | — | ❌ |
| Alt+M | Modify bill | Alt+M → sales register | ✅ |
| Alt+P | Purchase bill | Alt+P → new GRN | ✅ (conflict on Register: B4) |
| Alt+V | All voucher entry | — | ❌ (no manual vouchers: gap F1) |
| Alt+I | Single entry (accounts) | Alt+I = **Inventory** | 🔁 different meaning |
| Alt+U | Cheque/cash | — | ❌ |
| Alt+Q | P.D. cheque/cash (also "outstanding of parties" in older list) | — | ❌ (no PDC: gap F4) |
| Alt+L | All ledgers | Alt+L → 404 | ⚠️ (B2) |
| Alt+O | All debtors outstanding | Receivables (mouse) | 🔁 |
| Ctrl+L | Ledger list | Ledger page (mouse) | 🔁 |
| Ctrl+I | Item list | Alt+I → inventory | 🔁 |
| Alt+Alt+Insert | Passwords & powers | Settings › Roles (mouse, read-only) | 🔁 |
| Alt+Alt+X / Alt+Alt+L | New ledger / new group | — | 🔁 / ❌ |
| Ctrl+J+U+I+A | Control Room | Settings (mouse) | 🔁 |
| Ctrl+J+U+H | Self Format | Settings › billing templates (mouse) | 🔁 |
| Ctrl+J+B | Balance sheet | Accounting › Balance sheet (mouse) | 🔁 |
| Alt+R+M+U+S+S / …+J | Structure / Junk verification (data repair) | — | 🚫 (Postgres constraints make "junk verification" unnecessary) |
| **(MB)** Alt+H / Ctrl+H | Dashboard / settings | Sidebar | 🔁 |
| **(MB)** Alt+R / Ctrl+F2 | Receipt / payment | Receipts page; supplier pay (mouse) | 🔁 |
| **(MB)** Alt+B | Cash & bank book | Day book / ledger (mouse) | 🔁 |
| **(MB)** Alt+K / Alt+U | Stock issue / stock receive | Stock adjust / transfers (mouse) | 🔁 |
| **(MB)** Alt+X | Breakage/expiry receive | — | ❌ (gap B5) |
| **(MB)** Ctrl+F1 | Re-order | Purchases › Reorder (mouse) | 🔁 |

### 3.3 Sale bill: window and bill-level keys

| Marg key | Marg action | MediFlow today | Status |
|---|---|---|---|
| F2 | Open another sale bill (while billing) | F2 = reset current bill | 🔁 **different meaning, can lose work**: Marg users expect the current bill to survive |
| Tab, End, Ctrl+W | Save bill | F10 / End (outside inputs) | 🔁 partly |
| Ctrl+W (in item window) | Pick all needed items at once | — | ❌ (multi-select add) |
| Left arrow | Change bill number | — | 🚫 GST Rule 46 gap-free numbering; numbers are system-assigned |
| Ctrl+R | Load tax / change rate calculation | — | ❌ |
| F4 | Bill discount | F4 = cash register | 🔁 clash (discount is in the payment panel) |
| F5 | Selected party (ledger) detail | Customer picker shows balance | 🔁 |
| F6 | Toggle old/new rate | F6 = park | 🔁 clash (no old/new rate concept) |
| F7 | Data entry window | F7 = recall parked | 🔁 clash |
| F8 | Multi-rate change window | F8 = payment | 🔁 clash |
| F9 | Old dealing (this party's past purchases of the item) | F9 = promise order | ❌ feature missing + ⚠️ (B1) |
| F10 | Tax detail | F10 = **complete sale** | 🔁 **dangerous clash**: an ex-Marg user checking tax will finalise the bill |
| Alt+F10 | Profit in billing window | — | ❌ (needs cost permission) |
| F11 | Return-cash (change) calculator | Change due shown automatically in payment panel | ✅ better |
| Ctrl+Home | Feed item shortage while billing | Promise order (F9) / "Promise Order" on out-of-stock | 🔁 |
| Ctrl+F2 | Working style: Manual / Self / FIFO batch pick | Auto-FEFO + FEFO override modal | 🔁 |
| Ctrl+Tab | Batch detail of item | Batch chips in cart | 🔁 (key is free in the desktop app: adopt) |
| Shift+~ | Item cost / avg rate / profit | — | ❌ |
| Alt+L | Last deal of the item | — | ❌ |
| **(MB)** Alt+D | Last deal | — | ❌ |
| Alt+~ | Message window (bill remarks) | Notes field (mouse) | 🔁 |
| `*` | Return / breakage / replacement on the same bill | Separate return flow | ❌ (mixed bill) |
| `/` | Bill conversion (challan/order → bill) | `/` = focus search | 🔁 different meaning |
| Ctrl+P | Load pending (challans, brk/exp challans, orders) | External orders desk / promise orders (mouse) | 🔁 |
| Ctrl+T / Ctrl+Z | Copy bill / load quotation | — | ❌ (keys free in the desktop app) |
| Ctrl+O | Export / import bill | — | ❌ |
| Ctrl+N | MargPay digital collection | UPI QR only in mobile delivery | ❌ (key free in the desktop app) |
| Ctrl+A / Alt+Insert / Ctrl+Y / Ctrl+D / Ctrl+K | Switch bill to counter sale / cash challan / purchase challan / stock receive / stock issue | — | ❌ |
| Alt+F11 / Alt+F12 | Save / load item set | — (Alt+F12 = calculator) | ❌ + clash |
| Ctrl+F9 | Bill adjustments | — | ❌ |
| F11 (bill) | Save softcopy / PDF / mail / upload | Print page (mouse) | 🔁 |
| **(MB)** Ctrl+B | Fast scanning mode | Scanner always on (desktop bridge) | ✅ better |
| **(MB)** F7 (sale) | Create prescription (chemist) | Compliance panel opens automatically for Rx drugs | ✅ better |

### 3.4 Sale bill: field-level keys

| Marg key (field) | Marg action | MediFlow today | Status |
|---|---|---|---|
| F2 (qty) | Item tax status | GST shown in line | 🔁 |
| F3 (qty) | Change deal / discount | Line discount (mouse) | 🔁 |
| `+` (qty) | Change margin | `+` = qty +1 | 🔁 clash (ours is more natural) |
| FF (qty) | Scheme net rate | Scheme badge only | ❌ (sale schemes: gap A1) |
| F5 / `*` (rate) | Change net rate | Rate edit (mouse) | 🔁 |
| F7 (qty) | Lot rate | — | ❌ |
| Tab | Item rate / discount detail | — | ❌ |
| Enter | Next field | Enter: pack → loose → search | ✅ |

### 3.5 Item list (in billing and in masters)

| Marg key | Marg action | MediFlow today | Status |
|---|---|---|---|
| F2 / F3 / Del | Create / modify / delete item | Inventory › new / edit (mouse) | 🔁 |
| F4 | Item register (stock ledger) | Batch / movement pages (mouse) | 🔁 |
| F5 | Index (sort) | Column sort (mouse) | 🔁 |
| F6 | Old purchase rate | — | ❌ (must be cost-permission gated) |
| F7 / F8 | Filter by salt | Search includes salt; substitutes modal | 🔁 |
| **(MB)** F7 / F8 / F9 / Alt+F11 | Substitute / group / company / category filter | — | ❌ (filters in POS search) |
| F9 | Filter by company | — | ❌ |
| F10 | Only available stock | POS search shows in-stock batches by default | ✅ (no toggle) |
| Insert | Add/less stock | Stock adjust (mouse) | 🔁 |
| Ctrl+Tab | Item detail | Row click | 🔁 |
| `+` | Print barcode label | — | ❌ (gap B9) |
| Alt+`*` | Item rate advisor | — | ❌ |
| `*` **(MB)** | Mark shortage | — | ❌ (quick win Q12) |
| Alt+F1 | View shortcut keys | `?` / Ctrl+F1 | ✅ |
| Ctrl+O | Item filter | — | ❌ |

### 3.6 Ledger master

| Marg key | Marg action | MediFlow today | Status |
|---|---|---|---|
| Ctrl+L | Ledger window | Accounting › Ledger (mouse) | 🔁 |
| F2 | Month-wise ledger | Date filter (mouse) | 🔁 |
| F3 / Ctrl+V | Modify ledger | Customer / supplier edit (mouse) | 🔁 |
| F4 | Interest collection | — | ❌ (gap D2) |
| F6 | Ledger-wise adjustment (bill-by-bill) | Receivables allocation (mouse) | 🔁 |
| F8 | PDC of ledger | — | ❌ |
| F10 / Tab | Filter / search by balance, MR, route, group | — | ❌ |
| `+` | Print envelope | — | ❌ (low value) |
| Alt+F1 | Load challan value / current + last year together | — | ❌ |
| F11 | Reconcile | Bank reconciliation (mouse) | 🔁 |
| Ctrl+F1 | Ledger summary | — | ❌ |

### 3.7 Vouchers, cheques and books

| Marg key | Marg action | MediFlow today | Status |
|---|---|---|---|
| Alt+V | All voucher entry | — | ❌ |
| F2 / F3 / F4 / F5 / F6 / F7 (in voucher) | Switch to Payment / Receipt / Journal / Debit Note / Credit Note / Contra | Receipts and supplier pay are separate pages | ❌ (no journal, contra, DN or CN) |
| F11 (voucher) | Repeat last narration | — | ❌ |
| Alt+U / Alt+Q | Cheque/cash / PD cheque | — | ❌ |
| Books: F2 | Vouchers date-wise | Day book date filter (mouse) | 🔁 |
| Books: F9 | Who entered/changed the voucher | Audit log page (mouse) | 🔁 |
| Books: Alt+I | Duplicate voucher | — | ❌ |
| Books: F8 | View system journal behind a bill | Day book drill-down (mouse) | 🔁 |

### 3.8 Modify-bill window (sales register)

| Marg key | Marg action | MediFlow today | Status |
|---|---|---|---|
| F5 | Index bills | Column sort (mouse) | 🔁 |
| F6 | Bill status | Status chip | 🔁 |
| F9 | Audit bill | — | ❌ |
| F10 | Print bill | Reprint (mouse) | 🔁 |
| F11 | PDF / mail / upload | — | ❌ (WhatsApp share exists, by mouse) |
| F4 | Generate e-invoice / e-way bill | E-invoice page (mouse) | 🔁 |

### 3.9 Reports (all of them)

| Marg key | Marg action | MediFlow today | Status |
|---|---|---|---|
| F2 | Date range | Date pickers (mouse) | 🔁 |
| Space / `+` / `-` / `*` / `/` | Toggle / select / unselect / select all / unselect all | — | ❌ |
| Alt+P / Ctrl+Y | Print / view / Excel | Export button (mouse) | 🔁 |
| F3 / Ctrl+V / Del | Modify / delete underlying entry | Drill-down links (mouse) | 🔁 |
| F10 | Filter / colour lines | Filter bars (mouse) | 🔁 |
| F9 | Store-wise (main, scrap…) | Store scope selector | 🔁 |
| Alt+G | Graph | Some charts | 🔁 |
| Ctrl+F1 / `^` | Summary / ageing | Receivables ageing (mouse) | 🔁 |
| Alt+F2 | Opening balance in final reports | — | ❌ |
| F7 | Balance-only view / adjust | — | ❌ |
| `*` (stock report) | Shortage / orders | — | ❌ |

### 3.10 Company screen

| Marg key | Marg action | MediFlow | Status |
|---|---|---|---|
| F8 / Enter, F2, F3, F5, F6 | Select / create / modify / index / hidden companies | Store switcher (Ctrl+Shift+S); store settings | 🔁 |
| Alt+P | Licence info | Settings | 🔁 |
| F10 (backup) | Change backup location | — | ❌ (gap N2) |

**Score (136 rows above, excluding the 4 🚫):** 9 rows (**7%**) same key and same job (✅) · 72 (**53%**) feature exists but on a different key or mouse only (🔁) · 3 (**2%**) broken (⚠️) · 52 (**38%**) feature missing (❌). The 🔁 group is where cheap wins are: the feature exists and only needs binding.

---

## 4. Desktop key capture on Windows, macOS and Linux

MediFlow is a Tauri 2 app. Tauri renders the UI in the OS's own webview, so the keys that reach our code depend on three layers: **the OS / desktop environment**, **the native app menu** (if any) and **the webview's built-in accelerators**. There are no browser tabs, so Ctrl+W, Ctrl+N, Ctrl+T and Ctrl+Tab are free on every platform. The real problems are different:

1. **The webview's own reload, find, print and zoom keys.** These can wipe the screen or open dialogs.
2. **macOS function keys and missing keys** on Mac keyboards.
3. **Linux desktop-environment shortcuts** that collide with Marg's Alt+F-keys.

### 4.1 Per-platform matrix

| Key(s) | Windows (WebView2) | macOS (WKWebView) | Linux (WebKitGTK) | Marg uses it for | Action for MediFlow |
|---|---|---|---|---|---|
| **Ctrl+W**, Ctrl+N, Ctrl+T, Ctrl+Tab | ✅ reach the page | ✅ (Ctrl is free; only **Cmd**+W is the menu's "Close window") | ✅ | Save / MargPay / copy bill / batch detail | **Adopt** in Classic profile |
| **F5, Ctrl+R** | ⚠️ WebView2 **reloads the page**, which can wipe in-memory screen state | usually no default reload in a Tauri window | verify | Ctrl+R = load tax | **Turn off webview accelerators** (below). Ctrl+R becomes ours |
| Ctrl+F, Ctrl+P, Ctrl+±/0, Alt+←/→, F7 | ⚠️ WebView2 find bar, print dialog, zoom, back/forward, caret browsing | mostly not bound | verify | Ctrl+P = load pending, F7 = data entry / lot rate | Turn off accelerators, then bind ours |
| F12, Ctrl+Shift+I | DevTools only if enabled (Tauri release builds ship without DevTools by default) | same | same | F12 = calculator | Never enable the `devtools` feature in release builds |
| **F1–F12 (plain)** | ✅ | ⚠️ **Apple keyboards send brightness, volume and media keys** unless Fn is held or *System Settings › Keyboard › "Use F1, F2, etc. keys as standard function keys"* is on. F11 can be "Show Desktop" | ✅ | Almost everything | **Mac onboarding step** turns this on, with a check screen (§8) |
| Ctrl+F2…Ctrl+F7 | ✅ | ⚠️ macOS keyboard-navigation shortcuts (^F2 menu bar, ^F3 Dock, ^F5 toolbar, ^F6 floating window…) may take them | ✅ | Ctrl+F2 working style, Ctrl+F3 modify vouchers, Ctrl+F7 re-enter invoice | Test on macOS. If taken, show alternates and an onboarding tip |
| Ctrl+↑↓←→, Ctrl+Space | ✅ | ⚠️ Mission Control / Spaces / input-source switch | ⚠️ some desktops switch workspace on Ctrl+Alt+arrows | Not used by Marg | Don't bind these |
| **Insert, End, Home, PgUp/PgDn, forward-Delete** | ✅ | ⚠️ **missing on Mac laptop keyboards** (End = Fn+→, Delete-forward = Fn+⌫) | ✅ | End = save, Insert = search / add stock | Every action on these keys gets a **second binding** (save also Cmd/Ctrl+Enter, search also `/` and F3) |
| Alt+letter | ✅ (no native menu bar in a Tauri window on Windows by default, so bare Alt does nothing) | ⚠️ Option+letter types characters (`π`, `ø`) | ✅ | All document hotkeys | Match on `e.code`, not `e.key` (bug B8) |
| Alt+F1, Alt+F2, Alt+F7, Alt+F8, **Alt+F10** | ✅ | ✅ | ⚠️ **taken by many desktop environments** (overview, run-command, move/resize, **maximise**, depending on GNOME / Cinnamon / MATE / Xfce version) | Alt+F1 shortcut list, Alt+F2 opening balance, **Alt+F10 profit** | On Linux, use the supported-distro setup script to free them (§4.2), or alternates (Ctrl+Alt+F10 → profit) |
| Cmd+Q, Cmd+H, Cmd+M, Cmd+W | — | Tauri's **default macOS app menu** binds these, and they fire before the page | — | — | Ship a custom macOS menu: keep Cmd+Q / Cmd+H / Cmd+M, make Cmd+W go through the close guard, add our own items with their keys shown |
| Alt+F4, Alt+Tab, Alt+Space, Alt+Esc, Ctrl+Esc, Win/Super, Ctrl+Alt+Del | OS | Cmd+Tab, Cmd+Space (Spotlight) | OS / DE | Alt+Esc = minimise (OS does it anyway) | Not ours. Alt+F4 / Cmd+Q / window close go through the close guard |

> This matrix uses general knowledge of each webview and the usual OS/DE defaults. **It must be confirmed on real hardware** (one Windows 10/11 counter PC, one Mac with an Apple keyboard, one Ubuntu LTS box) before K2 ships. The keyboard test KB-10 (§9.1) is that check.

### 4.2 What to build in the desktop shell

1. **Turn off webview accelerators.** On Windows, set WebView2's `AreBrowserAcceleratorKeysEnabled = false` from Rust, using Tauri's `with_webview` access to the platform controller. That stops F5/Ctrl+R reload, Ctrl+F find, Ctrl+P print, zoom and back/forward. Also call `preventDefault()` on our bound keys in the single dispatcher (K1). On macOS and Linux, confirm there is no default reload or zoom binding. If there is, intercept it.
2. **Close and reload guard.** Use Tauri's `onCloseRequested` (JS) or `WindowEvent::CloseRequested` (Rust) to ask "Bill has 4 lines. Park it and close?" whenever a cart or form is dirty. This covers Alt+F4, Cmd+Q, Cmd+W and the window's X. Keep POS cart persistence (`src/lib/pos-cart-persistence.ts`) as the second line of defence.
3. **Custom native menu on macOS.** Replace Tauri's default menu. Keep the OS-standard Cmd items, and list our main actions (New Bill ⌥N, Purchase ⌥P…). This gives Mac users the menu-bar discoverability they expect, for free.
4. **Platform modifier rule.**
   - The Classic (Marg) profile uses **physical Ctrl on all three OSes**, because ex-Marg operators press Ctrl.
   - The MediFlow profile uses **Cmd on macOS and Ctrl on Windows/Linux** for its own shortcuts (Cmd+K, Cmd+Enter).
   - The registry stores both bindings, and the cheat sheet shows the right symbols per OS (⌘ ⌥ ⌃ on Mac).
5. **Linux supported setup.** Support one target, for example Ubuntu LTS with GNOME, plus a post-install script that removes the DE bindings for Alt+F1, Alt+F2, Alt+F7, Alt+F8 and Alt+F10 on counter machines. Other distros are best effort.
6. **No global (OS-wide) shortcuts.** The `tauri-plugin-global-shortcut` plugin grabs keys from every app on the machine. Use it, if at all, only for an optional "bring MediFlow to front" key.
7. **Optional counter kiosk.** Tauri fullscreen with no decorations, plus OS kiosk features (Windows Assigned Access, macOS guided setup) for dedicated counter PCs, so Win+D or Cmd+Tab can't pull the cashier out mid-bill.

---

## 5. Design: Marg-compatible, not Marg-shaped

### 5.1 Principles

1. **Honour Marg's rules (§1), not its accidents.** Alt+letter opens documents, Ctrl+letter opens lists, Enter goes forward, Esc goes back one level, End saves, and one selection grammar applies everywhere. We drop the six meanings of F2 and the menu-letter marathons.
2. **Two keymap profiles on one engine.**
   - **Classic (Marg-compatible).** Marg's keys where they don't break MediFlow concepts. Default for any user who answers "Yes, I've used Marg" at onboarding or invite.
   - **MediFlow.** Modern conventions (Ctrl+K palette, Ctrl+Enter save, Ctrl+Z undo). Default for everyone else.
   - The profile is set **per user**, not per store, so an owner on MediFlow keys and a counter boy on Classic keys can share a PC through a quick user switch (§7).
   - About 80% of bindings are the same in both profiles, so this is a small set of overrides, not two products.
3. **One registry, many outputs.** Every action is declared once (id, label in English and Hindi, scope, bindings per profile, required permission). The dispatcher, cheat sheet, F-key bar, tooltips, help centre text and command palette hints are all generated from it, which fixes B5 and B6 for good.
4. **Scopes with priority:** `modal > field > screen > global`. A key is handled once, by the innermost scope that binds it. This fixes B3, B4 and B7.
5. **Safety beats fidelity.** If a Marg key would do something destructive or irreversible in MediFlow, the Classic profile uses Marg's meaning or does nothing. It never does our different destructive thing. Example: F10 in Classic shows the tax breakup and does **not** complete the sale.
6. **Permission-aware keys.** Keys that show cost or profit (Alt+F10, Shift+~, F6 old purchase rate) only work for roles with `cost.view` (gap Q6). Marg needs a separate operator power for each.
7. **Match on `e.code`** (physical key), not `e.key`, so Mac Option keys and non-English layouts behave the same (fixes B8). Ignore key events that come from the barcode-wedge buffer.
8. **One keymap, three OSes.** Every action has a binding that works on a Mac laptop keyboard: no action may depend only on Insert, End, Home or plain F-keys. Classic uses physical Ctrl everywhere; MediFlow uses Cmd on macOS (§4.2). The OS-specific traps in §4.1 are handled in the shell, not in each screen.

### 5.2 Adopt / adapt / reject summary

| Decision | Marg behaviour | Why |
|---|---|---|
| **Adopt as-is** | Alt+N/A/M/P/V/L/O/Q/U; Ctrl+L, Ctrl+I; End and **Ctrl+W save**; **Ctrl+Tab batch detail**; **Ctrl+T copy/repeat bill**; **Ctrl+N UPI QR (MargPay equivalent)**; **Ctrl+R change rate calculation** (after turning off WebView2 reload); **Ctrl+P load pending**; F12 calculator; Esc back one level; Enter forward; list grammar Space/+/−/*//; Alt+P print/export in reports; voucher F2–F7 type switch; F2 date range in reports; item list F7/F8 salt, F9 company, F10 available, F4 item ledger; modify-bill F9 audit, F10 print, F11 share; Ctrl+F2 working style; Ctrl+Home shortage; F9 old dealing; Alt+L last deal (in bill) | Muscle memory, no conflict with our concepts |
| **Adapt** | **F2 in a bill → park the current bill and open a new one** (Marg opens a second bill window; we park, so nothing is lost) · **Ctrl+J → palette** in Classic (AI moves inside the palette, see §7) · **F1 → store switcher** in Classic · **Ctrl+U → PIN user switch** · **Ctrl+S → refresh data** · **Ctrl+Q → lock screen** (Cmd+Q on Mac still quits, through the close guard) · F4 bill discount and cash register → **Shift+F4** · second bindings for Mac laptops: End → **Cmd/Ctrl+Enter**, Insert → **`/` or F3** · Linux Alt+F10 profit → **also Ctrl+Alt+F10** | A different MediFlow concept, or a macOS / Linux key clash (§4.1) |
| **Reject** | Left-arrow to change bill number (breaks GST Rule 46 numbering) · Structure / Junk verification (no file DB to repair) · "type *sure*" confirmations (use a real confirm dialog) · multi-key menu marathons (palette replaces them) · Alt+X shut company · Alt+Esc | Legal, architectural, or just bad UX |

---

## 6. Target key map

**Shared** = same in both profiles. Only differences are listed per profile. *New* = needs the feature first (gap ID in brackets).

### 6.1 Global

| Action | Shared | Classic | MediFlow | Today |
|---|---|---|---|---|
| New sale bill | Alt+N, F2 (off POS) | | | ✅ |
| Counter sale (same POS) | Alt+A | | | add alias |
| Sales register (modify bill) | Alt+M | | | ✅ |
| New purchase | Alt+P | | | ✅ (fix B4) |
| Voucher entry *(new, F1)* | Alt+V | | | — |
| Cheque / PDC *(new, F4)* | Alt+U / Alt+Q | | | — |
| All ledgers | Alt+L, Ctrl+L | | | fix B2 |
| Outstanding (receivables) | Alt+O | | | add |
| Item list (inventory) | Ctrl+I | | Alt+I also | Alt+I today |
| Command palette / "switch over" | Ctrl+K | **Ctrl+J** | Ctrl+K | Ctrl+K |
| AI assistant | palette "Ask AI" + Ctrl+Shift+J | (Ctrl+J opens palette, AI is its first row) | Ctrl+J | Ctrl+J |
| Store switcher | Ctrl+Shift+S | **F1** | F1 = help | Ctrl+Shift+S |
| Quick user switch (PIN) *(new)* | Ctrl+U | | | — |
| Lock screen *(new)* | Ctrl+Shift+L | Ctrl+Q | | — |
| Refresh data (re-fetch, never a page reload) | Ctrl+S | | | — |
| Calculator | F12 | | | fix B3 |
| Printer setup | Ctrl+F11 | | | add |
| Shortcut sheet for this screen | `?`, Ctrl+F1, Alt+F1 | | | ✅ (make per-screen) |
| Key hints overlay *(new, §7)* | hold Alt for 600 ms | | | — |
| Save current form | End, Ctrl+Enter (Cmd+Enter on Mac) | + Ctrl+W | | POS only |
| Back one level | Esc | | | partly |

### 6.2 POS / sale bill

| Action | Shared | Classic | MediFlow | Today |
|---|---|---|---|---|
| Focus search | F3, Insert, `/` | | | ✅ |
| New bill | | **F2 = park current + new** | F2 = new (confirm if lines) | F2 reset |
| Park / recall | F6 / F7 | | | ✅ |
| Payment / tender | F8 | | | ✅ |
| **Complete sale** | End, Ctrl+Enter (Cmd+Enter on Mac) | + Ctrl+W · **F10 does not save** | + F10 | F10 / End |
| Tax breakup panel | | **F10** | Alt+T | — |
| Bill discount | F4 (Marg's key; same in both profiles to keep them close) | | | panel only |
| Cash register (moves off F4) | Shift+F4, palette | | | F4 |
| Substitutes (salt) for highlighted item | F7 in search results | | | ⚠️ B1 |
| Party's old dealing for this item | F9 | | | ❌ add |
| Last deal (last rate to this party) | Alt+L in bill | | | ❌ add |
| Shortage / promise order | Ctrl+Home, `*` in search results | | | F9 today |
| Working style: auto-FEFO ↔ manual batch | Ctrl+F2 | | | modal only |
| Batch detail of row | Alt+Enter | + Ctrl+Tab | | — |
| Profit on bill (needs `cost.view`) | Alt+F10 | | | ❌ |
| Item cost / avg / margin (needs `cost.view`) | Shift+` (~) | | | ❌ |
| Change line rate / discount | F5 on row / F3 on row | | | mouse |
| Remarks | Alt+` (~) | | | mouse |
| Load pending orders / promise orders | Ctrl+P | | | mouse |
| Repeat bill / last Rx for this customer | Ctrl+Shift+R | + Ctrl+T (Marg "copy bill") | | ❌ |
| Show UPI QR for this bill | U in payment panel | + Ctrl+N (Marg "MargPay") | | ❌ |
| Change rate calculation / tax mode | | Ctrl+R (needs WebView2 reload off, §4.2) | | ❌ |
| Save / load item set (kit, chronic Rx) | Alt+F11 / Alt+F12 | | (Alt+F12 stops being calculator) | ❌ |
| Return line on same bill *(new, P2)* | `*` in qty field | | | ❌ |
| Customer / party | F5: focuses the customer picker when empty, shows party detail (balance, credit, last bills) when set (Marg's F5) | | | mouse |
| Qty ±1 / remove line / next field | `+` `-` / Del / Enter | | | ✅ |

> **Note: Alt+D.** MargBooks uses Alt+D for "last deal", while Marg ERP 9+ uses Alt+L. Bind last deal to both Alt+L and Alt+D on POS only, so operators from either Marg product are covered.
>
> **Note: Mac laptops.** "End" in this table always also means **Cmd/Ctrl+Enter**, and "Insert" also means **`/` or F3**. Plain F-keys need the macOS "standard function keys" setting from onboarding (§8).
>
> **Note: F4 moves from register to bill discount** in both profiles. This changes current behaviour, which is acceptable before the first paid pilot. Update `MANUAL_TESTING.md` and `USER_MANUAL.md` when K2 ships.

### 6.3 Purchase entry (GRN), new keyboard flow

Header (supplier → bill no. → date) → lines (item → batch → expiry → qty → free → PTR → MRP → disc) with Enter moving forward. Then:

| Key | Action |
|---|---|
| Alt+P | Open (shared) |
| F2 | New line, or new purchase if the header is empty |
| F3 | Modify the line under the cursor |
| F6 (Classic) / Alt+H | Rate history for this item from this supplier (needs `cost.view`) |
| Ctrl+O | Import distributor bill (CSV/XLSX/PDF/photo, existing modal) |
| Ctrl+P | Load pending PO |
| End / Ctrl+Enter (Cmd+Enter on Mac) / Ctrl+W (Classic) | Save |
| `+` on a line | Print barcode label *(new, B9)* |

### 6.4 Vouchers, ledgers, register and reports

| Screen | Key | Action |
|---|---|---|
| Voucher *(new)* | F2 / F3 / F4 / F5 / F6 / F7 | Switch to Payment / Receipt / Journal / Debit Note / Credit Note / Contra (Marg order, exact) |
| Voucher | F11 | Repeat last narration |
| Ledger | F2 | Date range / month-wise |
| Ledger | F3 | Open party |
| Ledger | F6 | Bill-wise adjust |
| Ledger | F8 | PDCs |
| Ledger | F10 | Filter |
| Ledger | Ctrl+F1 | Summary |
| Sales register | F10 | Reprint |
| Sales register | F11 | Share PDF / WhatsApp |
| Sales register | F9 | Audit trail of the bill |
| Sales register | F4 | E-invoice / e-way bill |
| Sales register | Enter | Open |
| Sales register | Del | Cancel (same-day rule) |
| Every list / report | Space / `+` / `-` / `*` / `/` | Toggle / select / unselect / select all / unselect all |
| Every list / report | F2 | Date range |
| Every list / report | Alt+P / Ctrl+Y | Print or export selection |
| Every list / report | F10 | Filter |
| Every list / report | Enter | Drill down |
| Every list / report | Esc | Back up one drill level |
| Inventory list | F2 / F3 | New / edit |
| Inventory list | F4 | Item ledger (movements) |
| Inventory list | F7 | Salt filter |
| Inventory list | F9 | Company filter |
| Inventory list | F10 | In-stock only |
| Inventory list | Insert | Adjust stock |
| Inventory list | `+` | Label *(new)* |

---

## 7. Where MediFlow beats Marg

Marg's keyboard is fast for experts and opaque to everyone else. Each item below makes a Marg veteran *at least* as fast and a newcomer much faster.

| # | Advantage | What it is | Builds on |
|---|---|---|---|
| U1 | **Live F-key bar** | A strip at the bottom of every screen showing the keys for the current scope (`F2 New · F3 Search · F6 Park · F8 Pay · End Save`). It changes as focus moves: qty field, search, cart. Tally has this; Marg does not. | Registry (K1) |
| U2 | **Hold-Alt key hints** | Holding Alt for 600 ms overlays the letter key on every navigable item (like Office KeyTips), so nobody has to memorise Alt letters | Registry, `GlobalTooltipLayer.tsx` |
| U3 | **Palette that acts, speaks Marg and falls back to AI** | Ctrl+K / Ctrl+J. Besides navigation it runs actions: "reprint 1043", "stock dolo 650", "new purchase cipla", "outstanding sharma". It **understands Marg vocabulary as aliases**: *Control Room, Self Format, Brk/Exp, PTR, godown, challan, switch over*. If nothing matches, Enter sends the text to the AI assistant. Marg's "switch over" is a menu; ours is a search box. | `CommandPalette.tsx`, `AIAssistant.tsx`, `src/server/ai/*` |
| U4 | **Forgiving medicine search** | "pcm 650", "azi 500", "dolo", typos, salt names and barcodes all go to the same box. Marg expects you to know the item name. | POS search, catalog |
| U5 | **Scanner never collides with keys** | Wedge-scanner input is buffered and recognised (`hardware-bridge.ts`), so a scan containing `+` or `*` can't trigger a shortcut. Marg needs a "fast scanning" mode (Ctrl+B in MargBooks). | Exists in desktop |
| U6 | **Never lose a bill** | F2 parks instead of discarding. Esc never discards without a confirm. Window close (Alt+F4, Cmd+Q, Cmd+W, the X button) and webview reload are guarded (§4.2). Carts persist across crashes. Marg operators lose bills to Esc/Ctrl+Q mistakes. | `pos-cart-persistence.ts`, Tauri `onCloseRequested` |
| U7 | **Undo** | Ctrl+Z (MediFlow profile) / Alt+Backspace (both) restores the last removed line or qty change. Marg has no undo inside a bill. | Cart reducer |
| U8 | **PIN quick-switch user** (Ctrl+U) | A shared counter PC switches operator in 2 seconds with a 4-digit PIN. Each bill is attributed to the right person, and permissions (cost hiding) follow the person, not the PC. | Auth, RBAC |
| U9 | **Keymap profiles + per-user remapping with conflict detection** | Classic vs MediFlow, plus custom overrides, stored per user. Marg's keys are fixed. | K1 |
| U10 | **Keyboard coach** | Telemetry counts mouse-vs-key per action per cashier. After 3 mouse clicks on "Payment" it suggests "Tip: F8". The owner sees **average seconds per bill per cashier** and the trend. Marg can't measure its operators. | `src/lib/telemetry.ts`, `actions/telemetry.ts` |
| U11 | **Bilingual cheat sheet and printable keyboard sticker** | `?` shows a per-screen sheet in English and Hindi (and later other languages). One click prints an A4 sheet or a 58/80 mm sticker strip for the monitor bezel. | Registry, print templates |
| U12 | **Speed benchmark in onboarding** | A 5-item practice bill timed against a target (internal research target: a skilled Marg cashier bills 5 items in < 25 s; `docs/MARG_COMPETITIVE_RESEARCH.md`). Show the operator their time, then let the owner see it. | Training mode |
| U13 | **Permission-aware keys** | Profit and cost keys simply don't exist for a cashier. Nothing to leak. | `cost.view` (gap Q6) |
| U14 | **Voice for hands-busy moments** | "Add Dolo 650, two strips" while holding a bag. The `voice.execute` permission already exists. | `voice.*` permissions |
| U15 | **Same keys on Windows, Mac and Linux** | One keymap with OS-correct symbols (⌘ ⌥ on Mac) and a native macOS menu bar listing every action with its key. Marg ERP 9+ is sold and documented as a Windows program (whether it runs on a Mac natively is unclear; gap-analysis demo checklist). An owner can run the same counter keys on a MacBook at home. | §4.2 |

---

## 8. Onboarding an ex-Marg operator (first hour)

1. **Invite / first login asks: "Have you used Marg ERP?"** Yes → Classic profile, Hindi/English toggle, and the Marg-vocabulary palette shown first.
   - **On macOS:** a "Press F2" check screen. If the key arrives as a brightness/media key, it shows how to turn on *Use F1, F2, etc. keys as standard function keys* and waits until F2 works. On a laptop keyboard without End/Insert, it shows the Cmd+Enter and `/` alternatives.
   - **On Linux:** the same F-key check, plus an Alt+F10 check that tells the installer to run the setup script if the desktop took the key.
2. **2-minute tour, keyboard only.** Alt+N → type "dolo" → Enter → `+` → End. It shows the F-key bar and says: *"Your Marg keys work here. Hold Alt to see the rest."*
3. **"What's different from Marg" card**, 6 lines only:
   - F2 keeps your bill (parks it).
   - F10 shows tax (save with End).
   - Rx details are asked automatically for Schedule H/H1.
   - FEFO batch is picked for you (Ctrl+F2 to choose).
   - Bill numbers are automatic.
   - Ctrl+K finds anything.
4. **Practice bill** (U12), then a real one.
5. **Printed sticker** (U11) for the monitor.
6. **Day 3**: the coach (U10) starts nudging. **Day 7**: the owner gets a "your team's billing speed" WhatsApp summary.

---

## 9. Implementation plan

| Phase | Scope | Effort | Lane | Main files |
|---|---|---|---|---|
| **K0: bug fixes** | B1–B5, B8, B9: bind substitutes; F9 → old dealing placeholder or leave promise order but fix the sheet; Alt+L → ledgers; drop the duplicate F12; scope the Register Alt+P; correct `help/catalog.ts`; match on `e.code`; rename the sheet group | S (1–2 days) | A (help text: B) | `usePosShortcuts.ts`, `ShellContext.tsx`, `RegisterClient.tsx`, `ShortcutsModal.tsx`, `help/catalog.ts` |
| **K1: keymap engine** | `src/lib/keymap/` with an action registry (id, labels en/hi, scope, bindings `{classic, mediflow}`, permission, `when`); one `window` listener with a scope stack (modal > field > screen > global); `useKeyAction(id, handler)` hook; per-user profile in user prefs; generators for cheat sheet, F-key bar, tooltips, help text and palette hints; migrate the 25 listeners | M (1–2 weeks) | A | new `src/lib/keymap/*`, the 25 handler files |
| **K2: POS Classic parity** | F2 park+new; F10 tax panel (Classic); F4/Shift+F4; F7 substitutes in results; F9 old dealing; Alt+L last deal; Ctrl+Home / `*` shortage; Ctrl+F2 working style; Alt+Enter batch; Alt+F10 / Shift+~ (gated); End saves from qty fields; Ctrl+P pending; Ctrl+Shift+R repeat bill; F5 party detail; customer field in the Enter flow | M (1–2 weeks) | A | POS `_components/*`, `_state/*` |
| **K3: keyboard everywhere** | GRN entry flow (§6.3); sales register keys; inventory list keys; ledger keys; list/report selection grammar as one shared `<KeyTable>`; voucher F2–F7 when vouchers ship (gap F1) | L (3–5 weeks) | A + B | `purchases/new/*`, `sales/register`, `inventory`, `accounting/*`, `reports/*` |
| **K1b: desktop shell keys** (with K1) | §4.2: turn off WebView2 browser accelerators; close/reload guard (`onCloseRequested`); custom macOS menu; platform-modifier rule in the registry; OS-aware cheat-sheet symbols; Mac/Linux F-key check screens; Linux DE setup script | M (1 week + testing on 3 OSes) | A | `desktop/src-tauri/src/lib.rs`, `tauri.conf.json`, `src/lib/keymap/*` |
| **K4: the upper hand** | U1 F-key bar, U2 Alt hints, U3 palette actions + Marg aliases + AI fallback, U7 undo, U8 PIN switch, U10 coach, U11 sticker, U12 practice bill, U15 macOS menu with keys, optional counter kiosk mode | L (3–4 weeks) | A (palette AI: B) | `CommandPalette.tsx`, `telemetry`, `desktop/src-tauri/*` |

**Order:** K0 now. K1 + K1b before any new shortcut is added; otherwise B3/B4-style conflicts multiply. K2 before the first paid pilot. K3 and K4 alongside the gap-analysis stages.

### 9.1 Test spec (add to `MANUAL_TESTING.md` and automated tests when K1 lands)

Automated keyboard tests run against the desktop build. Use WebdriverIO with `tauri-driver` (supported on Windows and Linux; macOS has no WebDriver for WKWebView, so macOS runs the manual list). Component-level key tests can still run in Vitest/Playwright against the Next.js dev server.

- **KB-01 Zero-mouse bill:** login → Alt+N → 5 items by search and scan → qty with `+` → F8 → cash → End. No pointer events allowed (the test fails on any mouse action).
- **KB-02 Speed:** same bill in Classic profile in ≤ 25 s by a trained tester (manual, timed).
- **KB-03 No destructive surprise:** Classic profile, F10 on a non-empty cart → tax panel opens, sale **not** completed. F2 on a non-empty cart → bill parked, new bill empty, parked bill recoverable with F7.
- **KB-04 Scope priority:** on the Register page, Alt+P prints the X-report and does not navigate. On POS, F12 opens the calculator once.
- **KB-05 Permissions:** Cashier presses Alt+F10 / Shift+~ → nothing happens and nothing renders. Owner → profit shown.
- **KB-06 Scanner vs keys:** scanning a barcode that contains `*` or `+` adds the item and triggers no shortcut.
- **KB-07 Close and reload guard:** cart with lines → Ctrl+W (Classic) **saves** the bill and does not close anything. Alt+F4 / Cmd+Q / the window X → "Park and close?" prompt. F5 and Ctrl+R on Windows → no reload. Force-kill the app → cart restored on restart.
- **KB-08 Docs sync:** a unit test asserts that every key shown in the cheat sheet, help catalog and F-key bar resolves to a registered action (stops B5 coming back).
- **KB-09 Layouts:** Alt shortcuts work on macOS (Option) and with a Hindi InScript layout active (because they match on `e.code`).
- **KB-10 OS matrix:** run KB-01, KB-03, KB-07 on (a) Windows 10 and 11 with a standard PC keyboard, (b) macOS with an Apple laptop keyboard and an external PC keyboard, (c) Ubuntu LTS / GNOME before and after the setup script. Record any key from §4.1 that doesn't reach the app, and update §4.1.
- **KB-11 Mac laptop keys:** with no End/Insert keys, a full bill is possible using only Cmd+Enter, `/`, F-keys (with the standard function keys setting on) and arrows.

---

## 10. Sources

**Marg official (care.margcompusoft.com)**
- [Marg Shortcut keys: full table (Company, Masters, Sale, Purchase, Accounts, Books, Hot keys)](https://care.margcompusoft.com/margerp/general-queries/166661/1/SHORTCU) · [same, alternate URL](https://care.margcompusoft.com/margerp/general-queries/166661/1/marg-shortcut-keys)
- [Control Room / Self Format / Structure / Junk / Balance Sheet sequences](https://care.margcompusoft.com/margerp/others/3039/1/null)
- [All Ledgers / Item / Debtor Outstanding keys](https://care.margcompusoft.com/margerp/others/3040/1/What-is-the-shortcut-key)
- [Sale bill key (Alt+N)](https://care.margcompusoft.com/margerp/others/31536/1/What-is-the-shortcut-key) · [Sale challan (Alt+C)](https://care.margcompusoft.com/margerp/others/2755/1/What-is-the-Shortcut-key) · [New ledger / group (Alt+Alt+X / Alt+Alt+L)](https://care.margcompusoft.com/margerp/others/73633/1/What-is-the-shortcut-key) · [Minimise (Alt+Esc)](https://care.margcompusoft.com/margerp/others/37413/1/What-is-the-Shortcut-key) · [Working style (Ctrl+F2)](https://care.margcompusoft.com/margerp/sale/1980/1/How-to-change-Working-Style)
- [MargBooks shortcut keys](https://care.margcompusoft.com/marg-books/dashboard-detailss/179187/9/marg-books-shortcut-keys) · [MargBooks blog (same list)](https://margbooks.com/blogs/margbooks-shortcut-keys/)

**Dealer / training lists (cross-checks)**
- [computer-ability.blogspot.com (2022): Gateway, Ledger, Items, Transactions, Reports, Everywhere](https://computer-ability.blogspot.com/2022/07/shortcut-key-for-marg-erp.html)
- [Anil Computers, Udaipur: mirrors the official table](https://www.anilcomputersudaipur.com/blogs/marg-shortcut-keys/988)
- [sewadiary.blogspot.com (2020): ledger, inventory, invoice keys](https://sewadiary.blogspot.com/2020/07/keyboard-shortcuts-in-marg-erp.html)
- [margedu.wordpress.com (2010): masters menu sequences, mostly images](https://margedu.wordpress.com/category/masters/shortcut-keys/)
- A dealer PDF ("marg_erp_9_shortcut_keys.pdf") was found but could not be text-extracted. Not used.

**MediFlow code (at `5de601a`)**
`src/app/components/{ShellContext,Topbar,ShortcutsModal,CommandPalette,AIAssistant,CounterCalculator,GlobalTooltipLayer}.tsx` · `src/app/dashboard/sales/pos/_state/usePosShortcuts.ts` · `src/app/dashboard/sales/pos/_components/{RetailPosTerminal,SearchBar,useCartKeyboard,PaymentPanel}.tsx|ts` · `src/app/dashboard/sales/register/RegisterClient.tsx` · `src/app/dashboard/sales/[id]/return/ReturnForm.tsx` · `src/server/domain/help/catalog.ts` · `src/desktop/hardware-bridge.ts`
