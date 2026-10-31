import { and, asc, eq, gt, lt, or } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import type { DbOrTx } from "@/server/db";
import { DomainError } from "@/server/errors";
import type { AuthCtx } from "@/server/rbac";
import type { SaleLine } from "./types";

export interface EarlierBatchInfo {
  id: string;
  batchNo: string;
  expiryDate: string;
  qtyOnHand: number;
}

export interface AllocatedBatchSlice {
  batch: typeof schema.batches.$inferSelect;
  medicine: typeof schema.medicines.$inferSelect;
  manufacturerName: string | null;
  baseQty: number;
  packQty: number;
  looseQty: number;
  unitsPerPack: number;
  saleRate: number;
  discountBp: number;
  isOverride: boolean;
  earlierBatchesSkipped?: EarlierBatchInfo[];
  overrideReason?: string;
}

export interface FefoAllocationOptions {
  todayStr: string;
  allowNegativeStock?: boolean;
}

/**
 * 🤝 CONTRACT (ROADMAP A2.11): Backend-owned transactional FEFO Batch Allocation Service.
 *
 * Automatically allocates the earliest valid expiry batch (expiryDate > today, status = 'active')
 * for each sale item. If an item needs more stock than the nearest batch holds, it automatically
 * splits across subsequent FEFO batches.
 *
 * When an explicit batch is chosen manually by the counter cashier, verifies whether earlier-expiring
 * batches with stock were skipped, flagging an audited FEFO override.
 */
export async function allocateFefoBatches(
  tx: DbOrTx,
  ctx: Pick<AuthCtx, "tenantId" | "storeId">,
  lines: SaleLine[],
  options: FefoAllocationOptions,
): Promise<{ allocatedLines: AllocatedBatchSlice[] }> {
  const allocatedStockMap = new Map<string, number>();
  const allocatedLines: AllocatedBatchSlice[] = [];

  for (const line of lines) {
    let medicine: typeof schema.medicines.$inferSelect | undefined;
    let manufacturerName: string | null = null;
    let explicitBatch: typeof schema.batches.$inferSelect | undefined;

    // 1. Resolve medicine and explicit batch (if specified)
    if (line.batchId) {
      const [batchRecord] = await tx
        .select({
          batch: schema.batches,
          medicine: schema.medicines,
        })
        .from(schema.batches)
        .innerJoin(schema.medicines, eq(schema.batches.medicineId, schema.medicines.id))
        .where(
          and(
            eq(schema.batches.id, line.batchId),
            eq(schema.batches.tenantId, ctx.tenantId),
            eq(schema.batches.storeId, ctx.storeId),
          ),
        )
        .for("update");

      if (!batchRecord) {
        throw new DomainError("BATCH_NOT_FOUND", `Batch ${line.batchId} not found`);
      }
      explicitBatch = batchRecord.batch;
      medicine = batchRecord.medicine;

      if (medicine.manufacturerId) {
        const [mfg] = await tx
          .select({ name: schema.manufacturers.name })
          .from(schema.manufacturers)
          .where(eq(schema.manufacturers.id, medicine.manufacturerId));
        manufacturerName = mfg?.name ?? null;
      }
    } else if (line.medicineId) {
      const [medRecord] = await tx
        .select({
          medicine: schema.medicines,
          manufacturer: schema.manufacturers.name,
        })
        .from(schema.medicines)
        .leftJoin(schema.manufacturers, eq(schema.medicines.manufacturerId, schema.manufacturers.id))
        .where(
          and(
            eq(schema.medicines.id, line.medicineId),
            eq(schema.medicines.tenantId, ctx.tenantId),
          ),
        );

      if (!medRecord) {
        throw new DomainError("MEDICINE_NOT_FOUND", `Medicine ${line.medicineId} not found`);
      }
      medicine = medRecord.medicine;
      manufacturerName = medRecord.manufacturer ?? null;
    } else {
      throw new DomainError("INVALID_LINE", "Each line must specify either batchId or medicineId.");
    }

    // 2. Canonical base quantity derivation
    const upp = Math.max(1, medicine.unitsPerPack ?? 1);
    let packQty = line.packQty ?? 0;
    let looseQty = line.looseQty ?? 0;
    let baseQty = 0;

    if (line.packQty !== undefined || line.looseQty !== undefined) {
      if (looseQty >= upp) {
        packQty += Math.floor(looseQty / upp);
        looseQty = looseQty % upp;
      }
      baseQty = (packQty * upp) + looseQty;
    } else {
      baseQty = line.qty ?? 0;
      packQty = Math.floor(baseQty / upp);
      looseQty = baseQty % upp;
    }

    if (baseQty <= 0) {
      throw new DomainError("INVALID_QUANTITY", `Quantity for ${medicine.name} must be greater than zero.`);
    }

    // 3. Allocation Strategy
    const isAutoFefo = Boolean(line.autoFefo || !line.batchId);

    if (!isAutoFefo && explicitBatch) {
      // ── Explicit Manual Selection (Single Batch) ───────────────────────────────────
      if (explicitBatch.expiryDate <= options.todayStr) {
        throw new DomainError("BATCH_EXPIRED", `Batch for ${medicine.name} has expired on ${explicitBatch.expiryDate}`);
      }
      if (explicitBatch.status !== "active") {
        throw new DomainError("BATCH_INACTIVE", `Batch ${explicitBatch.batchNo} is ${explicitBatch.status}`);
      }

      const previouslyAllocated = allocatedStockMap.get(explicitBatch.id) ?? 0;
      const available = explicitBatch.qtyOnHand - previouslyAllocated;

      if (available < baseQty && !options.allowNegativeStock) {
        throw new DomainError("INSUFFICIENT_STOCK", `Insufficient stock for ${medicine.name}. Available: ${available}`);
      }

      // Check if an earlier valid batch with stock was skipped (FEFO Override audit)
      // Evaluates complete deterministic tuple: (expiryDate, createdAt, id) under transactional row locks
      const earlierBatches = await tx
        .select({
          id: schema.batches.id,
          batchNo: schema.batches.batchNo,
          expiryDate: schema.batches.expiryDate,
          qtyOnHand: schema.batches.qtyOnHand,
        })
        .from(schema.batches)
        .where(
          and(
            eq(schema.batches.tenantId, ctx.tenantId),
            eq(schema.batches.storeId, ctx.storeId),
            eq(schema.batches.medicineId, medicine.id),
            eq(schema.batches.status, "active"),
            gt(schema.batches.qtyOnHand, 0),
            gt(schema.batches.expiryDate, options.todayStr),
            or(
              lt(schema.batches.expiryDate, explicitBatch.expiryDate),
              and(
                eq(schema.batches.expiryDate, explicitBatch.expiryDate),
                lt(schema.batches.createdAt, explicitBatch.createdAt),
              ),
              and(
                eq(schema.batches.expiryDate, explicitBatch.expiryDate),
                eq(schema.batches.createdAt, explicitBatch.createdAt),
                lt(schema.batches.id, explicitBatch.id),
              ),
            ),
          ),
        )
        .orderBy(asc(schema.batches.expiryDate), asc(schema.batches.createdAt), asc(schema.batches.id))
        .for("update");

      const isOverride = earlierBatches.length > 0;
      allocatedStockMap.set(explicitBatch.id, previouslyAllocated + baseQty);
      const saleRate = explicitBatch.saleRate ?? explicitBatch.mrp ?? 0;

      allocatedLines.push({
        batch: explicitBatch,
        medicine,
        manufacturerName,
        baseQty,
        packQty,
        looseQty,
        unitsPerPack: upp,
        saleRate,
        discountBp: line.discountBp,
        isOverride,
        earlierBatchesSkipped: isOverride ? earlierBatches : undefined,
        overrideReason: line.overrideReason,
      });
    } else {
      // ── Automatic FEFO Allocation (Supports Multi-Batch Split) ─────────────────────
      const candidateBatches = await tx
        .select()
        .from(schema.batches)
        .where(
          and(
            eq(schema.batches.tenantId, ctx.tenantId),
            eq(schema.batches.storeId, ctx.storeId),
            eq(schema.batches.medicineId, medicine.id),
            eq(schema.batches.status, "active"),
            gt(schema.batches.expiryDate, options.todayStr),
            gt(schema.batches.qtyOnHand, 0),
          ),
        )
        .orderBy(asc(schema.batches.expiryDate), asc(schema.batches.createdAt), asc(schema.batches.id))
        .for("update");

      const totalAvailable = candidateBatches.reduce((acc, b) => {
        const used = allocatedStockMap.get(b.id) ?? 0;
        return acc + Math.max(0, b.qtyOnHand - used);
      }, 0);

      if (totalAvailable < baseQty && !options.allowNegativeStock) {
        if (candidateBatches.length === 0) {
          throw new DomainError("INSUFFICIENT_STOCK", `No active batches in stock for ${medicine.name}.`);
        }
        throw new DomainError(
          "INSUFFICIENT_STOCK",
          `Insufficient stock for ${medicine.name}. Required: ${baseQty}, Available across active batches: ${totalAvailable}`,
        );
      }

      let remaining = baseQty;
      for (const b of candidateBatches) {
        if (remaining <= 0) break;
        const used = allocatedStockMap.get(b.id) ?? 0;
        const avail = Math.max(0, b.qtyOnHand - used);
        if (avail <= 0) continue;

        const take = Math.min(remaining, avail);
        allocatedStockMap.set(b.id, used + take);

        const slicePackQty = Math.floor(take / upp);
        const sliceLooseQty = take % upp;
        const saleRate = b.saleRate ?? b.mrp ?? 0;

        allocatedLines.push({
          batch: b,
          medicine,
          manufacturerName,
          baseQty: take,
          packQty: slicePackQty,
          looseQty: sliceLooseQty,
          unitsPerPack: upp,
          saleRate,
          discountBp: line.discountBp,
          isOverride: false,
        });

        remaining -= take;
      }

      // If allowNegativeStock was permitted and remaining units still unallocated
      if (remaining > 0 && options.allowNegativeStock) {
        const fallbackBatch = candidateBatches[candidateBatches.length - 1] ?? explicitBatch;
        if (!fallbackBatch) {
          throw new DomainError("INSUFFICIENT_STOCK", `No batch available to allocate stock for ${medicine.name}.`);
        }
        const used = allocatedStockMap.get(fallbackBatch.id) ?? 0;
        allocatedStockMap.set(fallbackBatch.id, used + remaining);
        const slicePackQty = Math.floor(remaining / upp);
        const sliceLooseQty = remaining % upp;
        const saleRate = fallbackBatch.saleRate ?? fallbackBatch.mrp ?? 0;

        allocatedLines.push({
          batch: fallbackBatch,
          medicine,
          manufacturerName,
          baseQty: remaining,
          packQty: slicePackQty,
          looseQty: sliceLooseQty,
          unitsPerPack: upp,
          saleRate,
          discountBp: line.discountBp,
          isOverride: false,
        });
      }
    }
  }

  return { allocatedLines };
}
