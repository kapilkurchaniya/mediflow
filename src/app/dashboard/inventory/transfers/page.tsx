import { requirePermission } from "@/server/rbac";
import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { listTransfers } from "@/server/domain/inventory/transfers";
import { TransfersListClient } from "./TransfersListClient";

export default async function TransfersPage() {
  const ctx = await requirePermission("inventory.view");

  const [transfers, stores] = await Promise.all([
    listTransfers(ctx.tenantId, { limit: 100 }),
    db
      .select({ id: schema.stores.id, name: schema.stores.name })
      .from(schema.stores)
      .where(eq(schema.stores.tenantId, ctx.tenantId)),
  ]);

  return (
    <div className="p-6">
      <TransfersListClient
        initialTransfers={transfers}
        stores={stores}
        activeStoreId={ctx.storeId}
      />
    </div>
  );
}
