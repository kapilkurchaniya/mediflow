import { cache } from "react";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";

/**
 * Per-request memoized fetch of all stores for a tenant.
 * Prevents DashboardLayout and child pages from issuing duplicate store queries on the same render.
 */
export const getCachedTenantStores = cache(async (tenantId: string) => {
  return db
    .select({
      id: schema.stores.id,
      name: schema.stores.name,
      code: schema.stores.code,
      kind: schema.stores.kind,
      stateCode: schema.stores.stateCode,
      gstin: schema.stores.gstin,
      isActive: schema.stores.isActive,
    })
    .from(schema.stores)
    .where(eq(schema.stores.tenantId, tenantId))
    .orderBy(schema.stores.name);
});

