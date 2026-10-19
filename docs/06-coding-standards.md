# 06 · Coding standards

These are the patterns reviewers check for. If you have a reason to break one, say why in the PR.

## 1. Server Action shape (after Roadmap A1)

Today actions call `requireAuth()` and take loose positional arguments. The target is **one wrapper** that authenticates, authorizes and validates. It's built on `next-safe-action`, which is already a dependency (`src/server/action.ts`).

```ts
// src/app/actions/suppliers.ts
"use server";
import { z } from "zod";
import { protectedAction } from "@/server/action";
import { createSupplier as createSupplierDomain } from "@/server/domain/purchasing/suppliers";
import { revalidatePath } from "next/cache";

const CreateSupplierInput = z.object({
  name: z.string().trim().min(2),
  gstin: z.string().trim().toUpperCase().regex(/^\d{2}[A-Z0-9]{13}$/).optional(),
  creditDays: z.coerce.number().int().min(0).max(365).default(30),
});

export const createSupplier = protectedAction("supplier.manage")
  .inputSchema(CreateSupplierInput)
  .action(async ({ parsedInput, ctx }) => {
    const supplier = await createSupplierDomain(ctx, parsedInput); // ctx = { tenantId, storeId, userId, permissions }
    revalidatePath("/dashboard/suppliers");
    return { id: supplier.id };
  });
```

Rules:
- **Never** accept `tenantId`, `storeId`, `userId`, prices or totals from the client. They come from `ctx` or the DB.
- Actions stay thin: validate → call domain → revalidate. Business rules live in `src/server/domain/`.
- Return `{ id }` or small DTOs, never whole DB rows with internal columns, to the client. Do not return error strings that leak SQL.
- Reads in Server Components use the same checks via `requirePermission()` directly. Pages don't need the action wrapper.

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
