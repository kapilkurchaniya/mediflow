import { describe, it, expect, vi } from "vitest";
import {
  createImportJob,
  addImportJobRows,
  saveJobMapping,
  validateImportJob,
  commitImportJob,
  detectPresetAndMapping,
} from "@/server/domain/import";
import type { DbOrTx } from "@/server/db";

interface StagedImportRow {
  id?: string;
  jobId?: string;
  rowNo?: number;
  status?: string;
  raw: Record<string, string>;
  normalized?: Record<string, unknown>;
  errors?: unknown[];
}

describe("Import Scale & Integration Invariant Test Suite (Task B4.5)", () => {
  const tenantId = "tenant-scale-test";
  const storeId = "store-scale-test";
  const userId = "user-scale-test";

  it("processes synthetic 2,000 medicines & 3,000 batches in under 2 minutes with ledger consistency and idempotency", async () => {
    const startTime = Date.now();

    // 1. Generate 2,000 synthetic Marg medicine rows
    const medicineRows: Record<string, string>[] = [];
    for (let i = 1; i <= 2000; i++) {
      medicineRows.push({
        "ITEM NAME": `MEDICINE-${i} TABLET`,
        PACKING: i % 2 === 0 ? "10 TAB" : "15'S",
        COMPANY: `PHARMA-CORP-${(i % 50) + 1}`,
        HSN: "300490",
        "GST%": i % 3 === 0 ? "12%" : "5%",
        MRP: (10 + (i % 200) * 5).toFixed(2),
        RATE: (8 + (i % 200) * 4).toFixed(2),
        COST: (6 + (i % 200) * 3).toFixed(2),
        RACK: `R-${(i % 20) + 1}`,
      });
    }

    // 2. Generate 3,000 synthetic Marg batch rows
    const batchRows: Record<string, string>[] = [];
    for (let i = 1; i <= 3000; i++) {
      const medIndex = (i % 2000) + 1;
      const month = String((i % 12) + 1).padStart(2, "0");
      const year = 27 + (i % 3);
      batchRows.push({
        "ITEM NAME": `MEDICINE-${medIndex} TABLET`,
        BATCH: `B-${24000 + i}`,
        EXPIRY: `${month}/${year}`,
        CLOSING: String(10 + (i % 50)),
        "PUR.RATE": (6 + (medIndex % 200) * 3).toFixed(2),
        MRP: (10 + (medIndex % 200) * 5).toFixed(2),
        RATE: (8 + (medIndex % 200) * 4).toFixed(2),
      });
    }

    expect(medicineRows.length).toBe(2000);
    expect(batchRows.length).toBe(3000);

    // In-memory mock database tracking table state
    const stagingJobs: Map<string, Record<string, unknown>> = new Map();
    const stagingJobRows: Map<string, StagedImportRow[]> = new Map();
    const createdMedicines: Map<string, Record<string, unknown>> = new Map();
    const createdBatches: Map<string, Record<string, unknown>> = new Map();
    const recordedStockMovements: Record<string, unknown>[] = [];
    let currentActiveJobId = "";

    function makeQueryBuilder(rows: unknown[], single: unknown[]) {
      const p = Promise.resolve(rows) as unknown as Promise<unknown[]> & {
        limit: (n?: number) => Promise<unknown[]>;
        offset: () => unknown;
        orderBy: () => Promise<unknown[]>;
        for: () => Promise<unknown[]>;
        [Symbol.iterator]: () => Generator<unknown, void, unknown>;
      };
      p.limit = (n?: number) => Promise.resolve(single.slice(0, n || 1));
      p.offset = () => p;
      p.orderBy = () => Promise.resolve(rows);
      p.for = () => Promise.resolve(single);
      p[Symbol.iterator] = function* () {
        yield* rows;
      };
      return p;
    }

    const mockDb = {
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((vals: unknown) => {
          if (Array.isArray(vals)) {
            // Batch rows insertion
            const arr = vals as StagedImportRow[];
            if (arr.length > 0 && arr[0].jobId) {
              const jId = String(arr[0].jobId);
              const existing = stagingJobRows.get(jId) || [];
              const rowsWithIds = arr.map((v, idx) => ({
                id: `staged-row-${jId}-${existing.length + idx + 1}`,
                ...v,
              }));
              stagingJobRows.set(jId, [...existing, ...rowsWithIds]);
            }
            return {
              returning: vi.fn().mockReturnValue(vals),
            };
          }

          // Single record insertion
          const obj = vals as Record<string, unknown>;
          if (obj && obj.entity && obj.fileName) {
            // import_jobs
            const job = {
              id: `job-${stagingJobs.size + 1}`,
              totals: { rows: 0, valid: 0, errors: 0, created: 0, updated: 0, skipped: 0 },
              status: "pending",
              ...obj,
            };
            stagingJobs.set(job.id, job);
            currentActiveJobId = job.id;
            return { returning: vi.fn().mockReturnValue([job]) };
          }

          return { returning: vi.fn().mockReturnValue([vals]) };
        }),
      })),
      select: vi.fn().mockImplementation((fields?: Record<string, unknown>) => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            const isCount = fields && (fields.n !== undefined || fields.count !== undefined);
            const activeJob = stagingJobs.get(currentActiveJobId) || Array.from(stagingJobs.values()).pop();
            const activeRows = activeJob ? stagingJobRows.get(activeJob.id as string) || [] : [];

            if (isCount) {
              return makeQueryBuilder(
                [{ n: activeRows.length, count: activeRows.length }],
                [{ n: activeRows.length, count: activeRows.length }]
              );
            }

            return makeQueryBuilder(activeRows, [activeJob]);
          }),
        })),
      })),
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation((updates: Record<string, unknown>) => ({
          where: vi.fn().mockImplementation(() => {
            // Update active job in memory
            const activeJob = stagingJobs.get(currentActiveJobId);
            if (activeJob) {
              if (updates.mapping) activeJob.mapping = updates.mapping;
              if (updates.status) activeJob.status = updates.status;
              if (updates.totals && typeof updates.totals === "object") {
                activeJob.totals = {
                  ...(activeJob.totals as Record<string, unknown>),
                  ...(updates.totals as Record<string, unknown>),
                };
              }
            }
            const res = Promise.resolve([updates]) as unknown as Promise<unknown[]> & {
              returning: () => unknown[];
            };
            res.returning = vi.fn().mockReturnValue([updates]);
            return res;
          }),
        })),
      })),
      transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          select: vi.fn().mockImplementation(() => ({
            from: vi.fn().mockImplementation(() => ({
              where: vi.fn().mockImplementation(() => {
                const builder = Promise.resolve([]) as unknown as Promise<unknown[]> & {
                  limit: () => Promise<unknown[]>;
                  for: () => Promise<unknown[]>;
                  [Symbol.iterator]: () => Generator<unknown, void, unknown>;
                };
                builder.limit = vi.fn().mockReturnValue(Promise.resolve([]));
                builder.for = vi.fn().mockReturnValue(Promise.resolve([{ id: "mock-batch", qtyOnHand: 0 }]));
                builder[Symbol.iterator] = function* () {};
                return builder;
              }),
            })),
          })),
          insert: vi.fn().mockImplementation(() => ({
            values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
              if (vals.unitsPerPack !== undefined) {
                // schema.medicines
                const id = `med-${createdMedicines.size + 1}`;
                createdMedicines.set(id, { id, ...vals });
                return { returning: vi.fn().mockReturnValue([{ id }]) };
              }
              if (vals.batchNo !== undefined) {
                // schema.batches
                const id = `batch-${createdBatches.size + 1}`;
                createdBatches.set(id, { id, ...vals });
                return { returning: vi.fn().mockReturnValue([{ id, qtyOnHand: 0 }]) };
              }
              if (vals.type === "opening") {
                // schema.stock_movements
                recordedStockMovements.push(vals);
                return { returning: vi.fn().mockReturnValue([]) };
              }
              return { returning: vi.fn().mockReturnValue([{ id: "mock-id" }]) };
            }),
          })),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue([]),
            }),
          }),
        };
        return cb(txMock);
      }),
    };

    // ─── Test Execution: Stage & Commit 2,000 Medicines ──────────────
    // 1. Preset auto-detection
    const medHeaders = Object.keys(medicineRows[0]);
    const detection = detectPresetAndMapping(medHeaders, "medicines");
    expect(detection.detectedSource).toBe("marg");
    expect(detection.confidence).toBeGreaterThan(0.7);

    // 2. Create job
    const medJob = await createImportJob(mockDb as unknown as DbOrTx, {
      tenantId,
      entity: "medicines",
      source: "marg",
      fileName: "synthetic_marg_items_2000.csv",
      userId,
      mapping: detection.mapping,
    });
    expect(medJob.id).toBeDefined();

    // 3. Stage 2,000 rows in 1,000-row chunks
    await addImportJobRows(mockDb as unknown as DbOrTx, {
      tenantId,
      jobId: medJob.id,
      rows: medicineRows.slice(0, 1000),
    });
    await addImportJobRows(mockDb as unknown as DbOrTx, {
      tenantId,
      jobId: medJob.id,
      rows: medicineRows.slice(1000, 2000),
    });

    const stagedMedRows = stagingJobRows.get(medJob.id) || [];
    expect(stagedMedRows.length).toBe(2000);

    // 4. Save mapping and validate
    await saveJobMapping(mockDb as unknown as DbOrTx, tenantId, medJob.id, detection.mapping);

    const valResult = await validateImportJob(mockDb as unknown as DbOrTx, tenantId, medJob.id);
    expect(valResult.validCount).toBe(2000);
    expect(valResult.errorCount).toBe(0);

    // 5. Commit 2,000 medicines (500 rows per transaction)
    // Update staged rows to have normalized valid data for commit
    stagedMedRows.forEach((r, idx) => {
      r.status = "valid";
      r.rowNo = idx + 1;
      r.normalized = {
        name: r.raw["ITEM NAME"],
        packaging: r.raw["PACKING"],
        unitsPerPack: r.raw["PACKING"].includes("15") ? 15 : 10,
        mrpPaise: Math.round(parseFloat(r.raw["MRP"]) * 100),
        saleRatePaise: Math.round(parseFloat(r.raw["RATE"]) * 100),
        purchaseCostPaise: Math.round(parseFloat(r.raw["COST"]) * 100),
        gstRateBp: 500,
        hsn: "300490",
        schedule: "none",
      };
    });

    const commitMedResult = await commitImportJob(mockDb as unknown as DbOrTx, {
      tenantId,
      jobId: medJob.id,
      userId,
      chunkSize: 500,
    });

    expect(commitMedResult.status).toBe("completed");
    expect(commitMedResult.totals.created).toBe(2000);
    expect(createdMedicines.size).toBe(2000);

    // ─── Test Execution: Stage & Commit 3,000 Batches ────────────────
    const batchJob = await createImportJob(mockDb as unknown as DbOrTx, {
      tenantId,
      storeId,
      entity: "batches",
      source: "marg",
      fileName: "synthetic_marg_batches_3000.csv",
      userId,
    });

    // Stage in chunks of 1,000
    await addImportJobRows(mockDb as unknown as DbOrTx, {
      tenantId,
      jobId: batchJob.id,
      rows: batchRows.slice(0, 1000),
    });
    await addImportJobRows(mockDb as unknown as DbOrTx, {
      tenantId,
      jobId: batchJob.id,
      rows: batchRows.slice(1000, 2000),
    });
    await addImportJobRows(mockDb as unknown as DbOrTx, {
      tenantId,
      jobId: batchJob.id,
      rows: batchRows.slice(2000, 3000),
    });

    const stagedBatchRows = stagingJobRows.get(batchJob.id) || [];
    expect(stagedBatchRows.length).toBe(3000);

    let totalOpeningQtyExpected = 0;
    stagedBatchRows.forEach((r, idx) => {
      const q = parseInt(r.raw["CLOSING"], 10);
      totalOpeningQtyExpected += q;
      r.status = "valid";
      r.rowNo = idx + 1;
      r.normalized = {
        medicineCodeOrName: r.raw["ITEM NAME"],
        batchNo: r.raw["BATCH"],
        expiryDate: "2027-10-31",
        openingQty: q,
        closingQty: q,
        purchaseRatePaise: Math.round(parseFloat(r.raw["PUR.RATE"]) * 100),
        mrpPaise: Math.round(parseFloat(r.raw["MRP"]) * 100),
        saleRatePaise: Math.round(parseFloat(r.raw["RATE"]) * 100),
      };
    });

    // Commit 3,000 batches in 500-row transactions
    const commitBatchResult = await commitImportJob(mockDb as unknown as DbOrTx, {
      tenantId,
      storeId,
      jobId: batchJob.id,
      userId,
      chunkSize: 500,
    });

    expect(commitBatchResult.status).toBe("completed");
    expect(commitBatchResult.totals.created).toBe(3000);
    expect(createdBatches.size).toBe(3000);

    // ─── Invariant Verifications ─────────────────────────────────────
    // 1. Stock movements created exactly matches batch count
    expect(recordedStockMovements.length).toBe(3000);

    // 2. Sum of qtyChange across stock movements strictly equals sum of opening quantities
    const totalMovementQty = recordedStockMovements.reduce(
      (acc, m) => acc + (Number(m.qtyChange) || 0),
      0
    );
    expect(totalMovementQty).toBe(totalOpeningQtyExpected);

    // 3. All movement types are 'opening' with refType 'import_job'
    const nonOpeningMovements = recordedStockMovements.filter(
      (m) => m.type !== "opening" || m.refType !== "import_job"
    );
    expect(nonOpeningMovements.length).toBe(0);

    // ─── Idempotency Verification ───────────────────────────────────
    // Re-committing already completed batch job must create 0 new records
    const preRecommitMedicines = createdMedicines.size;
    const preRecommitBatches = createdBatches.size;
    const preRecommitMovements = recordedStockMovements.length;

    // Simulate job status is 'done'
    batchJob.status = "done";
    batchJob.totals = commitBatchResult.totals;

    const recommitResult = await commitImportJob(mockDb as unknown as DbOrTx, {
      tenantId,
      storeId,
      jobId: batchJob.id,
      userId,
    });

    expect(recommitResult.status).toBe("completed");
    expect(createdMedicines.size).toBe(preRecommitMedicines);
    expect(createdBatches.size).toBe(preRecommitBatches);
    expect(recordedStockMovements.length).toBe(preRecommitMovements);

    // ─── Performance Benchmark Verification ─────────────────────────
    const elapsedMs = Date.now() - startTime;
    // Must complete in under 2 minutes (120,000 ms)
    expect(elapsedMs).toBeLessThan(120000);
  });
});
