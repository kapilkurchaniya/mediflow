import "dotenv/config";
import { db, schema } from "../src/server/db/index";
import { eq } from "drizzle-orm";
import { recordStockMovement } from "../src/server/domain/stock";

const medicinesData = [
  { name: "Paracetamol 500mg", generic: "Paracetamol", mfg: "Cipla", cat: "Analgesic", price: 15.00 },
  { name: "Dolo 650", generic: "Paracetamol", mfg: "Micro Labs", cat: "Analgesic", price: 30.50 },
  { name: "Pan 40", generic: "Pantoprazole", mfg: "Alkem", cat: "Antacid", price: 140.00 },
  { name: "Augmentin 625 Duo", generic: "Amoxicillin + Clavulanic Acid", mfg: "GSK", cat: "Antibiotic", price: 200.00 },
  { name: "Calpol 500", generic: "Paracetamol", mfg: "GSK", cat: "Analgesic", price: 15.50 },
  { name: "Allegra 120", generic: "Fexofenadine", mfg: "Sanofi", cat: "Antihistamine", price: 210.00 },
  { name: "Azithral 500", generic: "Azithromycin", mfg: "Alembic", cat: "Antibiotic", price: 120.00 },
  { name: "Telma 40", generic: "Telmisartan", mfg: "Glenmark", cat: "Antihypertensive", price: 230.00 },
  { name: "Thyronorm 50mcg", generic: "Levothyroxine", mfg: "Abbott", cat: "Thyroid", price: 160.00 },
  { name: "Glycomet GP 2", generic: "Glimepiride + Metformin", mfg: "USV", cat: "Antidiabetic", price: 180.00 },
  { name: "Liv 52 DS", generic: "Ayurvedic", mfg: "Himalaya", cat: "Hepatoprotective", price: 150.00 },
  { name: "Becosules Z", generic: "Multivitamin", mfg: "Pfizer", cat: "Vitamin", price: 45.00 },
  { name: "Azee 500", generic: "Azithromycin", mfg: "Cipla", cat: "Antibiotic", price: 130.00 },
  { name: "Zerodol SP", generic: "Aceclofenac + Paracetamol", mfg: "Ipca", cat: "Analgesic", price: 110.00 },
  { name: "Montair LC", generic: "Montelukast + Levocetirizine", mfg: "Cipla", cat: "Antihistamine", price: 190.00 }
];

async function seed() {
  console.log("Fetching first tenant, store, and user...");
  
  // 1. Tenant
  const tenants = await db.select().from(schema.tenants).limit(1);
  let tenantId;
  if (tenants.length === 0) {
    const [newT] = await db.insert(schema.tenants).values({ name: "Default Pharmacy", legalName: "Default" }).returning();
    tenantId = newT.id;
  } else {
    tenantId = tenants[0].id;
  }

  // 2. Store
  const stores = await db.select().from(schema.stores).where(eq(schema.stores.tenantId, tenantId)).limit(1);
  let storeId;
  if (stores.length === 0) {
    const [newS] = await db.insert(schema.stores).values({ tenantId, name: "Main Store", code: "S001", stateCode: "MH" }).returning();
    storeId = newS.id;
  } else {
    storeId = stores[0].id;
  }

  // 3. User
  const users = await db.select().from(schema.users).limit(1);
  let userId;
  if (users.length === 0) {
    const [newU] = await db.insert(schema.users).values({ name: "Admin", email: "admin@mediflow.com", passwordHash: "..." }).returning();
    userId = newU.id;
  } else {
    userId = users[0].id;
  }

  console.log(`Seeding data for Tenant: ${tenantId}, Store: ${storeId}`);

  let insertedMedCount = 0;

  for (const item of medicinesData) {
    // 1. Handle Manufacturer
    let mfgId = null;
    const existingMfg = await db.select().from(schema.manufacturers).where(eq(schema.manufacturers.name, item.mfg)).limit(1);
    if (existingMfg.length > 0) {
      mfgId = existingMfg[0].id;
    } else {
      const [newMfg] = await db.insert(schema.manufacturers).values({ tenantId, name: item.mfg }).returning();
      mfgId = newMfg.id;
    }

    // 2. Handle Category
    let catId = null;
    const existingCat = await db.select().from(schema.categories).where(eq(schema.categories.name, item.cat)).limit(1);
    if (existingCat.length > 0) {
      catId = existingCat[0].id;
    } else {
      const [newCat] = await db.insert(schema.categories).values({ tenantId, name: item.cat }).returning();
      catId = newCat.id;
    }

    // 3. Handle Medicine
    let medId = null;
    const existingMed = await db.select().from(schema.medicines).where(eq(schema.medicines.name, item.name)).limit(1);
    if (existingMed.length > 0) {
      medId = existingMed[0].id;
      console.log(`Medicine ${item.name} already exists. Skipping insertion.`);
      continue;
    } else {
      const mrpPaise = Math.round(item.price * 100);
      const [newMed] = await db.insert(schema.medicines).values({
        tenantId,
        name: item.name,
        genericName: item.generic,
        manufacturerId: mfgId,
        categoryId: catId,
        mrp: mrpPaise,
        purchasePrice: Math.round(item.price * 0.7 * 100),
        salePrice: mrpPaise,
      }).returning();
      medId = newMed.id;
      insertedMedCount++;
    }

    // 4. Handle Batch & Stock
    const batchNo = `B-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    const expiryDate = nextYear.toISOString().split("T")[0];
    
    await db.transaction(async (tx) => {
      const [newBatch] = await tx.insert(schema.batches).values({
        tenantId,
        storeId,
        medicineId: medId,
        batchNo,
        expiryDate,
        purchaseRate: Math.round(item.price * 0.7 * 100),
        mrp: Math.round(item.price * 100),
        saleRate: Math.round(item.price * 100),
        qtyOnHand: 0,
      }).returning();

      // Give it a random stock between 10 and 100
      const initialStock = Math.floor(Math.random() * 90) + 10;
      
      await recordStockMovement({
        tx,
        tenantId,
        storeId,
        batchId: newBatch.id,
        medicineId: medId,
        type: "opening",
        qtyChange: initialStock,
        unitCost: Math.round(item.price * 0.7 * 100),
        note: "Initial Seed",
        userId
      });
    });
    
    console.log(`Seeded: ${item.name} with batch ${batchNo}`);
  }

  console.log(`\nSuccessfully inserted ${insertedMedCount} medicines and batches!`);
  process.exit(0);
}

seed().catch(console.error);
