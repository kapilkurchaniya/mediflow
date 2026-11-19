import { db, schema } from "../../../src/server/db";
import { eq, desc } from "drizzle-orm";

export async function seedPhase2Data() {
  const storeId = "da335171-a0f0-45bf-a991-0273761a4aa1";
  const tenantId = "c5f8883b-db4d-4963-9e69-02485b68f8cc";
  const now = new Date();

  console.log("Seeding Phase 2 extension test fixtures...");

  // 1. Reset INV/26-27/000011 and INV/26-27/000010 to uncancelled completed sales dated right now
  const targetSales = ["de2ec437-bcd1-49f0-b862-f2567cda938f", "769e4b51-74c4-4b00-a193-43738d69e9a4"];
  for (const sId of targetSales) {
    await db
      .update(schema.sales)
      .set({
        status: "completed",
        cancelledAt: null,
        cancelReason: null,
        createdAt: now,
        completedAt: now,
      })
      .where(eq(schema.sales.id, sId));
  }
  console.log("✓ Reset same-day uncancelled invoices for VID-2.15 (Alt + C).");

  // 2. Ensure returnable items for INV/26-27/000009 and INV/26-27/000008
  const returnSales = ["6acf398c-920b-4287-a8fe-f48f6873ce81", "61f45dbb-a471-4f44-958a-8ccc9b922b1e"];
  for (const sId of returnSales) {
    await db
      .update(schema.sales)
      .set({
        status: "completed",
        returnedAmount: 0,
        cancelledAt: null,
      })
      .where(eq(schema.sales.id, sId));

    await db
      .update(schema.saleItems)
      .set({
        returnedQty: 0,
      })
      .where(eq(schema.saleItems.saleId, sId));
  }
  console.log("✓ Reset returnable sales for VID-2.16 (Alt + R).");

  // 3. Clear any active cash register sessions for VID-2.17
  await db.delete(schema.cashSessions);
  console.log("✓ Cleared cash sessions so VID-2.17 starts with Open Register.");

  // 4. Ensure Ramesh Kumar has 150 points for VID-2.18
  const rameshId = "3c0c5d7a-6a80-4398-bfae-375563ab1770";
  await db
    .update(schema.customers)
    .set({
      loyaltyPoints: 150,
    })
    .where(eq(schema.customers.id, rameshId));
  console.log("✓ Ensured Ramesh Kumar has 150 loyalty points for VID-2.18.");

  console.log("✓ All Phase 2 extension fixtures seeded successfully!");
}

if (require.main === module) {
  seedPhase2Data()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Failed to seed phase 2 data:", err);
      process.exit(1);
    });
}
