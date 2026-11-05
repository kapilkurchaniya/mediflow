import { requirePagePermission } from "@/server/rbac";
import { PageHeader } from "@/app/components/ui";
import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import {
  getOpeningBalancesSummary,
  getPartyOpeningBalances,
} from "@/server/domain/accounting-opening-balances";
import { OpeningBalancesClient } from "./OpeningBalancesClient";

export const metadata = {
  title: "Opening Balances & Equity Reconciliation | MediFlow",
  description: "Manage customer, supplier, and inventory opening balances with double-entry equity tracking.",
};

export default async function OpeningBalancesPage() {
  const ctx = await requirePagePermission("accounting.view");

  const summary = await getOpeningBalancesSummary(ctx.tenantId);
  const customers = await getPartyOpeningBalances(ctx.tenantId, "customer", 100);
  const suppliers = await getPartyOpeningBalances(ctx.tenantId, "supplier", 100);

  const stores = await db
    .select({ id: schema.stores.id, name: schema.stores.name })
    .from(schema.stores)
    .where(eq(schema.stores.tenantId, ctx.tenantId));

  const isOwner = ctx.permissions.has("accounting.period.lock");

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Opening Balances & Equity"
        description="Initialize customer receivables, supplier payables, and cutover stock with double-entry integrity balanced against Opening Balance Equity (Account 3999)."
      />

      <OpeningBalancesClient
        summary={summary}
        customers={customers}
        suppliers={suppliers}
        stores={stores}
        isOwner={isOwner}
      />
    </div>
  );
}
