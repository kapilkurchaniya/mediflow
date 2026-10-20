# 06 · Coding standards

These are the patterns reviewers check for. If you have a reason to break one, say why in the PR.

## 1. Server Action shape (implemented in Roadmap A1.1/A1.2)

Every action is built with `protectedAction(permission)` from `src/server/action.ts` (a thin layer over `next-safe-action`). The reference implementation is **`src/app/actions/racks.ts`**: copy its shape.

```ts
// src/app/actions/racks.ts (abridged)
"use server";
import { z } from "zod";
import { protectedAction } from "@/server/action";
import { DomainError } from "@/server/errors";

export const deleteRack = protectedAction("medicine.manage")          // 1. permission checked BEFORE anything runs
  .inputSchema(z.object({ id: z.string().uuid() }))                   // 2. validated input; bad input never reaches the body
  .action(async ({ parsedInput: { id }, ctx }) => {                   // 3. ctx = { tenantId, storeId, userId, permissions }
    await findOwnRack(ctx, id);                                       // 4. every lookup scoped by ctx.tenantId + ctx.storeId
    ...
    return { deleted: true };
  });
```

Client side: `const res = await deleteRack({ id })`, then `const err = actionError(res)` (from `@/lib/action-result`, returns a message or null) and read `res.data`.

Rules:
- **Never** accept `tenantId`, `storeId`, `userId`, prices or totals from the client. They come from `ctx` or the DB.
- Throw `DomainError(code, message)` for expected failures (not found, duplicate, insufficient stock): the message is shown to the user. Any other exception is logged and shown as a generic message.
- Actions stay thin: validate, call domain code, revalidate. Business rules live in `src/server/domain/`.
- Return small objects (`{ rack }`, `{ id }`), never whole rows with internal columns you do not need.
- **Reads** used by Server Components or client effects stay plain async functions that start with `await requirePermission("x.view")`.
- **Pages** start with `await requirePagePermission("x.view")`: it renders the friendly 403 screen (`src/app/forbidden.tsx`) instead of crashing. It uses Next's experimental `forbidden()` (`experimental.authInterrupts` in `next.config.ts`), isolated in `src/server/rbac.ts` so it is easy to swap.
- Unique-constraint errors: use `isUniqueViolation(err, "constraint_name")` from `@/server/db/errors`. Drizzle wraps driver errors, so matching on `err.message` does not work.
- Test an action with `tests/integration/racks-actions.test.ts` as the template (real RBAC, only the session is faked).

### Roles and permissions
- Permissions are strings (`src/lib/permissions.ts`); code checks permissions, never role names.
- System roles (owner, manager, pharmacist, cashier, purchase_manager, accountant, auditor) are rows in the database per tenant, generated from `SYSTEM_ROLES` by `seedSystemRoles` (`src/server/roles.ts`). It runs at registration, in `db:seed`, and after every `db:migrate` (so changing a template in code updates every tenant). System roles are authoritative: the database is made to match the template.
- To add a permission: add the key to `PERMISSIONS`, add it to the right role templates, run `npm run db:migrate`.

## 2. Domain function shape

```ts
// src/server/domain/purchasing/suppliers.ts
import "server-only";
import type { DbOrTx } from "@/server/db";
import { db, schema } from "@/server/db";

export interface Ctx { tenantId: string; storeId: string; userId: string }

export async function createSupplier(ctx: Ctx, input: NewSupplierInput, tx: DbOrTx = db) {
  const [row] = await tx.insert(schema.suppliers).values({ ...input, tenantId: ctx.tenantId }).returning();
  await writeAudit(tx, ctx, { action: "create", entityType: "supplier", entityId: row.id, newValue: row });
  return row;
}
```

- The first parameter is `ctx`, and the last is an optional `tx` so callers can compose functions inside one transaction.
- Anything that writes **more than one row** runs in a transaction.
- **Optional side-steps inside a transaction** (loyalty, GST doc, notifications) either:
  - run in a savepoint: `await tx.transaction(async (sp) => { … })`, where an error rolls back only the savepoint. Catch it *outside* the inner call. Or
  - go to the outbox (`enqueue(tx, "whatsapp.receipt", payload)`) and run after commit. This is the preferred way for anything that calls an external API.
- **Never** call an external HTTP API inside a DB transaction. It holds row locks while waiting on the network.
- Domain modules can be unit-tested without Next.js. Don't import `next/*` inside `src/server/domain/`.

## 3. Money, tax and numbers

- Use `src/lib/money.ts` for all arithmetic: `computeSaleTotals`, `computePurchaseTotals`, `taxFromInclusive`, `taxOnExclusive`, `roundToRupee`.
- Convert at the edges only: `toPaise()` when parsing user input, `formatINR()` when displaying.
- Rates come from `src/lib/regulatory.ts` (doc 05 §5), never magic numbers.
- `Math.round` for paise; the odd paisa goes to SGST (already handled in `splitTax`).

## 4. Multi-tenancy checklist (every query)

```ts
.where(and(eq(t.tenantId, ctx.tenantId), eq(t.storeId, ctx.storeId), …))
```

- Fetching by `id`? **Still** add `tenantId`, so a guessed UUID from another tenant returns nothing.
- Child tables (`sale_items`) are reached through a parent that was already tenant-checked, or filtered by their own `tenant_id`.
- Raw SQL (`db.execute(sql\`…\`)`) must use `${param}` placeholders, never string concatenation, and must include `tenant_id = ${ctx.tenantId}`.

## 5. TypeScript

- `strict` is on. **No new `any`.** Use `unknown` and narrow it, or infer types from Drizzle (`typeof schema.sales.$inferSelect`).
- No `// @ts-nocheck` or `// @ts-ignore`. If a library type is wrong, write a typed wrapper and add `// @ts-expect-error <reason>` on one line.
- Shared input types are Zod schemas (`z.infer<typeof X>`), so client and server agree.

## 6. React / Next.js 16

- Pages are **Server Components** by default. Add `"use client"` only to the interactive leaf (form, modal, POS terminal).
- Request APIs are async: `const c = await cookies()`, `const { id } = await params`.
- Mutations go through Server Actions, then `revalidatePath()`. Avoid client-side fetching to our own API from our own pages.
- Big client components (POS is 1,427 lines) get split into `components/` subfolders next to the page, with state in a reducer or custom hook (`usePosCart`).
- Use `after()` from `next/server` for post-response work that doesn't need durability, such as metrics. Use the **outbox** for work that must not be lost, such as WhatsApp receipts.
- Read `node_modules/next/dist/docs/` before using any API you haven't used in this repo.

## 7. Naming

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case for modules, PascalCase for components | `stock-transfers.ts`, `TransferForm.tsx` |
| DB columns | snake_case in SQL, camelCase in TS | `qty_on_hand` / `qtyOnHand` |
| Permissions | `module.verb` | `inventory.transfer` |
| Doc types for `nextDocNumber` | snake_case nouns | `sale`, `sale_return`, `stock_transfer` |
| Server actions | verb + noun | `createStockTransfer`, `receiveStockTransfer` |

## 8. Commits & PRs

- Conventional commits: `feat(pos): split tender payments`, `fix(gst): inter-state IGST`, `chore(ci): …`, `docs: …`, `test: …`, `refactor: …`.
- One roadmap item per PR where possible. A PR over ~600 changed lines (excluding generated migrations and lockfiles) should be split.
- Fill in the PR template checklist.

## 9. Errors & logging

- Domain functions throw typed errors (`class DomainError extends Error { code: "INSUFFICIENT_STOCK" | … }`). Actions map them to user-friendly messages.
- Use `console.error` only at boundaries. Structured logging (pino) arrives in Phase 6.
- Never log full patient records, tokens or API keys.
