import "dotenv/config";
import { db, schema } from "../src/server/db/index";
import { eq, inArray, sql } from "drizzle-orm";
import fs from "fs";
import csv from "csv-parser";
import path from "path";

const BATCH_SIZE = 500;
// Limit to 20,000 to prevent timeout, but it's a very large dataset
const MAX_ROWS = 20000;

async function seedDataset() {
  console.log("Fetching first tenant...");
  let tenants = await db.select().from(schema.tenants).limit(1);
  if (tenants.length === 0) {
    console.error("No tenants found! Run setup-db.ts first.");
    process.exit(1);
  }
  const tenantId = tenants[0].id;
  
  console.log(`Using Tenant ID: ${tenantId}`);

  const filePath = path.join(__dirname, "Indian-Medicine-Dataset", "DATA", "updated_indian_medicine_data.csv");
  if (!fs.existsSync(filePath)) {
    console.error("Dataset not found at", filePath);
    process.exit(1);
  }

  let manufacturersCache = new Map<string, string>(); // lowercase name -> id
  // Pre-load existing manufacturers
  const existingMfrs = await db.select({ id: schema.manufacturers.id, name: schema.manufacturers.name })
    .from(schema.manufacturers)
    .where(eq(schema.manufacturers.tenantId, tenantId));
  
  for (const m of existingMfrs) {
    manufacturersCache.set(m.name.toLowerCase().trim(), m.id);
  }

  const results: any[] = [];
  let rowCount = 0;
  let insertedCount = 0;

  console.log("Reading CSV...");
  
  const processBatch = async (batch: any[]) => {
    // 1. Resolve Manufacturers
    const newMfrs = new Set<string>();
    for (const row of batch) {
      if (row.manufacturer_name) {
        const mfrName = row.manufacturer_name.trim();
        if (mfrName && !manufacturersCache.has(mfrName.toLowerCase())) {
          newMfrs.add(mfrName);
        }
      }
    }

    if (newMfrs.size > 0) {
      const mfrsToInsert = Array.from(newMfrs).map(name => ({
        tenantId,
        name
      }));
      // Insert new manufacturers in chunks
      try {
        const inserted = await db.insert(schema.manufacturers)
          .values(mfrsToInsert)
          .onConflictDoNothing()
          .returning({ id: schema.manufacturers.id, name: schema.manufacturers.name });
        
        for (const m of inserted) {
          manufacturersCache.set(m.name.toLowerCase(), m.id);
        }
      } catch (err) {
        console.error("Error inserting manufacturers:", err);
      }
    }

    // Fallback: If onConflictDoNothing didn't return them, re-fetch them
    const missingMfrs = Array.from(newMfrs).filter(m => !manufacturersCache.has(m.toLowerCase()));
    if (missingMfrs.length > 0) {
       const refetched = await db.select({ id: schema.manufacturers.id, name: schema.manufacturers.name })
        .from(schema.manufacturers)
        .where(eq(schema.manufacturers.tenantId, tenantId));
       for (const m of refetched) {
         manufacturersCache.set(m.name.toLowerCase(), m.id);
       }
    }

    // 2. Prepare Medicines
    const medicinesToInsert = batch.map(row => {
      let mfrId = null;
      if (row.manufacturer_name) {
        mfrId = manufacturersCache.get(row.manufacturer_name.trim().toLowerCase()) || null;
      }
      
      const mrpVal = parseFloat(row.price);
      const mrp = isNaN(mrpVal) ? 0 : Math.round(mrpVal * 100);
      const isActive = row.Is_discontinued?.toLowerCase() !== "true";

      return {
        tenantId,
        name: row.name.substring(0, 255),
        genericName: row.salt_composition ? row.salt_composition.substring(0, 255) : null,
        manufacturerId: mfrId,
        packSize: row.pack_size_label ? row.pack_size_label.substring(0, 255) : null,
        dosageForm: row.type ? row.type.substring(0, 50) : null,
        mrp,
        isActive,
      };
    });

    // Insert medicines
    try {
      await db.insert(schema.medicines)
        .values(medicinesToInsert);
      insertedCount += medicinesToInsert.length;
      console.log(`Inserted ${insertedCount} medicines...`);
    } catch (err) {
      console.error("Error inserting medicines batch:", err);
    }
  };

  return new Promise((resolve, reject) => {
    let currentBatch: any[] = [];
    
    const stream = fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", async (data) => {
        if (rowCount >= MAX_ROWS) {
          stream.destroy();
          return;
        }
        
        if (!data.name || !data.price) return;
        
        currentBatch.push(data);
        rowCount++;

        if (currentBatch.length >= BATCH_SIZE) {
          stream.pause();
          const batchToProcess = [...currentBatch];
          currentBatch = [];
          
          await processBatch(batchToProcess);
          stream.resume();
        }
      })
      .on("end", async () => {
        if (currentBatch.length > 0) {
          await processBatch(currentBatch);
        }
        console.log(`Finished seeding ${insertedCount} medicines from dataset!`);
        resolve(true);
      })
      .on("error", (error) => {
        console.error("Error reading CSV:", error);
        reject(error);
      });
  });
}

seedDataset().then(() => process.exit(0)).catch(() => process.exit(1));
