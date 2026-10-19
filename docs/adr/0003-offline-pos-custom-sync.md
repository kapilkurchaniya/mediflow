# ADR 0003 · Offline POS with a custom pull/push sync (IndexedDB + idempotent sales API)

- **Status:** proposed · 2026-10-20 · to be accepted at the start of Phase 4

## Context
The primary customers are pharmacy chains in India, where shops regularly lose internet. The POS must keep billing offline (decision taken with the product owner on 2026-10-20: "Cloud + offline POS").

Options considered:
1. **General sync engines** (PowerSync, ElectricSQL, Zero, Turso). They replicate Postgres subsets to a client DB. They're powerful, but they bring extra infrastructure (replication service, logical replication), conflict-resolution machinery we don't need, and licence terms to review (PowerSync is FSL-licensed according to third-party summaries).
2. **Desktop app with a local Postgres** (Electron/Tauri). Very robust offline, but it doubles the deployment surface and the update pipeline.
3. **Custom sync.** Pull store catalogue deltas into IndexedDB (Dexie); push locally created sales to an idempotent API; use per-device invoice series.

## Decision
Option 3. Offline writes are **append-only sales**, the easiest case for sync. Conflicts are limited to stock going negative, which we accept and flag rather than reject (the goods already left the shop). The full design is in `docs/10-offline-pos-design.md`.

## Consequences
- We own about 1,500 lines of sync code and must test it thoroughly (unit, integration and Playwright offline E2E).
- Some tables need `updated_at` and soft-delete for delta pulls.
- `recordStockMovement` gets an `allowNegative` option, restricted to sync.
- If we later need offline purchases or multi-device editing, revisit option 1 in a new ADR.
