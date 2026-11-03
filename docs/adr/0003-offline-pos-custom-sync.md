# ADR 0003 · Offline POS with a custom pull/push sync (IndexedDB + idempotent sales API)

- **Status:** accepted · 2026-11-03 · accepted by Lane A at start of Phase 4

## Context
The primary customers are pharmacy chains in India, where shops regularly lose internet. The POS must keep billing offline (decision taken with the product owner on 2026-10-20: "Cloud + offline POS").

Options considered:
1. **General sync engines** (PowerSync, ElectricSQL, Zero, Turso). They replicate Postgres subsets to a client DB. They're powerful, but they bring extra infrastructure (replication service, logical replication), conflict-resolution machinery we don't need, and licence terms to review (PowerSync is FSL-licensed according to third-party summaries).
2. **Desktop app with a local Postgres** (Electron/Tauri). Very robust offline, but it doubles the deployment surface and the update pipeline.
3. **Custom sync.** Pull store catalogue deltas into IndexedDB (Dexie); push locally created sales to an idempotent API; use per-device invoice series.

## Decision
Option 3. Offline writes are **append-only sales**, the easiest case for sync. Conflicts are limited to stock going negative, which we accept and flag rather than reject (the goods already left the shop). The full design is in `docs/10-offline-pos-design.md`.

### Architectural Invariants Formulated in Phase 4 (Task A4.1):
1. **Independent Device Principals**: Devices are independently authenticated principals (`DeviceAuthCtx`), not users. A device token scopes requests strictly to one tenant and one store, but does not grant user permissions or dispense compliance drugs without an authenticated user context.
2. **Permanent Invoice-Series Namespaces**: Each physical billing terminal is permanently allocated a unique 2-character uppercase alphanumeric code (`[0-9A-Z]{2}`) per store, enforcing statutory GST Rule 46 ($\le 16$ characters) for offline invoice series (`sale:dev<CODE>`).
3. **Credential Storage & Rotation**: Device pairing tokens have 256 bits of server-generated entropy (`mf_dev_<64hex>`) and are stored exclusively as SHA-256 hashes. Credential rotation (`rotateDeviceToken`) invalidates the old token immediately while preserving device identity and invoice series.
4. **Immediate Server-Side Revocation**: Revoked devices are rejected at the database level on every sync request.
5. **Restrictive Store Deletion**: Store foreign keys to devices are set to restrictive deletion (`onDelete: "restrict"`) to prevent accidental destruction of device audit history and invoice-series records.

## Consequences
- We own about 1,500 lines of sync code and must test it thoroughly (unit, integration and Playwright offline E2E).
- Some tables need `updated_at` and soft-delete for delta pulls.
- `recordStockMovement` gets an `allowNegative` option, restricted to sync.
- If we later need offline purchases or multi-device editing, revisit option 1 in a new ADR.
