import * as schema from "@/server/db/schema";
import type { TestDb } from "../setup/db";
import { getOrSeedAccounts } from "@/server/domain/accounting";
import { getCurrentIndianFY } from "@/server/domain/accounting-periods";
import { calculateCutoffDate } from "@/server/domain/accounting-year-end/closing-stock-valuation";

export interface AccountingPeriodsFixture {
  tenantId: string;
  storeA: string;
  storeB: string;
  storeNoGstin: string;
  gstinA: string;
  gstinB: string;
  userId: string;
  supplierId: string;
  customerId: string;
  batchId: string;
  medicineId: string;
  accounts: Record<string, string>;
  currentFY: string;
}

export async function setupAccountingPeriodsFixture(db: TestDb): Promise<AccountingPeriodsFixture> {
  const currentFY = getCurrentIndianFY();

  // 1. Create Tenant
  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      name: "Mediflow Test Pharmacy Ltd",
      legalName: "Mediflow Test Legal",
      gstin: "27AABCU9603R0Z1",
      stateCode: "MH",
    })
    .returning();

  // 2. Create User
  const [user] = await db
    .insert(schema.users)
    .values({
      name: "Accounting Auditor",
      email: `auditor_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@mediflow.test`,
      passwordHash: "dummy",
    })
    .returning();

  const gstinA = "27AABCU9603R1ZM";
  const gstinB = "27AABCU9603R2ZN";

  // 3. Create Stores
  const [storeA] = await db
    .insert(schema.stores)
    .values({
      tenantId: tenant.id,
      name: "Store Branch Alpha (GSTIN A)",
      code: `S_A_${Date.now().toString().slice(-4)}_${Math.random().toString(36).slice(2, 4)}`,
      stateCode: "MH",
      gstin: gstinA,
    })
    .returning();

  const [storeB] = await db
    .insert(schema.stores)
    .values({
      tenantId: tenant.id,
      name: "Store Branch Beta (GSTIN B)",
      code: `S_B_${Date.now().toString().slice(-4)}_${Math.random().toString(36).slice(2, 4)}`,
      stateCode: "MH",
      gstin: gstinB,
    })
    .returning();

  const [storeNoGstin] = await db
    .insert(schema.stores)
    .values({
      tenantId: tenant.id,
      name: "Store Branch Gamma (No GSTIN)",
      code: `S_G_${Date.now().toString().slice(-4)}_${Math.random().toString(36).slice(2, 4)}`,
      stateCode: "MH",
      gstin: null,
    })
    .returning();

  // 4. Create Supplier & Customer
  const [supplier] = await db
    .insert(schema.suppliers)
    .values({
      tenantId: tenant.id,
      name: "Standard Supplier Pharma",
      gstin: "27AABCU9603R3ZP",
      stateCode: "MH",
    })
    .returning();

  const [customer] = await db
    .insert(schema.customers)
    .values({
      tenantId: tenant.id,
      name: "Standard Customer",
      phone: "9876543210",
    })
    .returning();

  // 5. Create Medicine & Batch for Stocktake / Expiry testing
  const [category] = await db
    .insert(schema.categories)
    .values({
      tenantId: tenant.id,
      name: `Category_${Date.now()}`,
    })
    .returning();

  const [medicine] = await db
    .insert(schema.medicines)
    .values({
      tenantId: tenant.id,
      name: "Paracetamol 500mg",
      categoryId: category.id,
      hsn: "300490",
    })
    .returning();

  const [batch] = await db
    .insert(schema.batches)
    .values({
      tenantId: tenant.id,
      storeId: storeA.id,
      medicineId: medicine.id,
      batchNo: `BATCH-${Date.now().toString().slice(-5)}`,
      expiryDate: "2027-12-31",
      mrp: 5000,
      purchaseRate: 3000,
      qtyOnHand: 10,
    })
    .returning();

  // 6. Seed system accounts & year-end period controls for stock movements
  const accounts = await getOrSeedAccounts(db, tenant.id);

  for (const st of [storeA, storeB, storeNoGstin]) {
    await db.insert(schema.yearEndPeriodControls).values({
      tenantId: tenant.id,
      storeId: st.id,
      fiscalYear: currentFY,
      cutoffDate: calculateCutoffDate(currentFY),
      status: "open",
    }).onConflictDoNothing();
  }

  return {
    tenantId: tenant.id,
    storeA: storeA.id,
    storeB: storeB.id,
    storeNoGstin: storeNoGstin.id,
    gstinA,
    gstinB,
    userId: user.id,
    supplierId: supplier.id,
    customerId: customer.id,
    batchId: batch.id,
    medicineId: medicine.id,
    accounts,
    currentFY,
  };
}
