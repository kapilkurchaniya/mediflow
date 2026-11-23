import { and, eq, sql } from "drizzle-orm";
import { schema, type DbOrTx, type Tx } from "@/server/db";
import { recordStockMovement } from "@/server/domain/stock";
import { writeAudit } from "@/server/audit";
import { parsePackaging } from "@/lib/packaging";
import { getImportJob } from "./index";
import {
  NormalizedMedicineRow,
  NormalizedBatchRow,
  NormalizedCustomerRow,
  NormalizedSupplierRow,
} from "./types";

export interface CommitImportJobOptions {
  tenantId: string;
  storeId?: string | null;
  jobId: string;
  userId: string;
  chunkSize?: number; // default: 500
  skipErrors?: boolean; // default: true
}

export interface CommitImportJobResult {
  jobId: string;
  status: "completed" | "failed";
  totals: {
    rows: number;
    valid: number;
    errors: number;
    created: number;
    updated: number;
    skipped: number;
  };
}

/**
 * Commits a validated import job in chunks of 500 rows inside transactions.
 * Safely creates or updates target records and writes opening stock movements.
 * Idempotent: rows already committed will not be re-processed.
 */
export async function commitImportJob(
  db: DbOrTx,
  options: CommitImportJobOptions
): Promise<CommitImportJobResult> {
  const { tenantId, jobId, userId } = options;
  const chunkSize = options.chunkSize ?? 500;
  const skipErrors = options.skipErrors ?? true;

  const job = await getImportJob(db, tenantId, jobId);
  if (!job) {
    throw new Error(`Import job ${jobId} not found`);
  }

  // Idempotency: if already completed, return cached totals
  if (job.status === "done") {
    return {
      jobId,
      status: "completed",
      totals: job.totals,
    };
  }

  // Set job status to committing
  await db
    .update(schema.importJobs)
    .set({ status: "committing" })
    .where(and(eq(schema.importJobs.id, jobId), eq(schema.importJobs.tenantId, tenantId)));

  const effectiveStoreId = options.storeId ?? job.storeId;
  if (job.entity === "batches" && !effectiveStoreId) {
    throw new Error("Store ID is required to import opening stock/batches.");
  }

  // Fetch candidate rows
  const conditions = [
    eq(schema.importJobRows.tenantId, tenantId),
    eq(schema.importJobRows.jobId, jobId),
  ];
  if (skipErrors) {
    conditions.push(eq(schema.importJobRows.status, "valid"));
  }

  const candidateRows = await db
    .select()
    .from(schema.importJobRows)
    .where(and(...conditions))
    .orderBy(schema.importJobRows.rowNo);

  let createdTotal = job.totals?.created ?? 0;
  let updatedTotal = job.totals?.updated ?? 0;
  let skippedTotal = job.totals?.skipped ?? 0;

  // Process rows in chunked transactions
  for (let i = 0; i < candidateRows.length; i += chunkSize) {
    const chunk = candidateRows.slice(i, i + chunkSize);

    await db.transaction(async (tx) => {
      for (const row of chunk) {
        // Skip already committed rows
        if (row.status === "committed" || row.targetId) {
          skippedTotal++;
          continue;
        }

        const normalized = row.normalized as Record<string, unknown> | null;
        if (!normalized) {
          skippedTotal++;
          continue;
        }

        try {
          if (job.entity === "medicines") {
            const med = normalized as unknown as NormalizedMedicineRow;
            const res = await commitMedicineRow(tx, {
              tenantId,
              med,
              effectiveStoreId,
            });
            if (res.created) createdTotal++;
            else updatedTotal++;

            await tx
              .update(schema.importJobRows)
              .set({
                status: "committed",
                targetId: res.medicineId,
              })
              .where(eq(schema.importJobRows.id, row.id));
          } else if (job.entity === "batches") {
            const batchRow = normalized as unknown as NormalizedBatchRow;
            const res = await commitBatchRow(tx as Tx, {
              tenantId,
              storeId: effectiveStoreId!,
              batchRow,
              jobId,
              userId,
            });
            if (res.created) createdTotal++;
            else updatedTotal++;

            await tx
              .update(schema.importJobRows)
              .set({
                status: "committed",
                targetId: res.batchId,
              })
              .where(eq(schema.importJobRows.id, row.id));
          } else if (job.entity === "customers") {
            const cust = normalized as unknown as NormalizedCustomerRow;
            const res = await commitCustomerRow(tx, { tenantId, cust });
            if (res.created) createdTotal++;
            else updatedTotal++;

            await tx
              .update(schema.importJobRows)
              .set({
                status: "committed",
                targetId: res.customerId,
              })
              .where(eq(schema.importJobRows.id, row.id));
          } else if (job.entity === "suppliers") {
            const supp = normalized as unknown as NormalizedSupplierRow;
            const res = await commitSupplierRow(tx, { tenantId, supp });
            if (res.created) createdTotal++;
            else updatedTotal++;

            await tx
              .update(schema.importJobRows)
              .set({
                status: "committed",
                targetId: res.supplierId,
              })
              .where(eq(schema.importJobRows.id, row.id));
          }
        } catch (err: unknown) {
          console.error(`[import/commit] Error committing row ${row.rowNo}:`, err);
          skippedTotal++;
          await tx
            .update(schema.importJobRows)
            .set({
              status: "error",
              errors: [
                ...row.errors,
                {
                  field: "_commit",
                  message: err instanceof Error ? err.message : String(err),
                  code: "COMMIT_FAILED",
                },
              ],
            })
            .where(eq(schema.importJobRows.id, row.id));
        }
      }
    });
  }

  const finalTotals = {
    rows: job.totals.rows,
    valid: job.totals.valid,
    errors: job.totals.errors,
    created: createdTotal,
    updated: updatedTotal,
    skipped: skippedTotal,
  };

  // Mark job completed
  await db
    .update(schema.importJobs)
    .set({
      status: "done",
      totals: finalTotals,
      finishedAt: new Date(),
    })
    .where(and(eq(schema.importJobs.id, jobId), eq(schema.importJobs.tenantId, tenantId)));

  // Write audit trail
  await writeAudit(
    db,
    {
      tenantId,
      storeId: effectiveStoreId || "00000000-0000-0000-0000-000000000000",
      userId,
    },
    {
      action: "bulk_update",
      entityType: "import_job",
      entityId: jobId,
      newValue: {
        entity: job.entity,
        source: job.source,
        ...finalTotals,
      },
      reason: `Committed import job ${job.fileName} (${job.entity})`,
    }
  );

  return {
    jobId,
    status: "completed",
    totals: finalTotals,
  };
}

/** Commit a single medicine row */
async function commitMedicineRow(
  tx: DbOrTx,
  params: {
    tenantId: string;
    med: NormalizedMedicineRow;
    effectiveStoreId?: string | null;
  }
): Promise<{ medicineId: string; created: boolean }> {
  const { tenantId, med } = params;

  // 1. Resolve or create manufacturer
  let manufacturerId: string | null = null;
  if (med.manufacturerName) {
    const [existingM] = await tx
      .select({ id: schema.manufacturers.id })
      .from(schema.manufacturers)
      .where(
        and(
          eq(schema.manufacturers.tenantId, tenantId),
          sql`lower(${schema.manufacturers.name}) = lower(${med.manufacturerName})`
        )
      )
      .limit(1);

    if (existingM) {
      manufacturerId = existingM.id;
    } else {
      const [newM] = await tx
        .insert(schema.manufacturers)
        .values({ tenantId, name: med.manufacturerName })
        .returning({ id: schema.manufacturers.id });
      manufacturerId = newM.id;
    }
  }

  // 2. Resolve or create category
  let categoryId: string | null = null;
  if (med.categoryName) {
    const [existingC] = await tx
      .select({ id: schema.categories.id })
      .from(schema.categories)
      .where(
        and(
          eq(schema.categories.tenantId, tenantId),
          sql`lower(${schema.categories.name}) = lower(${med.categoryName})`
        )
      )
      .limit(1);

    if (existingC) {
      categoryId = existingC.id;
    } else {
      const [newC] = await tx
        .insert(schema.categories)
        .values({ tenantId, name: med.categoryName })
        .returning({ id: schema.categories.id });
      categoryId = newC.id;
    }
  }

  // 3. Match existing medicine
  let existingMedicineId: string | null = null;
  if (med.barcode) {
    const [byBarcode] = await tx
      .select({ id: schema.medicines.id })
      .from(schema.medicines)
      .where(
        and(
          eq(schema.medicines.tenantId, tenantId),
          eq(schema.medicines.barcode, med.barcode)
        )
      )
      .limit(1);
    if (byBarcode) existingMedicineId = byBarcode.id;
  }

  if (!existingMedicineId && med.name) {
    const [byName] = await tx
      .select({ id: schema.medicines.id })
      .from(schema.medicines)
      .where(
        and(
          eq(schema.medicines.tenantId, tenantId),
          sql`lower(${schema.medicines.name}) = lower(${med.name})`
        )
      )
      .limit(1);
    if (byName) existingMedicineId = byName.id;
  }

  if (existingMedicineId) {
    // Update existing medicine master
    await tx
      .update(schema.medicines)
      .set({
        composition: med.composition || undefined,
        packSize: med.packaging || undefined,
        unitsPerPack: med.unitsPerPack || undefined,
        hsn: med.hsn || undefined,
        gstRateBp: med.gstRateBp || undefined,
        mrp: med.mrpPaise || undefined,
        salePrice: med.saleRatePaise || undefined,
        purchasePrice: med.purchaseCostPaise || undefined,
        schedule: med.schedule || undefined,
        manufacturerId: manufacturerId ?? undefined,
        categoryId: categoryId ?? undefined,
      })
      .where(eq(schema.medicines.id, existingMedicineId));

    return { medicineId: existingMedicineId, created: false };
  }

  // Create new medicine
  const [newMed] = await tx
    .insert(schema.medicines)
    .values({
      tenantId,
      name: med.name,
      composition: med.composition,
      packSize: med.packaging ?? `${med.unitsPerPack}s`,
      unitsPerPack: med.unitsPerPack,
      packUnit: "strip",
      looseUnit: "tablet",
      manufacturerId,
      categoryId,
      barcode: med.barcode || null,
      hsn: med.hsn || "300490",
      gstRateBp: med.gstRateBp || 500,
      mrp: med.mrpPaise,
      salePrice: med.saleRatePaise,
      purchasePrice: med.purchaseCostPaise,
      schedule: med.schedule || "none",
      rxRequired: med.schedule === "h" || med.schedule === "h1" || med.schedule === "x",
      isActive: true,
    })
    .returning({ id: schema.medicines.id });

  return { medicineId: newMed.id, created: true };
}

/** Commit a single batch row and write opening stock movement */
async function commitBatchRow(
  tx: Tx,
  params: {
    tenantId: string;
    storeId: string;
    batchRow: NormalizedBatchRow;
    jobId: string;
    userId: string;
  }
): Promise<{ batchId: string; created: boolean }> {
  const { tenantId, storeId, batchRow, jobId, userId } = params;

  // 1. Resolve medicineId
  let medicineId: string | null = null;
  if (batchRow.barcode) {
    const [byBarcode] = await tx
      .select({ id: schema.medicines.id })
      .from(schema.medicines)
      .where(
        and(
          eq(schema.medicines.tenantId, tenantId),
          eq(schema.medicines.barcode, batchRow.barcode)
        )
      )
      .limit(1);
    if (byBarcode) medicineId = byBarcode.id;
  }

  if (!medicineId && batchRow.medicineCodeOrName) {
    const [byName] = await tx
      .select({ id: schema.medicines.id })
      .from(schema.medicines)
      .where(
        and(
          eq(schema.medicines.tenantId, tenantId),
          sql`lower(${schema.medicines.name}) = lower(${batchRow.medicineCodeOrName})`
        )
      )
      .limit(1);
    if (byName) medicineId = byName.id;
  }

  // Auto-create minimal medicine if not matched
  if (!medicineId) {
    const inferredPack = parsePackaging({ medicineName: batchRow.medicineCodeOrName });
    const [autoMed] = await tx
      .insert(schema.medicines)
      .values({
        tenantId,
        name: batchRow.medicineCodeOrName,
        packSize: inferredPack.packSize ?? "1s",
        unitsPerPack: inferredPack.unitsPerPack,
        packUnit: inferredPack.packUnit,
        looseUnit: inferredPack.looseUnit,
        mrp: batchRow.mrpPaise,
        purchasePrice: batchRow.purchaseRatePaise,
        salePrice: batchRow.saleRatePaise ?? batchRow.mrpPaise,
        hsn: "300490",
        gstRateBp: 500,
        schedule: "none",
        isActive: true,
      })
      .returning({ id: schema.medicines.id });
    medicineId = autoMed.id;
  }

  // 2. Check if batch already exists in this store
  const [existingBatch] = await tx
    .select({ id: schema.batches.id, qtyOnHand: schema.batches.qtyOnHand })
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.storeId, storeId),
        eq(schema.batches.medicineId, medicineId),
        eq(schema.batches.batchNo, batchRow.batchNo)
      )
    )
    .limit(1);

  const initialQty = batchRow.closingQty > 0 ? batchRow.closingQty : batchRow.openingQty;

  if (existingBatch) {
    return { batchId: existingBatch.id, created: false };
  }

  // 3. Insert new batch with 0 qty initial
  const [newBatch] = await tx
    .insert(schema.batches)
    .values({
      tenantId,
      storeId,
      medicineId,
      batchNo: batchRow.batchNo,
      expiryDate: batchRow.expiryDate,
      purchaseRate: batchRow.purchaseRatePaise,
      mrp: batchRow.mrpPaise,
      saleRate: batchRow.saleRatePaise ?? batchRow.mrpPaise,
      qtyOnHand: 0,
      status: "active",
    })
    .returning({ id: schema.batches.id });

  // 4. Record opening stock movement if quantity > 0
  if (initialQty > 0) {
    await recordStockMovement({
      tx,
      tenantId,
      storeId,
      batchId: newBatch.id,
      medicineId,
      type: "opening",
      qtyChange: initialQty,
      unitCost: batchRow.purchaseRatePaise,
      refType: "import_job",
      refId: jobId,
      note: "Opening stock import",
      userId,
    });
  }

  return { batchId: newBatch.id, created: true };
}

/** Commit a single customer row */
async function commitCustomerRow(
  tx: DbOrTx,
  params: { tenantId: string; cust: NormalizedCustomerRow }
): Promise<{ customerId: string; created: boolean }> {
  const { tenantId, cust } = params;

  let existingCustomerId: string | null = null;
  const phone = cust.mobile || cust.phone;

  if (phone) {
    const [byPhone] = await tx
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(and(eq(schema.customers.tenantId, tenantId), eq(schema.customers.phone, phone)))
      .limit(1);
    if (byPhone) existingCustomerId = byPhone.id;
  }

  if (!existingCustomerId && cust.name) {
    const [byName] = await tx
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.tenantId, tenantId),
          sql`lower(${schema.customers.name}) = lower(${cust.name})`
        )
      )
      .limit(1);
    if (byName) existingCustomerId = byName.id;
  }

  if (existingCustomerId) {
    await tx
      .update(schema.customers)
      .set({
        phone: phone || undefined,
        address: cust.address || undefined,
        gstin: cust.gstin || undefined,
        stateCode: cust.stateCode || undefined,
        creditLimit: cust.creditLimitPaise || undefined,
      })
      .where(eq(schema.customers.id, existingCustomerId));

    return { customerId: existingCustomerId, created: false };
  }

  const [newCustomer] = await tx
    .insert(schema.customers)
    .values({
      tenantId,
      name: cust.name,
      phone: phone || null,
      address: cust.address || null,
      gstin: cust.gstin || null,
      stateCode: cust.stateCode || null,
      creditLimit: cust.creditLimitPaise ?? 0,
      openingBalance: cust.openingBalancePaise ?? 0,
      loyaltyPoints: 0,
    })
    .returning({ id: schema.customers.id });

  return { customerId: newCustomer.id, created: true };
}

/** Commit a single supplier row */
async function commitSupplierRow(
  tx: DbOrTx,
  params: { tenantId: string; supp: NormalizedSupplierRow }
): Promise<{ supplierId: string; created: boolean }> {
  const { tenantId, supp } = params;

  let existingSupplierId: string | null = null;
  const phone = supp.mobile || supp.phone;

  if (supp.gstin) {
    const [byGstin] = await tx
      .select({ id: schema.suppliers.id })
      .from(schema.suppliers)
      .where(and(eq(schema.suppliers.tenantId, tenantId), eq(schema.suppliers.gstin, supp.gstin)))
      .limit(1);
    if (byGstin) existingSupplierId = byGstin.id;
  }

  if (!existingSupplierId && phone) {
    const [byPhone] = await tx
      .select({ id: schema.suppliers.id })
      .from(schema.suppliers)
      .where(and(eq(schema.suppliers.tenantId, tenantId), eq(schema.suppliers.phone, phone)))
      .limit(1);
    if (byPhone) existingSupplierId = byPhone.id;
  }

  if (!existingSupplierId && supp.name) {
    const [byName] = await tx
      .select({ id: schema.suppliers.id })
      .from(schema.suppliers)
      .where(
        and(
          eq(schema.suppliers.tenantId, tenantId),
          sql`lower(${schema.suppliers.name}) = lower(${supp.name})`
        )
      )
      .limit(1);
    if (byName) existingSupplierId = byName.id;
  }

  if (existingSupplierId) {
    await tx
      .update(schema.suppliers)
      .set({
        contactPerson: supp.contactPerson || undefined,
        phone: phone || undefined,
        address: supp.address || undefined,
        gstin: supp.gstin || undefined,
        stateCode: supp.stateCode || undefined,
        drugLicenseNo: supp.drugLicenseNo || undefined,
        creditDays: supp.creditDays || undefined,
      })
      .where(eq(schema.suppliers.id, existingSupplierId));

    return { supplierId: existingSupplierId, created: false };
  }

  const [newSupplier] = await tx
    .insert(schema.suppliers)
    .values({
      tenantId,
      name: supp.name,
      contactPerson: supp.contactPerson || null,
      phone: phone || null,
      address: supp.address || null,
      gstin: supp.gstin || null,
      stateCode: supp.stateCode || null,
      drugLicenseNo: supp.drugLicenseNo || null,
      creditDays: supp.creditDays ?? 30,
      openingBalance: supp.openingBalancePaise ?? 0,
      isActive: true,
    })
    .returning({ id: schema.suppliers.id });

  return { supplierId: newSupplier.id, created: true };
}
