# 13 · Security

## Threat model (who might attack, and what they want)

| Actor | Goal | Main defence |
|---|---|---|
| Anonymous internet user | Read other pharmacies' data, inject orders or messages | Every route authenticates; `/api/v1/*` needs API keys; webhooks verify signatures |
| Logged-in user of tenant A | Read or change tenant B's data | Every query is scoped by `tenantId` from the session, never from input; tenant-isolation tests |
| Cashier (low-privilege staff) | See margins, give unauthorised discounts, delete bills, export customer lists | RBAC enforced server-side; audit log; discount-override permission |
| Stolen laptop or POS device | Use a saved session or device token | Session expiry; device revocation; no secrets in localStorage |
| Compromised third party (WhatsApp, SMS, AI provider) | Data exfiltration | Send minimal data; secrets encrypted at rest; per-tenant credentials |
| The AI assistant itself (prompt injection) | Run write actions the user didn't intend | Tools respect user permissions; write tools need explicit confirmation (`ai_actions.status = pending_confirmation`) |

## Known vulnerabilities (from the 20 Oct 2026 audit) and the fix

| # | Issue | Fix | Roadmap |
|---|---|---|---|
| S1 | `/api/v1/stock/check` is unauthenticated and cross-tenant | Require an API key (`Authorization: Bearer mf_live_…`) that maps to one tenant; filter by that tenant and store; rate-limit | B0.1 |
| S2 | `/api/v1/orders` takes `tenantId` from the body and defaults to the first tenant; `GET` has no tenant check | Same API-key scheme; `tenantId` comes from the key only; `GET` filters by tenant | B0.1 |
| S3 | Permissions are never enforced | `requirePermission` + `protectedAction`; seed `role_permissions` | A1.1–A1.3 |
| S4 | WhatsApp webhook: no signature check; hard-coded verify token | Verify `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with `WHATSAPP_APP_SECRET`, compared with `crypto.timingSafeEqual`); delete the hard-coded token | B0.2 |
| S5 | Simulated e-invoice can produce fake IRNs and QR codes | Rename to `SimulatedIRPProvider`; refuse to run unless `EINVOICE_MODE=sandbox`; print "SANDBOX – NOT A VALID E-INVOICE" on documents | B0.3 |
| S6 | Plaintext third-party secrets in DB | `src/server/crypto.ts` AES-256-GCM with `APP_ENCRYPTION_KEY`; migrate existing rows; never return secrets to the client (show `••••last4`) | B0.4 |
| S7 | No login throttling | Count failures per email and per IP in a table (or Postgres-backed limiter); lock 15 min after 10 failures; generic error message | A1.5 |
| S8 | `@ts-nocheck` on the AI route | Remove; type the tools; scope every SQL query | B6.1 |

## API keys for `/api/v1/*` (design)

```
api_keys
  id, tenant_id, store_id (nullable = all stores), name, prefix (first 8 chars, shown in UI),
  key_hash (sha256), scopes text[] ('stock.read', 'orders.write'), last_used_at, revoked_at, created_by, created_at
```

- Format: `mf_live_<32 random bytes base62>`. Show the full key **once** at creation.
- Helper `authenticateApiKey(req, requiredScope)` in `src/server/api-auth.ts` returns `{ tenantId, storeId, keyId }` or throws a 401/403.
- Add `/api/v1` and `/api/webhooks` to `proxy.ts` as cookie-free routes. Those handlers do their own auth.

## Security checklist for every PR

- [ ] Input validated with Zod (lengths, formats, enums)
- [ ] `requirePermission(...)` for the specific action
- [ ] All queries scoped by `ctx.tenantId` (+ `storeId`)
- [ ] No IDs, prices or tenant/store from the client trusted without a DB check
- [ ] No secrets or PII in logs or error messages
- [ ] Raw SQL uses `sql\`${param}\`` placeholders only
- [ ] New route handler? It authenticates itself; don't rely on `proxy.ts`
- [ ] Sensitive change (price, discount override, stock adjustment, register edit, role change) → `writeAudit(...)`

## Operational security (Phase 6)

- HTTPS only; `secure` cookies (already set in production).
- Security headers: CSP, `X-Frame-Options: DENY`, `Referrer-Policy`. Read the Next 16 CSP guide in `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`.
- Daily encrypted DB backups with point-in-time recovery, and a **quarterly restore test**.
- Dependency updates: Dependabot or Renovate, plus `npm audit` in CI (non-blocking at first).
- Least-privilege DB user for the app (no superuser in production; extensions created by a migration role).
- A DPDP-ready breach response runbook (doc 05 §3).
