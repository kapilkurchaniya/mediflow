/**
 * Deterministic database reset and seed script for Playwright E2E smoke tests.
 * SAFETY: Refuses to run unless DATABASE_URL points to a local PostgreSQL instance
 * whose database name explicitly contains "test" (e.g. mediflow_test).
 */
import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import bcrypt from "bcryptjs";
import * as schema from "../src/server/db/schema";
import { seedSystemRoles } from "../src/server/roles";
import { recordStockMovement } from "../src/server/domain/stock";
import { validateE2EDatabaseUrl } from "./seed-e2e-guard";

async function main() {
  const url = process.env.DATABASE_URL;

  // 1. Strict Safety Guard: Enforce localhost, mediflow_test DB, and ALLOW_E2E_DB_RESET=1
  const { host, dbName } = validateE2EDatabaseUrl(url);

  console.log(`[E2E Seed] Target test database verified: ${dbName}@${host}`);

  // 2. Wipe public and drizzle schemas
  const pool = new Pool({ connectionString: url });
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
  await pool.query("CREATE SCHEMA public");
  await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  console.log("[E2E Seed] Database schemas cleanly reset.");

  // 3. Run all migrations
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[E2E Seed] Migrations successfully applied.");

  // 4. Seed Tenant
  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      name: "Apollo Pharmacy",
      legalName: "Apollo Pharmacy Pvt Ltd",
    })
    .returning();

  // 5. Seed Store
  const [store] = await db
    .insert(schema.stores)
    .values({
      tenantId: tenant.id,
      name: "Apollo Main Branch",
      code: "APL001",
      stateCode: "MH",
      drugLicenseNo: "MH-TZ-12345",
      gstin: "27AABCA1234A1Z5",
    })
    .returning();

  // 6. Seed System Roles & Permissions
  const roleIds = await seedSystemRoles(db, tenant.id);

  // 7. Seed Admin User
  const adminPasswordHash = await bcrypt.hash("admin123", 10);
  const [admin] = await db
    .insert(schema.users)
    .values({
      name: "Admin User",
      email: "admin@apollo.com",
      passwordHash: adminPasswordHash,
      pharmacistRegNo: "PH-99887",
    })
    .returning();

  await db.insert(schema.memberships).values({
    tenantId: tenant.id,
    userId: admin.id,
    roleId: roleIds.owner,
    storeIds: [store.id],
    allStores: true,
    status: "active",
  });

  // 8. Seed Cashier User
  const cashierPasswordHash = await bcrypt.hash("cashier123", 10);
  const [cashier] = await db
    .insert(schema.users)
    .values({
      name: "Cashier User",
      email: "cashier@apollo.com",
      passwordHash: cashierPasswordHash,
      pharmacistRegNo: "PH-11223",
    })
    .returning();

  await db.insert(schema.memberships).values({
    tenantId: tenant.id,
    userId: cashier.id,
    roleId: roleIds.cashier,
    storeIds: [store.id],
    allStores: true,
    status: "active",
  });

  // 9. Seed Active Cash Register Shift (ROADMAP A2.6)
  await db.insert(schema.cashSessions).values({
    tenantId: tenant.id,
    storeId: store.id,
    openedBy: admin.id,
    status: "open",
    openedAt: new Date(),
    openingCash: 100000, // ₹1,000.00
    notes: "E2E opening float",
  });

  // 10. Seed Customer with Loyalty Points (ROADMAP A2.7)
  const [customer] = await db
    .insert(schema.customers)
    .values({
      tenantId: tenant.id,
      name: "Ramesh Sharma",
      phone: "9876543210",
      email: "ramesh.sharma@example.test",
      loyaltyPoints: 100,
    })
    .returning();

  // 11. Seed Manufacturers & Categories
  const [cipla] = await db
    .insert(schema.manufacturers)
    .values({ tenantId: tenant.id, name: "Cipla" })
    .returning();
  const [microLabs] = await db
    .insert(schema.manufacturers)
    .values({ tenantId: tenant.id, name: "Micro Labs" })
    .returning();

  const [analgesic] = await db
    .insert(schema.categories)
    .values({ tenantId: tenant.id, name: "Analgesic" })
    .returning();

  // 12. Seed Stocked Medicines & Batches
  const expiryNextYear = new Date();
  expiryNextYear.setFullYear(expiryNextYear.getFullYear() + 1);
  const expiryDate = expiryNextYear.toISOString().split("T")[0];

  // Medicine 1: Paracetamol 500mg
  const [med1] = await db
    .insert(schema.medicines)
    .values({
      tenantId: tenant.id,
      name: "Paracetamol 500mg",
      genericName: "Paracetamol",
      manufacturerId: cipla.id,
      categoryId: analgesic.id,
      mrp: 1500, // ₹15.00
      salePrice: 1500,
      purchasePrice: 1050,
      unitsPerPack: 10,
      packUnit: "Strip",
      looseUnit: "Tab",
      gstRateBp: 1200,
      hsn: "30049099",
    })
    .returning();

  // Medicine 2: Dolo 650
  const [med2] = await db
    .insert(schema.medicines)
    .values({
      tenantId: tenant.id,
      name: "Dolo 650",
      genericName: "Paracetamol",
      manufacturerId: microLabs.id,
      categoryId: analgesic.id,
      mrp: 3050, // ₹30.50
      salePrice: 3050,
      purchasePrice: 2135,
      unitsPerPack: 15,
      packUnit: "Strip",
      looseUnit: "Tab",
      gstRateBp: 1200,
      hsn: "30049099",
    })
    .returning();

  // Batches and stock movements inside transaction
  await db.transaction(async (tx) => {
    // Batch for Med 1
    const [b1] = await tx
      .insert(schema.batches)
      .values({
        tenantId: tenant.id,
        storeId: store.id,
        medicineId: med1.id,
        batchNo: "B-PARA-001",
        expiryDate,
        purchaseRate: 1050,
        mrp: 1500,
        saleRate: 1500,
        qtyOnHand: 0,
      })
      .returning();

    await recordStockMovement({
      tx,
      tenantId: tenant.id,
      storeId: store.id,
      batchId: b1.id,
      medicineId: med1.id,
      type: "opening",
      qtyChange: 100,
      unitCost: 1050,
      note: "E2E opening stock",
      userId: admin.id,
    });

    // Batch for Med 2
    const [b2] = await tx
      .insert(schema.batches)
      .values({
        tenantId: tenant.id,
        storeId: store.id,
        medicineId: med2.id,
        batchNo: "B-DOLO-001",
        expiryDate,
        purchaseRate: 2135,
        mrp: 3050,
        saleRate: 3050,
        qtyOnHand: 0,
      })
      .returning();

    await recordStockMovement({
      tx,
      tenantId: tenant.id,
      storeId: store.id,
      batchId: b2.id,
      medicineId: med2.id,
      type: "opening",
      qtyChange: 100,
      unitCost: 2135,
      note: "E2E opening stock",
      userId: admin.id,
    });
  });

  console.log(`[E2E Seed] Successfully seeded:
  - Tenant: ${tenant.name} (${tenant.id})
  - Store: ${store.name} (${store.id})
  - Admin: admin@apollo.com / admin123
  - Cashier: cashier@apollo.com / cashier123
  - Open Cash Session: ₹1,000.00
  - Customer: ${customer.name} (9876543210)
  - Medicine 1: ${med1.name} (100 units, batch B-PARA-001 @ ₹15.00)
  - Medicine 2: ${med2.name} (100 units, batch B-DOLO-001 @ ₹30.50)`);

  await pool.end();
}

main().catch((err) => {
  console.error("[E2E Seed Error]", err);
  process.exit(1);
});
