"use server";

import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { requirePermission } from "@/server/rbac";
import { revalidatePath } from "next/cache";
import {
  createImportJob,
  addImportJobRows,
  getImportJob,
  getImportJobRows,
  saveJobMapping,
  validateImportJob,
  commitImportJob,
  detectPresetAndMapping,
  ImportEntity,
  ImportSource,
  ImportRowStatus,
} from "@/server/domain/import";

/**
 * Lists historical import jobs for the tenant.
 */
export async function listImportJobsAction(limit = 50) {
  const ctx = await requirePermission("settings.manage");

  return db
    .select()
    .from(schema.importJobs)
    .where(eq(schema.importJobs.tenantId, ctx.tenantId))
    .orderBy(desc(schema.importJobs.createdAt))
    .limit(limit);
}

/**
 * Creates a new import staging job.
 */
export async function createImportJobAction(params: {
  entity: ImportEntity;
  source?: ImportSource;
  fileName: string;
  storeId?: string;
  mapping?: Record<string, string>;
}) {
  const ctx = await requirePermission("settings.manage");
  const storeId = params.storeId || (params.entity === "batches" ? ctx.storeId : null);

  const job = await createImportJob(db, {
    tenantId: ctx.tenantId,
    storeId,
    entity: params.entity,
    source: params.source ?? "generic",
    fileName: params.fileName,
    userId: ctx.userId,
    mapping: params.mapping,
  });

  revalidatePath("/dashboard/import");
  return { success: true, job };
}

/**
 * Uploads a chunk of raw rows (up to 1,000 rows) into staging for a job.
 */
export async function uploadJobChunkAction(params: {
  jobId: string;
  rows: Record<string, string>[];
}) {
  const ctx = await requirePermission("settings.manage");

  const result = await addImportJobRows(db, {
    tenantId: ctx.tenantId,
    jobId: params.jobId,
    rows: params.rows,
  });

  return { success: true, ...result };
}

/**
 * Analyzes CSV header columns to auto-detect the accounting/software preset and suggested mappings.
 */
export async function detectPresetAction(params: {
  headers: string[];
  entity: ImportEntity;
}) {
  await requirePermission("settings.manage");

  return detectPresetAndMapping(params.headers, params.entity);
}

/**
 * Saves column mappings for an import job.
 */
export async function saveJobMappingAction(params: {
  jobId: string;
  mapping: Record<string, string>;
}) {
  const ctx = await requirePermission("settings.manage");

  const updated = await saveJobMapping(db, ctx.tenantId, params.jobId, params.mapping);

  revalidatePath(`/dashboard/import/${params.jobId}`);
  return { success: true, job: updated };
}

/**
 * Validates all staged rows of a job, runs normalizers and matching.
 */
export async function validateImportJobAction(params: { jobId: string }) {
  const ctx = await requirePermission("settings.manage");

  const result = await validateImportJob(db, ctx.tenantId, params.jobId);

  revalidatePath(`/dashboard/import/${params.jobId}`);
  return { success: true, ...result };
}

/**
 * Commits a validated import job into production tables.
 */
export async function commitImportJobAction(params: {
  jobId: string;
  storeId?: string;
  skipErrors?: boolean;
}) {
  const ctx = await requirePermission("settings.manage");
  const storeId = params.storeId || ctx.storeId;

  const result = await commitImportJob(db, {
    tenantId: ctx.tenantId,
    storeId,
    jobId: params.jobId,
    userId: ctx.userId,
    skipErrors: params.skipErrors ?? true,
  });

  revalidatePath("/dashboard/import");
  revalidatePath(`/dashboard/import/${params.jobId}`);
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/suppliers");

  return { success: true, ...result };
}

/**
 * Retrieves import job metadata and status.
 */
export async function getImportJobDetailAction(jobId: string) {
  const ctx = await requirePermission("settings.manage");

  const job = await getImportJob(db, ctx.tenantId, jobId);
  if (!job) return { error: "Import job not found" };

  return { success: true, job };
}

/**
 * Retrieves paginated rows for an import job with optional status filtering.
 */
export async function getImportJobRowsAction(params: {
  jobId: string;
  status?: ImportRowStatus;
  limit?: number;
  offset?: number;
}) {
  const ctx = await requirePermission("settings.manage");

  return getImportJobRows(db, ctx.tenantId, params.jobId, {
    status: params.status,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  });
}

/**
 * Updates a staged row's raw values (inline error fix) and triggers re-validation.
 */
export async function updateJobRowAction(params: {
  jobId: string;
  rowId: string;
  updatedRaw: Record<string, string>;
}) {
  const ctx = await requirePermission("settings.manage");

  const [existing] = await db
    .select()
    .from(schema.importJobRows)
    .where(
      and(
        eq(schema.importJobRows.id, params.rowId),
        eq(schema.importJobRows.tenantId, ctx.tenantId),
        eq(schema.importJobRows.jobId, params.jobId)
      )
    )
    .limit(1);

  if (!existing) return { error: "Row not found" };

  // Update raw row
  await db
    .update(schema.importJobRows)
    .set({
      raw: params.updatedRaw,
      status: "pending",
      errors: [],
    })
    .where(eq(schema.importJobRows.id, params.rowId));

  // Re-run validation for the job to refresh stats and row status
  const valResult = await validateImportJob(db, ctx.tenantId, params.jobId);

  return { success: true, validCount: valResult.validCount, errorCount: valResult.errorCount };
}

/**
 * Exports error rows as a CSV formatted string for distributor or user correction.
 */
export async function exportImportErrorsCsvAction(jobId: string) {
  const ctx = await requirePermission("settings.manage");

  const errorRows = await db
    .select()
    .from(schema.importJobRows)
    .where(
      and(
        eq(schema.importJobRows.tenantId, ctx.tenantId),
        eq(schema.importJobRows.jobId, jobId),
        eq(schema.importJobRows.status, "error")
      )
    )
    .orderBy(schema.importJobRows.rowNo);

  if (errorRows.length === 0) {
    return { success: false, error: "No error rows found" };
  }

  // Collect all unique raw header keys
  const headers = new Set<string>();
  for (const r of errorRows) {
    Object.keys(r.raw).forEach((k) => headers.add(k));
  }
  const headerList = Array.from(headers);
  const csvHeaders = ["Row_Number", ...headerList, "Import_Errors"];

  const escapeCsv = (val: unknown) => {
    const s = String(val ?? "").replace(/"/g, '""');
    return `"${s}"`;
  };

  const lines = [csvHeaders.join(",")];

  for (const r of errorRows) {
    const errorMessages = r.errors.map((e) => `${e.field}: ${e.message}`).join("; ");
    const lineValues = [
      String(r.rowNo),
      ...headerList.map((h) => escapeCsv(r.raw[h] ?? "")),
      escapeCsv(errorMessages),
    ];
    lines.push(lineValues.join(","));
  }

  return {
    success: true,
    fileName: `import-errors-job-${jobId.slice(0, 8)}.csv`,
    csvContent: lines.join("\n"),
  };
}

