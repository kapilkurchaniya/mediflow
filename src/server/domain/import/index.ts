import { and, count, desc, eq, sql } from "drizzle-orm";
import { schema, type DbOrTx } from "@/server/db";
import {
  ImportEntity,
  ImportJobStatus,
  ImportRowStatus,
  ImportSource,
  NormalizedMedicineRow,
  NormalizedBatchRow,
  NormalizedCustomerRow,
  NormalizedSupplierRow,
  NormalizedDoctorRow,
  ImportRowErrorDetail,
} from "./types";
import {
  normalizeExpiryDate,
  normalizePaise,
  normalizeGstRate,
  normalizePhone,
  normalizeGstin,
  normalizeSchedule,
  normalizeUnitsPerPack,
} from "./normalize";
import { detectPresetAndMapping } from "./presets";

export * from "./types";
export * from "./normalize";
export * from "./presets";
export * from "./match";

/**
 * Creates a new import job in "uploaded" state.
 */
export async function createImportJob(
  db: DbOrTx,
  params: {
    tenantId: string;
    storeId?: string | null;
    entity: ImportEntity;
    source?: ImportSource;
    fileName: string;
    userId: string;
    mapping?: Record<string, string>;
  }
) {
  const [job] = await db
    .insert(schema.importJobs)
    .values({
      tenantId: params.tenantId,
      storeId: params.storeId ?? null,
      entity: params.entity,
      source: params.source ?? "generic",
      fileName: params.fileName,
      status: params.mapping && Object.keys(params.mapping).length > 0 ? "mapped" : "uploaded",
      mapping: params.mapping ?? {},
      totals: { rows: 0, valid: 0, errors: 0, created: 0, updated: 0, skipped: 0 },
      createdBy: params.userId,
    })
    .returning();

  return job;
}

/**
 * Ingests a chunk of raw rows (up to 1,000 rows) into staging.
 */
export async function addImportJobRows(
  db: DbOrTx,
  params: {
    tenantId: string;
    jobId: string;
    rows: Record<string, string>[];
  }
): Promise<{ inserted: number; totalRows: number }> {
  if (params.rows.length === 0) {
    const job = await getImportJob(db, params.tenantId, params.jobId);
    return { inserted: 0, totalRows: job?.totals.rows ?? 0 };
  }

  // Get current row count to maintain stable 1-based sequential rowNo
  const [maxRow] = await db
    .select({ n: count() })
    .from(schema.importJobRows)
    .where(
      and(
        eq(schema.importJobRows.tenantId, params.tenantId),
        eq(schema.importJobRows.jobId, params.jobId)
      )
    );

  const startRowNo = Number(maxRow?.n ?? 0) + 1;

  const rowValues = params.rows.map((r, i) => ({
    tenantId: params.tenantId,
    jobId: params.jobId,
    rowNo: startRowNo + i,
    raw: r,
    status: "pending" as const,
    errors: [],
  }));

  // Batch insert
  await db.insert(schema.importJobRows).values(rowValues);

  const totalRows = startRowNo + params.rows.length - 1;

  // Update job totals
  await db
    .update(schema.importJobs)
    .set({
      totals: sql`jsonb_set(${schema.importJobs.totals}, '{rows}', ${totalRows}::text::jsonb)`,
    })
    .where(
      and(
        eq(schema.importJobs.id, params.jobId),
        eq(schema.importJobs.tenantId, params.tenantId)
      )
    );

  return { inserted: params.rows.length, totalRows };
}

/**
 * Retrieves an import job by ID.
 */
export async function getImportJob(db: DbOrTx, tenantId: string, jobId: string) {
  const [job] = await db
    .select()
    .from(schema.importJobs)
    .where(and(eq(schema.importJobs.id, jobId), eq(schema.importJobs.tenantId, tenantId)))
    .limit(1);

  return job ?? null;
}

/**
 * Retrieves paginated staged rows for an import job.
 */
export async function getImportJobRows(
  db: DbOrTx,
  tenantId: string,
  jobId: string,
  options: {
    status?: ImportRowStatus;
    limit?: number;
    offset?: number;
  } = {}
) {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const conditions = [
    eq(schema.importJobRows.tenantId, tenantId),
    eq(schema.importJobRows.jobId, jobId),
  ];
  if (options.status) {
    conditions.push(eq(schema.importJobRows.status, options.status));
  }

  const [totalResult] = await db
    .select({ count: count() })
    .from(schema.importJobRows)
    .where(and(...conditions));

  const rows = await db
    .select()
    .from(schema.importJobRows)
    .where(and(...conditions))
    .orderBy(schema.importJobRows.rowNo)
    .limit(limit)
    .offset(offset);

  return {
    rows,
    total: Number(totalResult?.count ?? 0),
  };
}

/**
 * Updates column mapping configuration for an import job.
 */
export async function saveJobMapping(
  db: DbOrTx,
  tenantId: string,
  jobId: string,
  mapping: Record<string, string>
) {
  const [updated] = await db
    .update(schema.importJobs)
    .set({
      mapping,
      status: "mapped",
    })
    .where(and(eq(schema.importJobs.id, jobId), eq(schema.importJobs.tenantId, tenantId)))
    .returning();

  return updated;
}

/**
 * Validates all staged rows for a job against the target entity schema.
 * Populates normalized domain objects or validation errors.
 */
export async function validateImportJob(
  db: DbOrTx,
  tenantId: string,
  jobId: string
): Promise<{
  job: typeof schema.importJobs.$inferSelect;
  validCount: number;
  errorCount: number;
}> {
  const job = await getImportJob(db, tenantId, jobId);
  if (!job) throw new Error("Import job not found");

  const rows = await db
    .select()
    .from(schema.importJobRows)
    .where(
      and(
        eq(schema.importJobRows.tenantId, tenantId),
        eq(schema.importJobRows.jobId, jobId)
      )
    )
    .orderBy(schema.importJobRows.rowNo);

  const mapping = job.mapping ?? {};
  let validCount = 0;
  let errorCount = 0;

  // Process rows
  for (const r of rows) {
    const raw = r.raw;
    // Map raw headers to target fields
    const mapped: Record<string, string> = {};
    for (const [csvCol, val] of Object.entries(raw)) {
      const targetField = mapping[csvCol];
      if (targetField && val !== undefined && val !== null) {
        mapped[targetField] = String(val).trim();
      }
    }

    const errors: ImportRowErrorDetail[] = [];
    let normalized: Record<string, unknown> | null = null;
    let externalRef: string | null = null;

    if (job.entity === "medicines") {
      const name = mapped.name;
      if (!name) {
        errors.push({ field: "name", message: "Medicine name is required", code: "REQUIRED" });
      }

      const mrpRes = normalizePaise(mapped.mrp);
      if (!mrpRes.success) errors.push({ field: "mrp", message: mrpRes.error ?? "Invalid MRP" });

      const saleRateRes = normalizePaise(mapped.saleRate);
      if (!saleRateRes.success) errors.push({ field: "saleRate", message: saleRateRes.error ?? "Invalid sale rate" });

      const costRes = normalizePaise(mapped.purchaseCost);
      if (!costRes.success) errors.push({ field: "purchaseCost", message: costRes.error ?? "Invalid cost" });

      const gstRes = normalizeGstRate(mapped.gstRate);
      if (!gstRes.success) errors.push({ field: "gstRate", message: gstRes.error ?? "Invalid GST" });

      const unitsPerPack = normalizeUnitsPerPack(mapped.packaging);
      const schedule = normalizeSchedule(mapped.schedule);

      const code = mapped.code;
      externalRef = code ? `med:${code}` : name ? `med:${name.toLowerCase()}` : null;

      normalized = {
        name: name ?? "",
        code: code || undefined,
        composition: mapped.composition || undefined,
        manufacturerName: mapped.manufacturerName || undefined,
        categoryName: mapped.categoryName || undefined,
        packaging: mapped.packaging || undefined,
        unitsPerPack,
        hsn: mapped.hsn || "300490",
        gstRateBp: gstRes.gstRateBp ?? 500,
        legacyGstFlag: gstRes.isLegacy12Percent,
        mrpPaise: mrpRes.paise ?? 0,
        saleRatePaise: saleRateRes.paise ?? 0,
        purchaseCostPaise: costRes.paise ?? 0,
        rackLocation: mapped.rackLocation || undefined,
        schedule,
        barcode: mapped.barcode || undefined,
      } as NormalizedMedicineRow;
    } else if (job.entity === "batches") {
      const medIdentifier = mapped.medicineCodeOrName;
      if (!medIdentifier) {
        errors.push({ field: "medicineCodeOrName", message: "Medicine identifier is required", code: "REQUIRED" });
      }

      const batchNo = mapped.batchNo;
      if (!batchNo) {
        errors.push({ field: "batchNo", message: "Batch number is required", code: "REQUIRED" });
      }

      const expRes = normalizeExpiryDate(mapped.expiryDate);
      if (!expRes.success) {
        errors.push({ field: "expiryDate", message: expRes.error ?? "Invalid expiry date" });
      }

      const mrpRes = normalizePaise(mapped.mrp);
      if (!mrpRes.success) errors.push({ field: "mrp", message: mrpRes.error ?? "Invalid MRP" });

      const purRateRes = normalizePaise(mapped.purchaseRate);
      if (!purRateRes.success) errors.push({ field: "purchaseRate", message: purRateRes.error ?? "Invalid purchase rate" });

      const saleRateRes = normalizePaise(mapped.saleRate);

      const opQty = parseInt(mapped.openingQty || "0", 10);
      const closeQty = parseInt(mapped.closingQty || "0", 10);

      externalRef = medIdentifier && batchNo ? `batch:${medIdentifier}:${batchNo}` : null;

      normalized = {
        medicineCodeOrName: medIdentifier ?? "",
        batchNo: batchNo ?? "",
        expiryDate: expRes.date ?? "",
        openingQty: isNaN(opQty) ? 0 : opQty,
        closingQty: isNaN(closeQty) ? 0 : closeQty,
        mrpPaise: mrpRes.paise ?? 0,
        purchaseRatePaise: purRateRes.paise ?? 0,
        saleRatePaise: saleRateRes.paise,
        barcode: mapped.barcode || undefined,
      } as NormalizedBatchRow;
    } else if (job.entity === "customers" || job.entity === "suppliers") {
      const name = mapped.name;
      if (!name) {
        errors.push({ field: "name", message: "Party name is required", code: "REQUIRED" });
      }

      const phoneRes = normalizePhone(mapped.mobile || mapped.phone);
      if (!phoneRes.success && (mapped.mobile || mapped.phone)) {
        errors.push({ field: "phone", message: phoneRes.error ?? "Invalid phone" });
      }

      const gstinRes = normalizeGstin(mapped.gstin);
      if (!gstResValid(gstinRes) && mapped.gstin) {
        errors.push({ field: "gstin", message: gstinRes.error ?? "Invalid GSTIN" });
      }

      const balRes = normalizePaise(mapped.openingBalance);
      const limitRes = normalizePaise(mapped.creditLimit);

      const code = mapped.code;
      externalRef = code
        ? `${job.entity}:${code}`
        : phoneRes.phone
        ? `${job.entity}:${phoneRes.phone}`
        : name
        ? `${job.entity}:${name.toLowerCase()}`
        : null;

      if (job.entity === "customers") {
        normalized = {
          name: name ?? "",
          code: code || undefined,
          phone: mapped.phone || undefined,
          mobile: phoneRes.phone,
          address: mapped.address || undefined,
          city: mapped.city || undefined,
          gstin: gstinRes.gstin,
          stateCode: gstinRes.stateCode,
          openingBalancePaise: balRes.paise ?? 0,
          creditLimitPaise: limitRes.paise ?? 0,
        } as NormalizedCustomerRow;
      } else {
        const creditDays = parseInt(mapped.creditDays || "30", 10);
        normalized = {
          name: name ?? "",
          code: code || undefined,
          contactPerson: mapped.contactPerson || undefined,
          phone: mapped.phone || undefined,
          mobile: phoneRes.phone,
          address: mapped.address || undefined,
          city: mapped.city || undefined,
          gstin: gstinRes.gstin,
          stateCode: gstinRes.stateCode,
          drugLicenseNo: mapped.dlNo || undefined,
          creditDays: isNaN(creditDays) ? 30 : creditDays,
          openingBalancePaise: balRes.paise ?? 0,
        } as NormalizedSupplierRow;
      }
    }

    const rowStatus: ImportRowStatus = errors.length > 0 ? "error" : "valid";
    if (rowStatus === "valid") validCount++;
    else errorCount++;

    await db
      .update(schema.importJobRows)
      .set({
        normalized: normalized ?? undefined,
        errors,
        status: rowStatus,
        externalRef: externalRef ?? undefined,
      })
      .where(eq(schema.importJobRows.id, r.id));
  }

  // Update job status and totals
  const [updatedJob] = await db
    .update(schema.importJobs)
    .set({
      status: "validated",
      totals: {
        rows: rows.length,
        valid: validCount,
        errors: errorCount,
        created: 0,
        updated: 0,
        skipped: 0,
      },
    })
    .where(and(eq(schema.importJobs.id, jobId), eq(schema.importJobs.tenantId, tenantId)))
    .returning();

  return {
    job: updatedJob,
    validCount,
    errorCount,
  };
}

function gstResValid(res: { success: boolean }): boolean {
  return res.success;
}

