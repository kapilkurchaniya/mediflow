import { requirePagePermission } from "@/server/rbac";
import { PageHeader } from "@/app/components/ui";
import { db, schema } from "@/server/db";
import { eq, and, desc } from "drizzle-orm";
import {
  getIndianFiscalYear,
  getSequenceRolloverPreview,
  evaluateYearEndReadiness,
} from "@/server/domain/accounting-year-end";
import { YearEndClient } from "./YearEndClient";

export const metadata = {
  title: "Year-End Rollover & Stock Valuation | MediFlow",
  description: "Indian Pharmacy Year-End Sequence Rollover, 6-tier NRV Closing Stock Valuation, and Audit Readiness.",
};

export default async function YearEndPage() {
  const ctx = await requirePagePermission("accounting.view");

  const stores = await db
    .select({ id: schema.stores.id, name: schema.stores.name, code: schema.stores.code })
    .from(schema.stores)
    .where(eq(schema.stores.tenantId, ctx.tenantId));

  const activeStoreId = ctx.storeId || stores[0]?.id;
  const currentFy = getIndianFiscalYear();

  let initialSequencePreview = null;
  let initialReadiness = null;
  let initialSnapshots: Array<typeof schema.yearEndStockSnapshots.$inferSelect> = [];
  let initialItems: Array<typeof schema.yearEndStockItems.$inferSelect> = [];

  if (activeStoreId) {
    try {
      initialSequencePreview = await getSequenceRolloverPreview(ctx.tenantId, activeStoreId, currentFy);
    } catch {
      // Ignored for graceful fallback
    }

    try {
      initialReadiness = await evaluateYearEndReadiness(ctx.tenantId, activeStoreId, currentFy);
    } catch {
      // Ignored for graceful fallback
    }

    initialSnapshots = await db
      .select()
      .from(schema.yearEndStockSnapshots)
      .where(
        and(
          eq(schema.yearEndStockSnapshots.tenantId, ctx.tenantId),
          eq(schema.yearEndStockSnapshots.storeId, activeStoreId),
        ),
      )
      .orderBy(desc(schema.yearEndStockSnapshots.createdAt));

    const latestSnap = initialSnapshots[0];
    if (latestSnap) {
      initialItems = await db
        .select()
        .from(schema.yearEndStockItems)
        .where(
          and(
            eq(schema.yearEndStockItems.tenantId, ctx.tenantId),
            eq(schema.yearEndStockItems.storeId, activeStoreId),
            eq(schema.yearEndStockItems.snapshotId, latestSnap.id),
          ),
        )
        .limit(100);
    }
  }

  const isOwner = ctx.permissions.has("accounting.period.lock");

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Year-End Rollover & Valuation"
        description="Statutory 31 March sequence rollover diagnostics, ICDS II / AS-2 closing stock valuation, and signed GL 1080 reconciliation."
      />

      <YearEndClient
        stores={stores}
        selectedStoreId={activeStoreId}
        currentFy={currentFy}
        initialSequencePreview={initialSequencePreview}
        initialReadiness={initialReadiness}
        initialSnapshots={initialSnapshots}
        initialItems={initialItems}
        isOwner={isOwner}
      />
    </div>
  );
}
