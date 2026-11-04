import { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { requirePagePermission } from "@/server/rbac";
import { PageHeader } from "@/app/components/ui";
import { getCurrentShift, getShiftHistory } from "@/server/domain/cash-sessions";
import { RegisterClient } from "./RegisterClient";
import { WarehouseRegisterNotice } from "./WarehouseRegisterNotice";

export const metadata: Metadata = {
  title: "Cash Register & Shifts | MediFlow",
  description: "Retail cashier drawer shift management, X-Report snapshots, and closing Z-Report audits.",
};

export default async function CashRegisterPage() {
  const ctx = await requirePagePermission("register.manage");

  // Store and tenant configuration
  const [store] = await db
    .select({ name: schema.stores.name, kind: schema.stores.kind })
    .from(schema.stores)
    .where(eq(schema.stores.id, ctx.storeId))
    .limit(1);

  if (store?.kind === "warehouse") {
    return (
      <div className="page space-y-6">
        <PageHeader
          title="Cash register & shifts"
          description="Shift open/close drawer tally, mid-shift X-Reports, and closing Z-Report audit reconciliation."
          backHref="/dashboard/sales"
        />
        <WarehouseRegisterNotice storeName={store.name} />
      </div>
    );
  }

  // Load current active shift & past history
  const currentShift = await getCurrentShift(db, ctx);
  const shiftHistory = await getShiftHistory(db, ctx, 25);

  const [tenant] = await db
    .select({ settings: schema.tenants.settings })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, ctx.tenantId))
    .limit(1);

  const requireShiftSetting = Boolean((tenant?.settings as Record<string, unknown>)?.requireShift);

  return (
    <div className="page space-y-6">
      <PageHeader
        title="Cash register & shifts"
        description="Shift open/close drawer tally, mid-shift X-Reports, and closing Z-Report audit reconciliation."
        backHref="/dashboard/sales"
      />

      <RegisterClient
        initialShift={currentShift}
        initialHistory={shiftHistory}
        storeName={store?.name ?? "Retail Counter"}
        requireShiftSetting={requireShiftSetting}
      />
    </div>
  );
}
