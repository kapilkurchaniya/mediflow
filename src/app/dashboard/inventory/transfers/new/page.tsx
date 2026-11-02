import { requirePermission } from "@/server/rbac";
import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { NewTransferClient } from "./NewTransferClient";

export default async function NewTransferPage() {
  const ctx = await requirePermission("inventory.transfer");

  const stores = await db
    .select({ id: schema.stores.id, name: schema.stores.name })
    .from(schema.stores)
    .where(eq(schema.stores.tenantId, ctx.tenantId));

  return (
    <div className="p-6">
      <NewTransferClient stores={stores} activeStoreId={ctx.storeId} />
    </div>
  );
}
