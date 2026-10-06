import "dotenv/config";
import { db, schema } from "../src/server/db/index";
import { eq, isNull } from "drizzle-orm";

async function generateStock() {
  console.log("Fetching first tenant and store...");
  const tenants = await db.select().from(schema.tenants).limit(1);
  const tenantId = tenants[0].id;
  
  const stores = await db.select().from(schema.stores).where(eq(schema.stores.tenantId, tenantId)).limit(1);
  const storeId = stores[0].id;

  console.log(`Generating fake stock for Tenant: ${tenantId}, Store: ${storeId}`);

  // Fetch all medicines that don't have a batch yet
  const medicines = await db.select({ id: schema.medicines.id, mrp: schema.medicines.mrp })
    .from(schema.medicines);

  const existingBatches = await db.select({ medicineId: schema.batches.medicineId }).from(schema.batches);
  const medIdsWithBatches = new Set(existingBatches.map(b => b.medicineId));

  const medsToStock = medicines.filter(m => !medIdsWithBatches.has(m.id));

  console.log(`Found ${medsToStock.length} medicines without stock. Generating...`);

  const BATCH_SIZE = 1000;
  let inserted = 0;

  for (let i = 0; i < medsToStock.length; i += BATCH_SIZE) {
    const chunk = medsToStock.slice(i, i + BATCH_SIZE);
    
    const batchesToInsert = chunk.map(med => ({
      tenantId,
      storeId,
      medicineId: med.id,
      batchNo: `B-GEN-${Math.floor(Math.random() * 90000) + 10000}`,
      expiryDate: "2027-12-31",
      qtyOnHand: Math.floor(Math.random() * 50) + 10,
      mrp: med.mrp || 10000, // default 100 Rs
      purchaseRate: Math.round((med.mrp || 10000) * 0.7),
      saleRate: med.mrp || 10000,
    }));

    await db.insert(schema.batches).values(batchesToInsert);
    inserted += chunk.length;
    console.log(`Generated stock for ${inserted} medicines...`);
  }

  console.log("Done!");
}

generateStock().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
