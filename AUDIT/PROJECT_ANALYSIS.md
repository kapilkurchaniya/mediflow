# MediFlow — Comprehensive Project Architecture Analysis

> **Audit Date:** November 2026  
> **Target Application:** MediFlow — Pharmacy Operating System (MARG ERP Modernization)  
> **Status:** Full Codebase & Architecture Inspection  

---

## 1. Executive Summary

**MediFlow** is a modern, high-throughput Pharmacy Operating System (POS & ERP) designed to replace legacy desktop systems (such as Marg ERP, Vyapar, and Busy) in the Indian retail and wholesale pharmaceutical market. It unites high-speed counter billing (POS), FEFO/batch inventory management, multi-store warehousing, statutory Schedule H/H1/NDPS compliance registers, automated GST tax filing (GSTR-1, GSTR-3B, e-Invoicing), supplier credit management, and AI-assisted medicine catalog enrichment into a single cloud-native application.

---

## 2. Technology Stack Breakdown

| Layer | Technology | Version | Purpose & Architectural Role |
| :--- | :--- | :--- | :--- |
| **Framework** | Next.js (App Router) | `16.3.8` | Hybrid SSR, Streaming React Server Components (RSC), Dynamic route segment caching, Server Actions |
| **Frontend Library**| React | `19.2.8` | Concurrent rendering, `useActionState`, optimistic UI updates, form status hooks |
| **Styling & Design** | Tailwind CSS & PostCSS | `v4.0.0` | Modern CSS-in-JS utility architecture, customized design tokens, custom font-feature tabular numbers |
| **Icons & Assets** | Lucide React | `v1.51.0` | Accessible vector SVG icon library with standardized 16px/20px strokes |
| **Database & ORM** | PostgreSQL & Drizzle ORM | `pg 8.23.1` / `drizzle-orm 0.45.3` | Type-safe SQL schema definitions, automated migrations (`drizzle-kit 0.31.11`), connection pooling |
| **Authentication** | Custom Session Tokens | Node.js `crypto` / `bcryptjs 3.0.3` | Opaque 256-bit cryptographic tokens stored in database, HTTP-only secure cookie transport |
| **Authorization** | RBAC Engine | Custom Domain RBAC | Multi-store scoped permission validator with hierarchical role definitions (`owner`, `pharmacist`, `cashier`, `accountant`, etc.) |
| **AI Integration** | Vercel AI SDK & Gemini/Groq | `@ai-sdk/google 4.0.93`, `@ai-sdk/groq 4.0.59` | Automated OCR invoice parsing, medicine composition extraction, Tavily internet price enrichment |
| **Unit Testing** | Vitest | `v5.0.3` | Ultra-fast Vite-native unit and integration test runner (40 test suites, 327 passing tests) |
| **End-to-End (E2E)**| Playwright | `v1.64.1` | Headless Chromium cross-browser smoke tests, responsive viewport auditing, screenshot verification |
| **Deployment** | Vercel & Neon PostgreSQL | CLI `65.4.0` | Edge networking, serverless node execution, server-side environment isolation |

---

## 3. Project Directory & Folder Structure

```
mediflow/
├── .github/                      # CI/CD Workflows (GitHub Actions lint, typecheck, unit tests, CD deploy gate)
├── .githooks/                    # Git pre-commit and pre-push hook configuration
├── .vercel/                      # Vercel project linkage and build output metadata
├── drizzle/                      # Drizzle SQL migrations and metadata snapshots
├── scripts/                      # Database seeders, test user generators, migration runners
│   ├── seed-e2e.ts               # Deterministic E2E test database seeder
│   ├── seed-test-users.ts        # Role-based test account generator
│   └── setup-db.ts               # Fresh database bootstrapper
├── src/
│   ├── app/                      # Next.js App Router (Routes, Pages, Layouts, Server Actions)
│   │   ├── (auth)/               # Public authentication routes (/login, /register, /invite)
│   │   ├── api/                  # Specialized REST & Webhook endpoints (/api/chat, /api/export, /api/cron)
│   │   ├── components/           # Reusable UI component library (StatCard, PageHeader, DateRangeFilter, etc.)
│   │   ├── dashboard/            # Authenticated application modules
│   │   │   ├── accounting/       # Financial statements (P&L, Balance Sheet, Cash Flow, Ledgers)
│   │   │   ├── compliance/       # Form 35, Schedule H/H1, Narcotics, Prescription audit
│   │   │   ├── customers/        # CRM, Patient master, Loyalty ledger, Customer groups
│   │   │   ├── gst/              # GSTR-1, GSTR-3B, Inward/Outward ITC, E-Invoicing
│   │   │   ├── import/           # Data import staging and migration workbench
│   │   │   ├── inventory/        # Item master, Batches, Stocktake, Quarantine, Smart CSV Import
│   │   │   ├── orders/           # Omnichannel / Online order fulfillment
│   │   │   ├── purchases/        # Purchase GRNs, Purchase Orders, Central PO, Debit Notes
│   │   │   ├── reminders/        # Patient chronic refill reminders
│   │   │   ├── reports/          # Inventory valuation, Expiry redistribution, Commissions, Multi-store
│   │   │   ├── sales/            # POS billing counter, Invoices, Cash register shifts, Returns
│   │   │   ├── settings/         # Store config, Branches, Roles, Staff, Racks, Trade schemes, WhatsApp
│   │   │   ├── suppliers/        # Distributor directory, Accounts payable ledger, Payments
│   │   │   └── whatsapp/         # Broadcast marketing campaigns, HSM templates
│   │   ├── actions/              # Next.js Server Actions (Domain mutations called from forms & client components)
│   │   ├── layout.tsx            # Global root layout, Inter font, toast provider
│   │   └── page.tsx              # Landing / Redirection entrypoint
│   ├── lib/                      # Pure functional utilities (money formatting, date calculations, validation)
│   └── server/                   # Backend core domain logic (isolated from React UI layer)
│       ├── ai/                   # LLM providers, prompt templates, Tavily web search integration
│       ├── audit/                # Immutable append-only audit trail logger
│       ├── auth.ts               # Session creation, validation, cookie management, bcrypt hashing
│       ├── db/                   # Database client, connection pool, schema definitions
│       │   └── schema/           # Drizzle table schemas (inventory, sales, purchases, auth, accounting, gst)
│       ├── domain/               # Core business logic engines (Stock movement, POS billing, FEFO calculation)
│       └── rbac.ts               # Page and action permission guards with store-level scoping
├── tests/
│   ├── e2e/                      # Playwright browser integration tests
│   ├── integration/              # Multi-step transactional integration suites
│   └── unit/                     # Business logic and presentation helper tests
├── package.json                  # Dependencies, test scripts, build pipelines
└── tsconfig.json                 # TypeScript strict compiler options with path alias `@/* -> ./src/*`
```

---

## 4. Frontend & User Interface Architecture

1. **Server-First Data Fetching**:
   - The majority of pages under `src/app/dashboard` are React Server Components (RSC).
   - They call domain services directly in Node.js (e.g., `getBatches`, `getSales`, `getDashboardStats`) without executing intermediate HTTP REST calls.
   - Database queries run directly during page render, reducing network waterfalls and eliminating client loading spinners.

2. **Client Components for High-Velocity Interactivity**:
   - High-velocity counters (POS billing at `/dashboard/sales/pos`) use `"use client"` with optimized local state reducers (`usePosCart`) and keyboard shortcut listeners (`useCartKeyboard`) supporting single-key hotkeys (`F2`, `F8`, `F9`, `Tab`, `Enter`).
   - Modals and filter drawers (e.g. `EditBatchModal`, `DateRangeFilter`, `ExpiryDateFilter`) isolate client state without re-rendering server shell components.

3. **Design Tokens & Accessibility**:
   - Visual tokens follow modern pharmacy UI patterns: crisp tabular numbers (`num` utility class), status badges (`badge-danger`, `badge-warning`, `badge-success`), and contrast-compliant ink colors (`text-ink-900`, `text-ink-600`, `text-ink-400`).
   - Layouts are wrapped in `DashboardShell` which provides a collapsible sidebar, store switcher, active user indicator, and fast navigation command palettes (`Ctrl + K`).

---

## 5. Backend Architecture & Domain Modeling

### 5.1 Zero-API Server Actions Paradigm
Instead of traditional REST controllers, MediFlow utilizes Next.js Server Actions:
- Form submissions and mutations call typed server functions in `src/app/actions/*`.
- Actions enforce authentication (`requireAuth()`) and role-based permissions (`checkPermission()` / `requirePermission()`).
- Database mutations execute inside strict ACID transactions (`db.transaction(async (tx) => { ... })`).
- On successful commit, actions invoke `revalidatePath(...)` to purge Next.js cached server representations across all affected views.

### 5.2 Stock Movement & Immutable Ledger
Stock is never mutated through raw unchecked SQL updates. Instead, physical quantities and inventory valuations are maintained via an immutable double-entry ledger:
- Every inventory change (opening balance, sale deduction, customer return, purchase receipt, supplier debit note, damage write-off, or physical stocktake adjustment) generates an immutable row in `schema.stockMovements`.
- The current batch quantity (`qtyOnHand`) is reconciled with transactional locks (`SELECT ... FOR UPDATE`).
- FIFO/FEFO rules ensure that items with the nearest expiration date are dispatched first at POS counters.

---

## 6. Database Schema & Data Relationships

The relational architecture in PostgreSQL consists of over 35 tables partitioned by `tenantId` and `storeId`:

```
[Tenants] 
   └── [Stores] (Physical branches, drug licenses, GSTIN)
          ├── [Users] & [Memberships] (RBAC Role associations)
          ├── [Medicines] (Item master, composition, HSN, schedule)
          │      └── [Batches] (Batch number, expiry, PTR, MRP, qtyOnHand)
          │             └── [StockMovements] (Immutable ledger)
          ├── [Customers] (Patients, credit limit, loyalty points)
          │      └── [Sales] ── [SaleItems] (POS Invoices & line items)
          │             └── [CashSessions] (Shifts & cash register)
          ├── [Suppliers] (Distributors, DL, GSTIN)
          │      └── [Purchases] ── [PurchaseItems] (GRN inward receipts)
          │             └── [PurchaseOrders] (Outward procurement)
          ├── [Accounts] ── [JournalEntries] (Double-entry financial accounting)
          └── [AuditLogs] (Append-only regulatory activity logs)
```

### Key Monetary Convention:
- **Zero-Floating-Point Money**: All financial fields (MRP, PTR, Purchase Rate, Sale Price, Discounts, GST Tax, Cash Floats) are stored as integer **paise** ($1\text{ Rupee} = 100\text{ paise}$).
- This eliminates JavaScript floating-point rounding errors in multi-item invoices and tax calculations.

---

## 7. Authentication, Sessions & Security Model

1. **Opaque 256-Bit Session Tokens**:
   - Sessions are generated using `crypto.randomBytes(32).toString("hex")`.
   - The raw token is stored in an `HttpOnly`, `SameSite=Lax`, `Secure` cookie named `mediflow_session`.
   - The database stores a SHA-256 hash of the token (`schema.sessions.id`). Even if database read access is compromised, active session cookies cannot be forged.

2. **Session Lifespan & Auto-Extension**:
   - Default validity is 30 days.
   - If a valid session is used within 15 days of expiration, it automatically extends its validity for another 30 days.

3. **Multi-Tenant & Store Isolation**:
   - The active store ID is pinned to the session (`session.storeId`).
   - Every database query in domain repositories enforces:
     ```sql
     WHERE tenant_id = ctx.tenantId AND store_id = ctx.storeId
     ```
   - Cross-tenant data leakage is structurally prevented at the database query layer.

4. **Role-Based Access Control (RBAC)**:
   - System roles:
     - `owner`: Unrestricted administrative access across all stores and financial accounts.
     - `store_manager`: Inventory, billing, customer credit, branch settings, staff registers.
     - `pharmacist`: POS billing, Schedule H/H1 registers, prescription verification, stock lookup.
     - `cashier`: POS counter billing, shift open/close, cash register floats.
     - `purchase_manager`: Supplier procurement, GRN posting, reorder engine, debit notes.
     - `accountant`: Chart of accounts, P&L, Balance Sheet, GST filings, bank reconciliation.

