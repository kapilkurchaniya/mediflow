import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db, schema } from "@/server/db";
import { requirePagePermission, loadAuthCtx } from "@/server/rbac";
import { requireAuth } from "@/server/auth";
import { listExpenseAccounts } from "@/server/domain/expenses";
import { PageHeader } from "@/app/components/ui";
import { ExpenseForm } from "./_components/ExpenseForm";

export const metadata = { title: "New Expense Voucher | Accounting" };

export default async function NewExpensePage() {
  await requirePagePermission("accounting.post");
  const { session, user } = await requireAuth();
  const ctx = await loadAuthCtx(db, session, user);

  const categories = await listExpenseAccounts(db, ctx.tenantId);

  const [openSession] = await db
    .select({ id: schema.cashSessions.id })
    .from(schema.cashSessions)
    .where(
      and(
        eq(schema.cashSessions.tenantId, ctx.tenantId),
        eq(schema.cashSessions.storeId, ctx.storeId),
        eq(schema.cashSessions.status, "open"),
      ),
    )
    .limit(1);

  const [store] = await db
    .select({ name: schema.stores.name })
    .from(schema.stores)
    .where(and(eq(schema.stores.tenantId, ctx.tenantId), eq(schema.stores.id, ctx.storeId)))
    .limit(1);

  return (
    <div className="page space-y-6 max-w-4xl">
      <PageHeader
        title="Record Operating Expense"
        description="Post an atomic double-entry expense voucher for store operations."
        actions={
          <Link href="/dashboard/accounting/expenses" className="btn btn-ghost btn-sm text-[13px]">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to Expenses
          </Link>
        }
      />

      <ExpenseForm
        categories={categories}
        hasOpenShift={Boolean(openSession)}
        storeName={store?.name || "Active Store"}
        initialOperationId={crypto.randomUUID()}
      />
    </div>
  );
}
