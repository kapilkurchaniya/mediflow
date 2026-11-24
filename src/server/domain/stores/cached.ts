import { cache } from "react";
import { unstable_cache } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";

const fetchTenantStores = unstable_cache(
  async (tenantId: string) => {
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
  },
  ["tenant-stores"],
  { revalidate: 60, tags: ["tenant-stores"] },
);

/**
 * Per-request memoized + 60s cross-request cached fetch of all stores for a tenant.
 * Prevents DashboardLayout and child pages from hitting Postgres for store metadata on every navigation.
 */
export const getCachedTenantStores = cache(async (tenantId: string) => {
  return fetchTenantStores(tenantId);
});

