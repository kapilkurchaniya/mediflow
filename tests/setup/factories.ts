import { randomBytes } from "node:crypto";
import * as schema from "@/server/db/schema";
import type { TestDb } from "./db";

const rand = () => randomBytes(4).toString("hex");

export async function makeTenant(db: TestDb, over: Partial<typeof schema.tenants.$inferInsert> = {}) {
  const [row] = await db.insert(schema.tenants).values({ name: `Pharmacy ${rand()}`, ...over }).returning();
  return row;
}

export async function makeStore(
  db: TestDb,
  tenantId: string,
  over: Partial<typeof schema.stores.$inferInsert> = {},
) {
  const [row] = await db
    .insert(schema.stores)
    .values({ tenantId, name: "Main Store", code: rand().slice(0, 4).toUpperCase(), stateCode: "27", ...over })
    .returning();
  return row;
}

export async function makeUser(db: TestDb, over: Partial<typeof schema.users.$inferInsert> = {}) {
  const [row] = await db
    .insert(schema.users)
    .values({ name: "Test User", email: `u_${rand()}@example.test`, passwordHash: "x", ...over })
    .returning();
  return row;
}

export async function makeMedicine(
  db: TestDb,
  tenantId: string,
  over: Partial<typeof schema.medicines.$inferInsert> = {},
) {
  const [row] = await db
    .insert(schema.medicines)
    .values({ tenantId, name: `Medicine ${rand()}`, mrp: 10000, salePrice: 10000, gstRateBp: 500, ...over })
    .returning();
  return row;
}

export async function makeBatch(
  db: TestDb,
  p: { tenantId: string; storeId: string; medicineId: string } & Partial<typeof schema.batches.$inferInsert>,
) {
  const [row] = await db
    .insert(schema.batches)
    .values({ batchNo: `B${rand()}`, expiryDate: "2099-12-31", qtyOnHand: 0, mrp: 10000, saleRate: 10000, purchaseRate: 6000, ...p })
    .returning();
  return row;
}

export async function makeCustomer(db: TestDb, tenantId: string, over: Partial<typeof schema.customers.$inferInsert> = {}) {
  const [row] = await db.insert(schema.customers).values({ tenantId, name: `Customer ${rand()}`, ...over }).returning();
  return row;
}

export async function makeSupplier(db: TestDb, tenantId: string, over: Partial<typeof schema.suppliers.$inferInsert> = {}) {
  const [row] = await db.insert(schema.suppliers).values({ tenantId, name: `Supplier ${rand()}`, ...over }).returning();
  return row;
}

/** A tenant + store + user + medicine, the minimum most tests need. */
export async function makeWorld(db: TestDb) {
  const tenant = await makeTenant(db);
  const store = await makeStore(db, tenant.id);
  const user = await makeUser(db);
  const medicine = await makeMedicine(db, tenant.id);
  return { tenant, store, user, medicine };
}
