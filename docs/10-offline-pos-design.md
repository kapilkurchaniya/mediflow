# 10 · Offline POS design

**Status:** proposed. Owner: Lane A. Built in Phase 4. Decision: [ADR 0003](adr/0003-offline-pos-custom-sync.md).

## Goal and scope

When the internet drops, the counter must keep **billing** for hours. Everything else (purchases, accounting, reports, settings) may show "you're offline" and wait.

What works offline:
- Search medicines (name, salt, barcode) with batch stock **as of the last sync**.
- Build a cart, apply line and bill discounts and schemes, take **cash / UPI (manual reference) / card (manual)** payments.
- Capture compliance details for H/H1/X drugs.
- Pick or quick-create a customer.
- Print the invoice (thermal or A4). Printing is a browser feature and works offline.
- See a "N bills waiting to sync" badge.

Not offline: credit sales above the customer's last-known limit (blocked, or allowed only with a manager PIN), sale returns, loyalty redemption (points earn on sync), e-invoice, and WhatsApp receipts (queued until sync).

## Architecture

```
┌───────────────── Browser (POS tab, installed as a PWA) ─────────────────┐
│  POS UI (React)                                                         │
│    │ reads/writes                                                       │
│  src/offline/db.ts  ── IndexedDB via Dexie                              │
│    tables: medicines, batches, customers, doctors, schemes, settings,   │
│            pendingSales (outbox), syncState                             │
│    ▲                         │                                          │
│    │ pull deltas             │ push pending sales                       │
│  src/offline/sync.ts  (runs on an interval + on `online` event)         │
│  public/sw.js  service worker: caches the POS app shell & assets        │
└──────┬─────────────────────────┬────────────────────────────────────────┘
       │ GET /api/sync/pull?since=cursor        POST /api/sync/sales (batch)
┌──────▼─────────────────────────▼────────────────────────────────────────┐
│ Server: device-authenticated route handlers                             │
│  pull: rows of this store changed since cursor (updated_at > cursor)    │
│  push: for each sale → idempotency check → createSaleFromSync(tx, …)    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key decisions

### 1. Invoice numbering offline: a per-device series

The server issues gap-free numbers today, but an offline device can't ask the server. GST Rule 46(b) **allows multiple series** as long as each is consecutive and unique within the financial year, and each number is ≤ 16 characters. So:

- Each POS device is registered (new table `devices`: `id, tenant_id, store_id, code, name, api_token_hash, last_seen_at, revoked_at`).
- Each device gets a device code (`01`…`99`) and **its own `doc_sequences` row** (`doc_type = 'sale:dev01'`).
- The device holds a **reserved block of numbers**, e.g. 200 at a time. It fetches a new block while online, when the remaining count drops below 50.
- Number format: `{store.code(≤4)}{device(2)}/{FY 4 digits}/{seq 6}`, e.g. `MAIN01/2526/000123` is 18 characters, which is **too long**. Use `M101/2526/000123` (16). Store codes for invoice purposes must be ≤ 2 characters, or drop the slash separators: `MN01-2526-00123` (15). **Validate the length when the store or device is created.**
- Unused reserved numbers at year end are fine: cancelled/unused numbers are reported in GSTR-1's document summary.

### 2. Stock conflicts: accept the sale, flag the difference

Offline device A and online device B can both sell the last strip. The goods have **physically left the shop**, so rejecting the synced sale would make the books lie.

- `recordStockMovement` gains an option `allowNegative: true`, used **only** by sync.
- If the balance goes negative, the sale is still recorded and a `notifications` row (`type: "stock_conflict"`, severity `warning`) is raised for the store manager. The manager fixes it with a stock adjustment, a transfer, or by moving the sale to another batch.
- Online billing still rejects insufficient stock as today.

### 3. Idempotency: a sale is synced exactly once

- The device creates the sale's UUID locally (`crypto.randomUUID()`) **and** its invoice number.
- `POST /api/sync/sales` handles each sale in its own transaction:
  1. `INSERT INTO idempotency_keys (tenant_id, scope='sync.sale', key=<sale uuid>) ON CONFLICT DO NOTHING RETURNING`. If nothing is returned, the sale already exists: return the stored response.
  2. `createSaleFromSync(tx, ctx, payload)` reuses the same domain function as online sales (`domain/sales/create-sale.ts`), with `source: "offline"`, `allowNegative: true`, prices **taken from the payload** but checked against the batch's last-known price (deviation over 1% is flagged, not rejected), and the invoice number taken from the payload after checking it belongs to that device's series.
  3. Store the response in `idempotency_keys.response`.
- The device marks the sale synced only after a 200 response for that sale id. Network failure means it retries later, and duplicates are harmless.

### 4. Pull sync: cursor on `updated_at`

- Add `updated_at` (with a trigger or app-level update) to `batches`, `customers`, `doctors`, `schemes`, `medicines` (already has it), plus soft-delete flags (`is_active`).
- `GET /api/sync/pull?since=<iso>&limit=5000` returns `{ medicines: [...], batches: [...], …, cursor: <max updated_at> }` for the device's store only.
- First sync downloads the full store catalogue. Measure it: 50k medicines is about 15 MB of JSON, so gzip it and page it.
- Batches carry `qty_on_hand` as of the pull. After each local sale, the device decrements its local copy.

### 5. Device authentication

- An owner/manager registers a device from Settings → Devices. The server returns a **one-time device token**, which the device stores in IndexedDB. The server stores only its sha256, the same pattern as sessions.
- Sync endpoints accept `Authorization: Bearer <device token>`. That gives tenant, store and device. Cookie sessions still work for normal pages.
- Revoking a device stops sync immediately. Pending local sales from a revoked device must be exported manually: there's an "export pending bills" button that downloads JSON for support.

### 6. Service worker and PWA

- `src/app/manifest.ts` (Next.js built-in manifest convention; see `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`).
- A hand-written `public/sw.js`: precache the POS route's HTML shell, JS and CSS, and fonts. Use network-first for navigations, falling back to cache for `/dashboard/sales/pos`. Don't cache API responses in the SW; data lives in IndexedDB.
- Register the SW only on the POS page and only in production builds.
- The offline POS page must render **without a server round-trip**, so it needs a client-only entry: `/dashboard/sales/pos` becomes a thin server page wrapping a `"use client"` `<PosTerminal/>` that reads from Dexie when offline.

### 7. Why not PowerSync / ElectricSQL / Zero?

Those are general sync engines that replicate Postgres to the client (see ADR 0003). They're excellent, but:
- Our offline write path is **append-only** (new sales). There's no collaborative editing of the same row, which is the hard problem those tools solve.
- They add infrastructure (a replication service, logical replication slots) and licences to evaluate (PowerSync uses FSL, which restricts building a competing product; check the current terms).
- A custom pull and push with idempotency keys is about 1,500 lines we fully control and can test.

Revisit if we need offline purchases or multi-device collaborative editing.

## Files (summary; the full task list is in ROADMAP Phase 4A)

```
src/offline/db.ts                 Dexie schema
src/offline/sync.ts               pull/push loop, backoff, online/offline events
src/offline/invoice-series.ts     reserved number blocks
src/offline/usePosData.ts         hook: reads Dexie when offline, server when online
src/app/api/sync/pull/route.ts
src/app/api/sync/sales/route.ts
src/app/api/sync/reserve-numbers/route.ts
src/server/domain/devices.ts      register/revoke/authenticate devices
src/server/domain/sales/create-sale.ts  (extracted from actions/sales.ts in Phase 2A)
src/app/manifest.ts
public/sw.js
src/app/dashboard/settings/devices/page.tsx
```

## Test plan

- Unit: invoice series formatting and length, block reservation math.
- Integration: sync the same sale twice → one sale. Sync a sale that drives stock negative → recorded, plus a notification.
- E2E (Playwright): `context.setOffline(true)`, bill 3, reload the page (the SW serves the shell), bill 1 more, go online, wait for the badge to reach 0, and assert 4 sales exist on the server with the device's series.
