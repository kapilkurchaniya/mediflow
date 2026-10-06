import "dotenv/config";
import { db, schema } from "../src/server/db/index";
import { eq } from "drizzle-orm";

async function run() {
  const oldTenantId = '9383d724-7075-486a-a508-653856cbdb22';
  const newTenantId = '2f27ea14-b1a3-42b9-bd2f-21cbc632d8c0';
  const newStoreId = '0171ec4e-cee6-4b88-8d92-4c1015e3a60a';

  console.log("Migrating manufacturers...");
  await db.update(schema.manufacturers).set({ tenantId: newTenantId }).where(eq(schema.manufacturers.tenantId, oldTenantId));
  
  console.log("Migrating categories...");
  await db.update(schema.categories).set({ tenantId: newTenantId }).where(eq(schema.categories.tenantId, oldTenantId));

  console.log("Migrating medicines...");
  await db.update(schema.medicines).set({ tenantId: newTenantId }).where(eq(schema.medicines.tenantId, oldTenantId));

  console.log("Migrating batches...");
  await db.update(schema.batches).set({ tenantId: newTenantId, storeId: newStoreId }).where(eq(schema.batches.tenantId, oldTenantId));

  console.log("Migrating stock movements...");
  await db.update(schema.stockMovements).set({ tenantId: newTenantId, storeId: newStoreId }).where(eq(schema.stockMovements.tenantId, oldTenantId));

  console.log("Done!");
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
