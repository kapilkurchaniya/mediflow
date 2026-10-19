# 02 · Architecture

## Stack at a glance

| Layer | Technology | Where |
|---|---|---|
| Framework | Next.js 16.3 (App Router, Turbopack, Server Actions, `proxy.ts`) | `src/app/` |
| UI | React 19, Tailwind CSS v4, lucide-react icons, Recharts | `src/app/**/*.tsx`, `src/app/components/` |
| Server mutations | Server Actions (`"use server"` files) | `src/app/actions/*.ts` |
| Business logic | Plain TypeScript "domain" modules | `src/server/domain/*.ts` |
| Database | PostgreSQL 14+ with `pg_trgm` and `pgcrypto` extensions | — |
| ORM | Drizzle ORM 0.45 + drizzle-kit migrations | `src/server/db/`, `drizzle/` |
| Validation | Zod 4 | actions, `src/env.ts` |
| AI | Vercel AI SDK 7 with Gemini (primary) and Groq (fallback), Tavily web search | `src/app/api/chat/route.ts`, `src/server/ai.ts` |
| Messaging | Meta WhatsApp Cloud API, MSG91 / TextLocal SMS (both have simulators) | `src/server/domain/whatsapp.ts`, `sms.ts` |

> ⚠️ **This is Next.js 16, not the Next.js in most tutorials.** `middleware.ts` is now `proxy.ts` and runs on Node.js by default. Request APIs such as `cookies()` are async. Read `node_modules/next/dist/docs/` before using an API you remember from older versions (see `AGENTS.md`).

## The layers and the one rule that connects them

```
┌──────────────────────────────────────────────────────────────────────┐
│ Browser                                                              │
│  Client Components ("use client") — POS, forms, modals               │
└──────────────┬───────────────────────────────────────────────────────┘
               │ calls a Server Action (RPC over POST) / fetches a Route Handler
┌──────────────▼───────────────────────────────────────────────────────┐
│ src/proxy.ts            optimistic check: "is there a session cookie?"│
│                         NOT security — just a fast redirect to /login │
├──────────────────────────────────────────────────────────────────────┤
│ src/app/dashboard/**/page.tsx   Server Components (read data)        │
│ src/app/actions/*.ts            Server Actions   (write data)        │
│ src/app/api/**/route.ts         Route Handlers   (external callers)  │
│      ▲ AUTHENTICATE + AUTHORIZE + VALIDATE INPUT here, every time     │
├──────┼───────────────────────────────────────────────────────────────┤
│ src/server/domain/*.ts          Business rules (pure-ish, take a tx) │
│ src/lib/money.ts                Pure math shared with the client     │
├──────────────────────────────────────────────────────────────────────┤
│ src/server/db/                  Drizzle schema + pg Pool             │
└──────────────┬───────────────────────────────────────────────────────┘
               ▼
          PostgreSQL
```

**The rule:** every entry point (page, action, route handler) must do these things itself, in order:

1. **Authenticate.** Find out who is calling with `requireAuth()`.
2. **Authorize.** Check that the caller may do this with `requirePermission("sale.create")`. *Not built yet; Roadmap A1.*
3. **Validate.** Parse the input with Zod. Never trust client-supplied prices, totals or tenant IDs.
4. **Scope.** Filter every query by `session.tenantId` (and `session.storeId` for store data).
5. **Delegate.** Call a domain function, inside `db.transaction()` if it writes more than one row.

Next.js's own guidance (`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`) says Proxy "should not be used as a full session management or authorization solution". Server Actions are public HTTP endpoints, so anyone can call them with any arguments.

## Folder map (current, with intended additions marked ➕)

```
src/
├── app/
│   ├── actions/              Server Actions, one file per module (sales.ts, purchases.ts …)
│   ├── api/
│   │   ├── chat/             AI assistant streaming endpoint
│   │   ├── export/           CSV exports
│   │   ├── v1/               External/partner API (stock check, orders) ⚠ needs API-key auth
│   │   ├── webhooks/whatsapp Meta webhook ⚠ needs signature verification
│   │   ├── ➕ sync/           Offline POS sync endpoints (Phase 4)
│   │   └── ➕ cron/           Job runner endpoints (outbox, reminders) (Phase 2B)
│   ├── components/           App shell: Sidebar, Topbar, CommandPalette, AIAssistant, ui.tsx
│   ├── dashboard/            All authenticated pages, one folder per module
│   ├── login/, register/     Auth pages
│   └── ➕ manifest.ts         PWA manifest (Phase 4)
├── lib/                      Code safe for BOTH server and client (money, format, permissions)
├── offline/ ➕               Browser-side offline DB + sync engine (Phase 4)
├── server/                   Server-only code
│   ├── auth.ts               Sessions (sha256-hashed tokens), bcrypt passwords, requireAuth()
│   ├── action.ts             next-safe-action clients (exists, unused today)
│   ├── ➕ rbac.ts             requirePermission(), role seeding (Phase 1A)
│   ├── ➕ audit.ts            writeAudit() helper (Phase 1A)
│   ├── ➕ crypto.ts           encrypt/decrypt secrets at rest (Phase 0B)
│   ├── db/
│   │   ├── index.ts          pg Pool + drizzle instance, type parsers (bigint→number, date→string)
│   │   ├── schema.ts         ALL tables today → ➕ split into schema/*.ts per module (Phase 0A)
│   │   └── migrate.ts        Applies drizzle/ migrations, creates extensions
│   ├── domain/               Business logic modules
│   └── ➕ jobs/               Outbox worker, reminder runner (Phase 2B)
├── env.ts                    Zod-validated environment variables
├── proxy.ts                  Optimistic auth redirect
└── types/
```

## Key flows

### Creating a sale (today: `src/app/actions/sales.ts → createSaleInvoice`)

1. `requireAuth()` loads the session, which holds `tenantId` and `storeId`.
2. It loads the customer and the store's invoice prefix.
3. It opens `db.transaction`, and inside it:
   1. Re-reads batches and medicines from the DB, ignoring client prices.
   2. Rejects the sale if there's too little stock or the batch has expired.
   3. Runs `validateDispensingCompliance` to check the Schedule H/H1/X rules.
   4. Runs `computeSaleTotals` (GST-inclusive back-calculation, rounded to the rupee).
   5. Calls `nextDocNumber` for a gap-free, per-store, per-fiscal-year invoice number.
   6. Inserts the `sales` header.
   7. For each line, calls `recordStockMovement`, which row-locks the batch, writes an immutable `stock_movements` row and updates `qty_on_hand`.
   8. Inserts `sale_items`.
   9. Writes `dispensing_logs` for scheduled drugs.
   10. Inserts `sale_payments` (one row today; split tender is planned).
   11. Calls `postSaleJournalEntry` for the double-entry journal.
   12. Calls `createGstDocumentFromSale`.
   13. Calls `LoyaltyService.earnPoints`.
4. Revalidates paths and sends a WhatsApp receipt synchronously. *This will move to the outbox in Phase 2B.*

This shape is good. The roadmap keeps it and fixes the gaps: permissions, split tender, inter-state GST, savepoints for the optional steps, and the outbox for messages.

### Authentication

- **Login** (`actions/auth.ts → loginAction`): verifies the bcrypt password, picks a membership and store, and creates a session. The cookie `mediflow_session` holds a random 32-byte token. The DB stores only `sha256(token)` as `sessions.id`.
- `validateSessionToken` slides the expiry window: sessions last 30 days and are extended when fewer than 15 days remain.
- `requireAuth()` redirects to `/login` if there is no valid session, or if the session lacks a tenant or store.

## Cross-cutting conventions (details in [06-coding-standards.md](06-coding-standards.md))

- **Money** is integer paise; **rates** are basis points (1200 = 12%). Stock quantities are integers in selling units.
- **Stock is never edited directly.** Always use `recordStockMovement()`.
- **Document numbers** come from `nextDocNumber()`, never `count(*)+1`.
- **Dates:** Postgres `date` columns come back as `'YYYY-MM-DD'` strings (custom type parser in `db/index.ts`), which avoids timezone bugs.
- **Multi-tenancy:** every business table has `tenant_id`; store-scoped tables also have `store_id`.

## Target architecture additions (built during the roadmap)

| Addition | Why | Phase |
|---|---|---|
| Schema split into `src/server/db/schema/*.ts` | Two developers editing one 1,261-line file guarantees merge conflicts | 0A |
| `requirePermission` + `protectedAction(permission)` wrapper | Permissions exist in `src/lib/permissions.ts` but nothing checks them | 1A |
| Outbox worker (`outbox_events` table already exists) | Send WhatsApp/SMS/e-invoice calls reliably *after* the DB commit, with retries | 2B |
| API keys for `/api/v1/*` | Partner/e-retail integrations need machine authentication scoped to one tenant | 0B / 2B |
| Offline POS (PWA + IndexedDB + sync API) | Billing must survive internet loss | 4A |
| Multi-store: store switcher, transfers, warehouse | Primary customer is chains | 3A/3B |
| Import wizard | Customers must be able to leave Marg in an hour | 4B |
