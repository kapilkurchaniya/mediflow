/**
 * High-throughput, chunked synthetic data seeder engine with production safety checks.
 */

import { Pool } from "pg";
import { createPrng } from "./prng";
import {
  generateMedicine,
  generateBatch,
  generateMovement,
  type GeneratedMedicine,
  type GeneratedBatch,
} from "./data-generators";

export interface SeederOptions {
  connectionString: string;
  preset: "full" | "benchmark";
  forceSeed?: boolean;
}

export interface SeederResult {
  medicinesCount: number;
  batchesCount: number;
  movementsCount: number;
  durationMs: number;
}

export function validateDatabaseUrlSafety(url: string, forceSeed?: boolean): void {
  const isCloudOrProd = /(neon\.tech|supabase|rds\.amazonaws\.com|production)/i.test(url);
  if (isCloudOrProd && !forceSeed) {
    throw new Error(
      "SECURITY HALT: DATABASE_URL appears to be a cloud or production instance. " +
        "Bulk performance seeding of 1M+ rows requires explicit --force-seed flag."
    );
  }
}

export async function runSeederEngine(opts: SeederOptions): Promise<SeederResult> {
  validateDatabaseUrlSafety(opts.connectionString, opts.forceSeed);

  const pool = new Pool({ connectionString: opts.connectionString, max: 5 });
  const prng = createPrng(123456789);

  const targets =
    opts.preset === "full"
      ? { medicines: 50_000, batches: 200_000, movements: 1_000_000 }
      : { medicines: 5_000, batches: 20_000, movements: 100_000 };

  console.log(`\n🚀 Starting Bulk Performance Seeder [Preset: ${opts.preset.toUpperCase()}]`);
  console.log(`Target: ${targets.medicines.toLocaleString()} medicines, ${targets.batches.toLocaleString()} batches, ${targets.movements.toLocaleString()} movements`);

  const startTime = Date.now();

  try {
    // 1. Resolve stores and group by tenant
    const storesRes = await pool.query<{ id: string; tenant_id: string }>(
      "SELECT id, tenant_id FROM stores WHERE is_active = true ORDER BY created_at ASC"
    );
    if (storesRes.rows.length === 0) {
      throw new Error("No active stores found in database.");
    }

    const storesByTenant = new Map<string, string[]>();
    for (const s of storesRes.rows) {
      const list = storesByTenant.get(s.tenant_id) || [];
      list.push(s.id);
      storesByTenant.set(s.tenant_id, list);
    }
    const tenantIds = Array.from(storesByTenant.keys());
    const primaryTenantId = tenantIds[0];
    const primaryStoreId = storesRes.rows[0].id;

    // Ensure open year-end period controls exist for all stores to satisfy fail-closed trigger
    for (const store of storesRes.rows) {
      await pool.query(
        `INSERT INTO year_end_period_controls (id, tenant_id, store_id, fiscal_year, cutoff_date, status)
         VALUES 
           (gen_random_uuid(), $1, $2, '2026-2027', '2027-03-31 18:29:59+00', 'open'),
           (gen_random_uuid(), $1, $2, '2025-2026', '2026-03-31 18:29:59+00', 'open'),
           (gen_random_uuid(), $1, $2, '2024-2025', '2025-03-31 18:29:59+00', 'open')
         ON CONFLICT (tenant_id, store_id, fiscal_year) DO NOTHING`,
        [store.tenant_id, store.id]
      );
    }

    // 2. Insert Medicines in streaming chunks of 2,000
    console.log("\n📦 Stage 1/3: Generating and inserting Medicines...");
    const CHUNK_SIZE_MEDS = 2_000;
    const generatedMeds: GeneratedMedicine[] = [];

    for (let i = 0; i < targets.medicines; i += CHUNK_SIZE_MEDS) {
      const chunkCount = Math.min(CHUNK_SIZE_MEDS, targets.medicines - i);
      const chunk: GeneratedMedicine[] = [];

      for (let j = 0; j < chunkCount; j++) {
        const tenantId = j % 10 < 7 ? primaryTenantId : tenantIds[j % tenantIds.length];
        chunk.push(generateMedicine(i + j, tenantId, prng));
      }

      const valueClauses: string[] = [];
      const params: unknown[] = [];
      let pIdx = 1;

      for (const m of chunk) {
        valueClauses.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
        params.push(m.id, m.tenantId, m.name, m.genericName, m.composition, m.strength, m.dosageForm, m.packSize, m.unit, m.unitsPerPack, m.packUnit, m.looseUnit, m.barcode, m.hsn, m.gstRateBp, m.mrp, m.salePrice, m.purchasePrice, m.schedule, m.isActive);
      }

      const inserted = await pool.query<GeneratedMedicine>(
        `INSERT INTO medicines (id, tenant_id, name, generic_name, composition, strength, dosage_form, pack_size, unit, units_per_pack, pack_unit, loose_unit, barcode, hsn, gst_rate_bp, mrp, sale_price, purchase_price, schedule, is_active)
         VALUES ${valueClauses.join(", ")} ON CONFLICT DO NOTHING
         RETURNING id, tenant_id, name, generic_name as "genericName", composition, strength, dosage_form as "dosageForm", pack_size as "packSize", unit, units_per_pack as "unitsPerPack", pack_unit as "packUnit", loose_unit as "looseUnit", barcode, hsn, gst_rate_bp as "gstRateBp", mrp, sale_price as "salePrice", purchase_price as "purchasePrice", schedule, is_active as "isActive"`,
        params
      );

      if (inserted.rows.length > 0) {
        generatedMeds.push(...inserted.rows);
      }

      const pct = Math.round(((i + chunkCount) / targets.medicines) * 100);
      process.stdout.write(`\r  Medicines: ${(i + chunkCount).toLocaleString()} / ${targets.medicines.toLocaleString()} (${pct}%)`);
    }

    if (generatedMeds.length === 0) {
      const existing = await pool.query<GeneratedMedicine>(
        `SELECT id, tenant_id as "tenantId", name, mrp, sale_price as "salePrice", purchase_price as "purchasePrice"
         FROM medicines WHERE is_active = true LIMIT 50000`
      );
      generatedMeds.push(...existing.rows);
    }

    // 3. Insert Batches in streaming chunks of 2,000 with Pareto distribution
    console.log("\n\n💉 Stage 2/3: Generating and inserting Batches...");
    const CHUNK_SIZE_BATCHES = 2_000;
    const generatedBatches: GeneratedBatch[] = [];

    for (let i = 0; i < targets.batches; i += CHUNK_SIZE_BATCHES) {
      const chunkCount = Math.min(CHUNK_SIZE_BATCHES, targets.batches - i);
      const chunk: GeneratedBatch[] = [];

      for (let j = 0; j < chunkCount; j++) {
        const medIdx = prng.paretoIndex(generatedMeds.length);
        const med = generatedMeds[medIdx];
        const medTenantId = med.tenantId || primaryTenantId;
        const tenantStores = storesByTenant.get(medTenantId) || [primaryStoreId];
        const storeId = prng.choice(tenantStores);
        const storeRow = storesRes.rows.find((s) => s.id === storeId);
        const batchTenantId = storeRow ? storeRow.tenant_id : medTenantId;
        chunk.push(generateBatch(i + j, batchTenantId, storeId, med, prng));
      }

      const valueClauses: string[] = [];
      const params: unknown[] = [];
      let pIdx = 1;

      for (const b of chunk) {
        valueClauses.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
        params.push(b.id, b.tenantId, b.storeId, b.medicineId, b.batchNo, b.expiryDate, b.mfgDate, b.purchaseRate, b.mrp, b.saleRate, b.qtyOnHand, b.status);
      }

      const inserted = await pool.query<GeneratedBatch>(
        `INSERT INTO batches (id, tenant_id, store_id, medicine_id, batch_no, expiry_date, mfg_date, purchase_rate, mrp, sale_rate, qty_on_hand, status)
         VALUES ${valueClauses.join(", ")} ON CONFLICT DO NOTHING
         RETURNING id, tenant_id as "tenantId", store_id as "storeId", medicine_id as "medicineId", batch_no as "batchNo", purchase_rate as "purchaseRate", qty_on_hand as "qtyOnHand"`,
        params
      );

      if (inserted.rows.length > 0) {
        generatedBatches.push(...inserted.rows);
      }

      const pct = Math.round(((i + chunkCount) / targets.batches) * 100);
      process.stdout.write(`\r  Batches: ${(i + chunkCount).toLocaleString()} / ${targets.batches.toLocaleString()} (${pct}%)`);
    }

    if (generatedBatches.length === 0) {
      const existing = await pool.query<GeneratedBatch>(
        `SELECT id, tenant_id as "tenantId", store_id as "storeId", medicine_id as "medicineId",
                purchase_rate as "purchaseRate", qty_on_hand as "qtyOnHand"
         FROM batches LIMIT 50000`
      );
      generatedBatches.push(...existing.rows);
    }

    // 4. Insert Stock Movements in streaming chunks of 5,000
    console.log("\n\n📊 Stage 3/3: Generating and inserting Stock Movements...");
    const CHUNK_SIZE_MOVEMENTS = 5_000;

    for (let i = 0; i < targets.movements; i += CHUNK_SIZE_MOVEMENTS) {
      const chunkCount = Math.min(CHUNK_SIZE_MOVEMENTS, targets.movements - i);
      const valueClauses: string[] = [];
      const params: unknown[] = [];
      let pIdx = 1;

      for (let j = 0; j < chunkCount; j++) {
        const batchIdx = prng.paretoIndex(generatedBatches.length);
        const batch = generatedBatches[batchIdx];
        const bStoreId = batch.storeId || primaryStoreId;
        const storeRow = storesRes.rows.find((s) => s.id === bStoreId);
        const bTenantId = storeRow ? storeRow.tenant_id : (batch.tenantId || primaryTenantId);
        const m = generateMovement(bTenantId, bStoreId, batch, prng);

        valueClauses.push(
          `($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`
        );
        params.push(
          m.tenantId,
          m.storeId,
          m.batchId,
          m.medicineId,
          m.type,
          m.qtyChange,
          m.balanceAfter,
          m.unitCost,
          m.effectiveAt,
          m.createdAt
        );
      }

      await pool.query(
        `INSERT INTO stock_movements (
          tenant_id, store_id, batch_id, medicine_id, type, qty_change,
          balance_after, unit_cost, effective_at, created_at
        ) VALUES ${valueClauses.join(", ")}`,
        params
      );

      const pct = Math.round(((i + chunkCount) / targets.movements) * 100);
      process.stdout.write(`\r  Movements: ${(i + chunkCount).toLocaleString()} / ${targets.movements.toLocaleString()} (${pct}%)`);
    }

    // 5. Post-seed ANALYZE for query planner statistics
    console.log("\n\n🔍 Refreshing PostgreSQL Planner Statistics (ANALYZE)...");
    await pool.query("ANALYZE medicines; ANALYZE batches; ANALYZE stock_movements;");
    console.log("✓ Planner statistics refreshed.");

    const durationMs = Date.now() - startTime;
    console.log(`\n🎉 Performance Seeding Completed in ${(durationMs / 1000).toFixed(1)}s!`);

    return {
      medicinesCount: targets.medicines,
      batchesCount: targets.batches,
      movementsCount: targets.movements,
      durationMs,
    };
  } finally {
    await pool.end();
  }
}
