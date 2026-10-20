# MediFlow — AI-Native Pharmacy Operating System

<div align="center">

```
  __  __          _ _ ______ _                 
 |  \/  |        | (_)  ____| |                
 | \  / | ___  __| |_| |__  | | _____      __  
 | |\/| |/ _ \/ _` | |  __| | |/ _ \ \ /\ / /  
 | |  | |  __/ (_| | | |    | | (_) \ V  V /   
 |_|  |_|\___|\__,_|_|_|    |_|\___/ \_/\_/    
```

**Production-Grade AI Operating System for Retail Pharmacies & Multi-Store Chains**

[![Next.js](https://img.shields.io/badge/Next.js-16.3.8-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.8-61dafb?logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle-0.45.3-c5f74f?logo=drizzle)](https://orm.drizzle.team/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-336791?logo=postgresql)](https://www.postgresql.org/)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript%205-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![AI SDK](https://img.shields.io/badge/AI-Vercel%20AI%20SDK-black)](https://sdk.vercel.ai/)

</div>

---

## 📖 Overview

**MediFlow** is not just a pharmacy billing software — it is an **AI-Native Operating System** designed from the ground up for modern retail chemists, multi-branch pharmacy chains, and hospital counters. 

Built with **Next.js 16 (Turbopack)**, **React 19**, **Drizzle ORM**, and **Tailwind CSS v4**, MediFlow replaces clunky legacy DOS-era desktop software (like MARG ERP) with a blistering-fast, keyboard-driven cloud web application featuring live AI assistance, real-time batch expiry alerts, thermal receipt printing, and statutory GST compliance.

---

## 📚 Project documentation

* **[ROADMAP.md](ROADMAP.md)**: the 6-month, two-lane build plan.
* **[docs/](docs/README.md)**: architecture, current-state audit, database, Indian pharmacy & GST rules, coding standards, offline & multi-store designs, security, glossary.
* **[CONTRIBUTING.md](CONTRIBUTING.md)**: branch & Pull Request rules (Lane A / Lane B).
* **[A_TEST_GUIDE.md](A_TEST_GUIDE.md)** / **[B_TEST_GUIDE.md](B_TEST_GUIDE.md)**: manual test guides (user + developer perspective) for each lane.

> Some setup details below are outdated (e.g. the AI key is `GEMINI_API_KEY`). Trust [docs/08-local-setup.md](docs/08-local-setup.md) until ROADMAP task B0.6 refreshes this README.

---

## ✨ Key Features & Capabilities

### 1. ⚡ High-Speed Counter POS Terminal (`/dashboard/sales/pos`)
* **Keyboard-First Workflow:** Optimized for speed counter billing with zero mouse dependency (`F2` New Bill, `/` Search Medicine, `Esc` Cancel).
* **Instant Drug Search & Barcode Scanning:** Millisecond autocomplete by brand name, salt composition, manufacturer, or barcode.
* **Salt & Substitute Recommendation:** Displays equivalent therapeutic salts and lower-cost alternatives with real-time stock availability.
* **Prescription (Rx) Compliance Guard:** Automatic detection and warning for Schedule H/X medications.
* **Split Tender Payments:** Cash, UPI, Card, and Customer Credit ledger balance in a single bill.
* **Dual Invoice Printing:**
  * **Thermal 80mm ESC/POS Roll:** Fast receipt with itemized batch, expiry date, MRP, discount, and savings note.
  * **A4 GST Tax Invoice:** Full HSN breakdown, CGST, SGST, IGST calculations, and doctor details.
* **Full-Width Terminal Layout:** Responsive fluid interface maximizing widescreen counter displays.

### 2. 📦 Inventory & Batch Master (FEFO Engine)
* **First Expiry, First Out (FEFO):** Enforces selling oldest batches first to eliminate expiry losses.
* **Visual Expiry Badges:**
  * 🔴 **Expired:** Billing automatically blocked.
  * 🟠 **Critical ($\le 30$ days):** Immediate return prompt.
  * 🟡 **Near Expiry ($\le 90$ days):** Priority dispense flag.
* **Reorder Level Monitoring:** Automatically tracks stock against minimum buffer quantities.
* **Bulk Data Import:** High-throughput CSV/Excel import with field validation for Indian Medicine Datasets.

### 3. 🤖 MediFlow AI Assistant (`Ctrl+J`)
* **Live Database Context:** Connected directly to your pharmacy catalog, sales records, and inventory batches via tool calling.
* **Natural Language Queries:**
  * *"Show me low-stock items"*
  * *"Today's sales summary and top sellers"*
  * *"Check drug interaction between Ibuprofen and Aspirin"*
* **Voice Speech Recognition:** Built-in microphone input for hands-free counter inquiries.
* **Responsive Mobile Sheet:** Auto-adjusts to compact phone viewports without horizontal clipping.

### 4. ⌨️ Global Command Palette (`Cmd+K` / `Ctrl+K`)
* **Instant Jump Menu:** Search and open any dashboard module, view, or settings instantly.
* **Quick Actions:** Create Customer, Record Purchase GRN, Toggle Sidebar, Open Shortcuts Cheat Sheet.
* **Keyboard Navigation:** Native `↑` / `↓` arrow selection with `↵` Enter activation.

### 5. 📱 Fully Responsive Shell & Desktop Collapsible Sidebar
* **Mobile & Tablet Slide-Over Drawer:** Full navigation access on iPads, Android tablets, and smartphones.
* **Collapsible Desktop Sidebar:** Toggle between full (`240px`) and compact icon-only (`68px`) modes with `Ctrl+B` (persisted in `localStorage`).
* **Branch Switcher:** Quick popup showing active branch license (Form 20B/21B) and GST status.
* **Accessibility:** Skip-to-content links and WCAG AA contrast compliance.

### 6. 🔔 Real-Time Notification Center & Offline Sentinel
* **Alerts Popover:** Real-time counter alerts for batches nearing expiry and stock reaching reorder levels.
* **Offline Sentinel:** Real-time `navigator.onLine` listener displaying an unobtrusive `🔴 Offline Mode` warning when connectivity drops.

### 7. 💼 Purchases, Suppliers & Accounting
* **Purchase GRN (Goods Received Note):** Record supplier inward entries with batch numbers, expiry dates, purchase rates, and GST tax credit.
* **Accounting & Day Book:** Real-time register reconciliation across payment modes (Cash, UPI, Credit).
* **Statutory GST Reporting:** CGST, SGST, IGST breakdown with one-click CSV data export for monthly filings.
* **Customer Credit Ledgers:** Track customer outstanding dues and payment history.

### 8. ⚙️ Store Configuration & Statutory Settings (`/dashboard/settings`)
* **Pharmacy Profile:** Store name, Drug License numbers (Form 20B/21B), 15-digit GSTIN, and physical address.
* **Print Defaults:** Toggle between default Thermal 80mm roll or A4 GST Tax Invoice layout.
* **User & Tenant:** Active operator details and cloud database health status.

---

## ⌨️ Keyboard Shortcuts Reference

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| **`F2`** | Global | Jump directly to POS New Bill Counter |
| **`Cmd + K`** / **`Ctrl + K`** | Global | Open Global Command Palette |
| **`Ctrl + B`** | Global | Toggle Sidebar (Expanded 240px $\leftrightarrow$ Compact 68px) |
| **`Ctrl + J`** | Global | Open / Close MediFlow AI Assistant |
| **`?`** or **`F1`** | Global | Open Keyboard Shortcuts Cheat Sheet |
| **`/`** | POS / Search | Focus medicine search input |
| **`Esc`** | Modals / POS | Close active modal, drawer, or clear input |
| **`↵ Enter`** | Command Menu | Execute selected command |

---

## 🏗️ Technical Architecture & Tech Stack

```
                          ┌───────────────────────────┐
                          │   Next.js 16 (Turbopack)  │
                          │   React 19 Server/Client  │
                          └─────────────┬─────────────┘
                                        │
             ┌──────────────────────────┼──────────────────────────┐
             │                          │                          │
             ▼                          ▼                          ▼
   ┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
   │  Dashboard Shell │       │ POS Billing &    │       │ AI Assistant     │
   │  - ShellContext  │       │ Inventory Engine │       │ - Tool Invocations│
   │  - Mobile Drawer │       │ - FEFO Sorting   │       │ - Google Gemini  │
   │  - Command (⌘K)  │       │ - Thermal Print  │       │ - Voice / Speech │
   │  - Notifications │       │ - Multi-Tender   │       │ - Markdown Tables│
   └─────────┬────────┘       └─────────┬────────┘       └─────────┬────────┘
             │                          │                          │
             └──────────────────────────┼──────────────────────────┘
                                        │
                                        ▼
                          ┌───────────────────────────┐
                          │  Drizzle ORM & PostgreSQL │
                          │  - Multi-Tenant Schema    │
                          │  - Atomic Transactions   │
                          │  - Audit Logs & Sessions  │
                          └───────────────────────────┘
```

| Layer | Technology | Details |
| :--- | :--- | :--- |
| **Framework** | Next.js 16.3.8 | App Router, Server Actions, Turbopack, edge `proxy.ts` |
| **UI Library** | React 19.2.8 | Server Components, `useTransition`, `useActionState` |
| **Styling** | Tailwind CSS v4 | `@tailwindcss/postcss`, Restrained Pharmacy Palette, CSS variables |
| **Database** | PostgreSQL | Multi-tenant relational schema with foreign key cascades |
| **ORM** | Drizzle ORM 0.45.3 | Type-safe SQL queries, schema definitions, migrations |
| **AI Integration** | Vercel AI SDK 4 / 7 | `@ai-sdk/google` (Gemini 2.0), `@ai-sdk/react`, Groq |
| **Icons & Motion** | Lucide React | Modern feather-style vector iconography |
| **Charts & Data** | Recharts, PapaParse | Analytical dashboards, CSV export/import parsers |

---

## 📁 Project Directory Structure

```
mediflow/
├── src/
│   ├── app/
│   │   ├── actions/                  # Server Actions (Type-safe mutations)
│   │   │   ├── accounting.ts         # Ledger & day book actions
│   │   │   ├── ai-enrichment.ts      # Drug interaction & salt tools
│   │   │   ├── auth.ts               # Login, register, logout sessions
│   │   │   ├── customers.ts          # Customer directory & quick create
│   │   │   ├── dashboard.ts          # Overview KPIs & sales metrics
│   │   │   ├── inventory-import.ts   # Bulk CSV medicine stock import
│   │   │   ├── inventory.ts          # Medicine item master management
│   │   │   ├── purchases.ts          # Supplier GRN purchase entries
│   │   │   ├── sales.ts              # POS bill creation & invoice retrieval
│   │   │   ├── settings.ts           # Pharmacy profile & statutory config
│   │   │   ├── stock.ts              # Batch balance & stock transactions
│   │   │   └── suppliers.ts          # Supplier & distributor directory
│   │   ├── api/                      # Route Handlers
│   │   │   ├── chat/route.ts         # AI assistant streaming endpoint
│   │   │   └── export/               # CSV exports (Sales, Batches, Purchases)
│   │   ├── components/               # Core UI Components
│   │   │   ├── AIAssistant.tsx       # AI chat panel with speech & tools
│   │   │   ├── CommandPalette.tsx    # Cmd+K global command search dialog
│   │   │   ├── DateRangeFilter.tsx   # Period filter (Today, 7D, 30D, Custom)
│   │   │   ├── ExportButton.tsx      # Dropdown export component
│   │   │   ├── NotificationsPopover.tsx # Stock & expiry alerts dropdown
│   │   │   ├── ShellContext.tsx      # Reactive layout & hotkey state
│   │   │   ├── ShortcutsModal.tsx    # Keyboard shortcuts reference modal
│   │   │   ├── Sidebar.tsx           # Collapsible desktop & mobile sidebar
│   │   │   ├── Topbar.tsx            # Header with search, bell & status
│   │   │   └── ui.tsx                # Design system primitives (PageHeader, StatCard)
│   │   ├── dashboard/                # Dashboard App Routes
│   │   │   ├── accounting/page.tsx   # Accounting, day book & tax ledgers
│   │   │   ├── customers/            # Customer management
│   │   │   ├── inventory/            # Item master, batches, and CSV import
│   │   │   ├── purchases/            # Purchases (GRN) records & new GRN
│   │   │   ├── sales/                # Sales invoices, invoice details & print
│   │   │   │   ├── [id]/page.tsx     # Invoice view
│   │   │   │   ├── [id]/print/page.tsx # Thermal 80mm & A4 print view
│   │   │   │   └── pos/page.tsx      # High-speed POS Billing Terminal
│   │   │   ├── settings/page.tsx     # Store profile, Drug License & GST
│   │   │   ├── suppliers/page.tsx    # Suppliers list & new supplier
│   │   │   ├── DashboardShell.tsx    # Unified layout shell container
│   │   │   ├── layout.tsx            # Server session wrapper
│   │   │   └── page.tsx              # Overview analytics & KPI tiles
│   │   ├── globals.css               # Design system tokens & utility classes
│   │   ├── layout.tsx                # Root layout with fonts
│   │   ├── login/page.tsx            # Staff authentication login
│   │   └── register/page.tsx         # Pharmacy signup & onboarding
│   ├── lib/                          # Client & shared utilities
│   │   ├── date-range.ts             # Date filtering helpers
│   │   └── format.ts                 # INR (₹) currency & number formatters
│   ├── proxy.ts                      # Next.js 16 edge route protection middleware
│   └── server/                       # Server-only infrastructure
│       ├── auth.ts                   # Password hashing & session cookies
│       ├── ai.ts                     # AI SDK model initialization
│       └── db/
│           ├── index.ts              # PostgreSQL connection pool
│           ├── schema.ts             # Complete Drizzle relational schema
│           └── migrate.ts            # Migration execution script
├── scripts/                          # Utility & dataset integration scripts
├── package.json                      # Project dependencies & scripts
├── tsconfig.json                     # TypeScript strict configuration
└── next.config.ts                    # Next.js configuration
```

---

## 🚀 Getting Started

### Prerequisites

* **Node.js**: v20.10.0 or higher
* **npm**: v10 or higher (or pnpm / bun)
* **PostgreSQL**: v14 or higher (Local or cloud database like Neon / Supabase / AWS RDS)

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/mediflow.git
cd mediflow
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# Database Connection (PostgreSQL)
DATABASE_URL="postgres://username:password@localhost:5432/mediflow"

# Authentication Session Secret
SESSION_SECRET="your-super-secret-random-32-char-key"

# AI Provider Keys
GOOGLE_GENERATIVE_AI_API_KEY="your-gemini-api-key"
GROQ_API_KEY="your-groq-api-key"

# Optional: WhatsApp Integration
WHATSAPP_API_KEY="your-whatsapp-provider-key"
```

### 4. Setup Database Schema

Push the Drizzle ORM schema to your PostgreSQL database:

```bash
npx drizzle-kit push
```

*(Optional) Seed the database or import Indian Medicine datasets via `/dashboard/inventory/import`.*

### 5. Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🛠️ Build & Verification Commands

```bash
# Run TypeScript compilation check
npx tsc --noEmit

# Run ESLint validation
npm run lint

# Build optimized production bundle with Turbopack
npm run build

# Start production server
npm run start
```

---

## 🔒 Security & Statutory Compliance

* **Statutory Drug License Compliance:** Enforces printing of Form 20B and 21B drug retail license numbers on invoices.
* **GST Ready:** Full support for Indian GST slabs (0%, 5%, 12%, 18%, 28%) with automatic CGST, SGST, and IGST division.
* **Multi-Tenant Isolation:** All database tables enforce strict `tenant_id` and `store_id` foreign key isolation.
* **Hashed Session Tokens:** Secure SHA-256 session tokens stored in `HttpOnly`, `SameSite=Lax` browser cookies.

---

## 📄 License

This project is licensed under the **MIT License**.

---

<div align="center">
  <sub>Built with ❤️ for pharmacists, chemists, and modern healthcare operators.</sub>
</div>
