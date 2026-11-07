# Route & Server Action Security Inventory (Phase 6.4 - A6.4)

> **Document Version:** 1.0  
> **Audited Routes:** 32 API Routes · 55 Server Action Modules  
> **Audit Standard:** `docs/13-security.md` 8-Point Operational Security Checklist

---

## 1. API Route Classification & Authorization Boundary (32 Routes)

| Route Path | Auth Mechanism | Scoping & Isolation | Audit Trail |
|---|---|---|---|
| `/api/cron/outbox` | Bearer `CRON_SECRET` | System worker | Diagnostic logs |
| `/api/cron/reminders` | Bearer `CRON_SECRET` | Tenant-scoped queues | Diagnostic logs |
| `/api/v1/stock/check` | Bearer `mf_live_*` API Key (`stock.read`) | `ctx.tenantId`, `ctx.storeId` | API Key `last_used_at` |
| `/api/v1/orders` | Bearer `mf_live_*` API Key (`orders.write`) | `ctx.tenantId` | API Key `last_used_at` |
| `/api/v1/mobile/stock` | Bearer Mobile JWT | `session.tenantId`, `session.storeId` | Access log |
| `/api/v1/mobile/auth/device/enroll` | Device fingerprint + Admin OTP | Tenant enrollment flow | `writeAudit(device_enrolled)` |
| `/api/v1/mobile/auth/login` | PIN + Device Token | Tenant rate-limited | `writeAudit(login)` |
| `/api/v1/mobile/auth/revoke` | Mobile Session / Admin | Scoped to device id | `writeAudit(revoke)` |
| `/api/v1/mobile/auth/refresh` | Refresh Token rotation | Single-use token hash | Security log |
| `/api/v1/mobile/approvals/decide` | Session + Manager Role | Tenant & Store scoped | `writeAudit(approval_decision)` |
| `/api/v1/mobile/approvals/challenge`| Session + Manager Role | Step-up OTP | Security log |
| `/api/v1/mobile/approvals` | Session + Manager Role | Tenant scoped list | Access log |
| `/api/v1/mobile/delivery/collect-cash` | Courier Device Token | Store cash drawer | `writeAudit(cash_collection)` |
| `/api/v1/mobile/delivery/transition` | Courier Device Token | Scoped order id | `writeAudit(delivery_transition)`|
| `/api/v1/mobile/delivery/proof/complete` | Courier Device Token | OTP verification | `writeAudit(delivery_proof)` |
| `/api/v1/mobile/delivery/proof/initiate` | Courier Device Token | Scoped order id | OTP dispatch log |
| `/api/v1/mobile/delivery/upi-intent` | Courier Device Token | Dynamic Razorpay QR | Payment ref log |
| `/api/v1/mobile/delivery/assign` | Session (`order.assign`) | Store scoped | `writeAudit(delivery_assign)` |
| `/api/v1/mobile/delivery/assigned` | Courier Device Token | Courier user id | Access log |
| `/api/v1/mobile/webhooks/razorpay` | Razorpay Webhook HMAC | Webhook signature check | `writeAudit(payment_capture)` |
| `/api/v1/mobile/dashboard` | Courier Session | User and Store scoped | Access log |
| `/api/chat` | User Session (`chat.access`) | `session.tenantId` | Model call log |
| `/api/health` | Public Liveness / DB Readiness | Read-only connection probe | None (healthcheck) |
| `/api/webhooks/whatsapp` | Meta `X-Hub-Signature-256` HMAC | App Secret HMAC-SHA256 | Webhook event log |
| `/api/export/batches` | Session (`inventory.export`) | `ctx.tenantId`, `ctx.storeId` | Security access log |
| `/api/export/sales` | Session (`sale.export`) | `ctx.tenantId`, `ctx.storeId` | Security access log |
| `/api/export/purchases` | Session (`purchase.export`) | `ctx.tenantId`, `ctx.storeId` | Security access log |
| `/api/pos/search` | POS Device HMAC Token | `device.tenantId`, `device.storeId` | Cached query log |
| `/api/pos/sale` | POS Device HMAC Token | Atomic multi-entity commit | `writeAudit(sale_create)` |
| `/api/sync/sales` | Sync Device Token | Atomic offline batch commit | `writeAudit(offline_sync)` |
| `/api/sync/pull` | Sync Device Token | Store scoped delta stream | Sync counter log |
| `/api/sync/reserve-numbers` | Sync Device Token | Store sequence allocation | `writeAudit(sequence_reserve)` |

---

## 2. Server Action Categories & Authorization (55 Modules)

| Category | Modules | Enforcement Pattern | Audit Disposition |
|---|---|---|---|
| **Financial & Cash Management** | `sales.ts`, `cash-sessions.ts`, `payments.ts`, `receivables.ts`, `expenses.ts`, `opening-balances.ts`, `year-end.ts`, `accounting-periods.ts`, `bank-reconciliation.ts` | `requirePermission` + `ctx.tenantId` | Mandatory `writeAudit` on all mutations, cash balancing, period locking, and voucher commits. |
| **Inventory & Procurement** | `stock.ts`, `inventory.ts`, `inventory-import.ts`, `purchases.ts`, `purchase-orders.ts`, `purchase-returns.ts`, `transfers.ts`, `central-purchasing.ts`, `reorder.ts`, `quarantine.ts`, `stocktake.ts`, `conflicts.ts`, `expiry-redistribution.ts`, `racks.ts` | `requirePermission` + `ctx.storeId` | Mandatory `writeAudit` on manual stock adjustments, FEFO overrides, return approvals, and transfer dispatch. |
| **GST & Regulatory Compliance** | `gst.ts`, `gst-2b.ts`, `compliance.ts`, `distributor-invoice.ts` | `requirePermission("compliance.view")` | Statutory registers (Schedule H, H1, Narcotics) tamper-proofed; e-way bill and e-invoice generation audited. |
| **Identity & Administration** | `auth.ts`, `users.ts`, `session.ts`, `devices.ts`, `api-keys.ts`, `stores.ts`, `store-settings.ts`, `settings.ts`, `customer-groups.ts`, `customers.ts`, `suppliers.ts`, `schemes.ts`, `loyalty.ts`, `medical-reps.ts` | `requirePermission` (admin/owner) | Mandatory `writeAudit` on role changes, user invite/suspend, device revoke, API key creation, and master data edits. |
| **Communication & Notifications** | `whatsapp.ts`, `sms.ts`, `sms-templates.ts`, `reminders.ts` | `requirePermission` | Template updates and bulk dispatch operations logged to audit log. |
| **Reporting & Analytical Views** | `reports.ts`, `accounting-reports.ts`, `dashboard.ts`, `audit.ts` | `requirePermission("report.view")` | Read-only scoped queries; multi-store access gated by `m.allStores` or `store.switch_any`. |

---

## 3. Findings & Security Disposition

1. **Zero Unauthenticated Direct Mutations**: Every state mutation is validated by Zod schemas and gated by either session RBAC, device HMAC, or webhook cryptographic signatures.
2. **Strict Multi-Tenant Scoping**: All database operations query via `tenantId` resolved from cryptographic server tokens or sessions, never from user-supplied request payloads.
3. **Audit Trail Coverage**: All sensitive mutations (prices, stock adjustments, register operations, permissions) write immutable rows to `audit_logs`.
