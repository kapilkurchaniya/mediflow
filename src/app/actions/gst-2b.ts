"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { requirePermission } from "@/server/rbac";
import { parseGstr2bJson } from "@/server/domain/gst-reconciliation/parser";
import {
  reconcileGstr2bWithBooks,
  BookPurchaseCandidate,
} from "@/server/domain/gst-reconciliation/match-engine";
import {
  generateImsBulkActionCsv,
  ImsExportLine,
} from "@/server/domain/gst-reconciliation/ims-actions";
import { ImsAction } from "@/server/domain/gst-reconciliation/types";

/**
 * Upload and reconcile a GSTR-2B JSON portal download
 */
export async function importGstr2bAction(formData: FormData) {
  const ctx = await requirePermission("accounting.post");

  const file = formData.get("file") as File | null;
  if (!file) {
    return { success: false as const, error: "No GSTR-2B JSON file provided" };
  }

  let textContent: string;
  try {
    textContent = await file.text();
  } catch {
    return { success: false as const, error: "Failed to read file contents" };
  }

  let parsed;
  try {
    parsed = parseGstr2bJson(textContent);
  } catch (err: unknown) {
    return {
      success: false as const,
      error: err instanceof Error ? err.message : "Failed to parse GSTR-2B JSON",
    };
  }

  if (parsed.lines.length === 0) {
    return {
      success: false as const,
      error: "No valid B2B or CDNR invoice lines found in the uploaded file",
    };
  }

  // Fetch book purchases for the tenant
  const rawPurchases = await db
    .select({
      id: schema.purchases.id,
      purchaseNo: schema.purchases.purchaseNo,
      supplierInvoiceNo: schema.purchases.supplierInvoiceNo,
      supplierGstin: schema.suppliers.gstin,
      supplierName: schema.suppliers.name,
      invoiceDate: schema.purchases.invoiceDate,
      taxableAmount: schema.purchases.taxableAmount,
      cgst: schema.purchases.cgst,
      sgst: schema.purchases.sgst,
      igst: schema.purchases.igst,
      totalAmount: schema.purchases.totalAmount,
    })
    .from(schema.purchases)
    .leftJoin(schema.suppliers, eq(schema.purchases.supplierId, schema.suppliers.id))
    .where(
      and(
        eq(schema.purchases.tenantId, ctx.tenantId),
        eq(schema.purchases.status, "posted")
      )
    );

  const bookCandidates: BookPurchaseCandidate[] = rawPurchases.map((p) => ({
    id: p.id,
    purchaseNo: p.purchaseNo,
    supplierInvoiceNo: p.supplierInvoiceNo,
    supplierGstin: p.supplierGstin,
    supplierName: p.supplierName,
    invoiceDate: p.invoiceDate,
    taxableAmount: p.taxableAmount || 0,
    cgst: p.cgst || 0,
    sgst: p.sgst || 0,
    igst: p.igst || 0,
    totalAmount: p.totalAmount || 0,
  }));

  const reconResult = reconcileGstr2bWithBooks(parsed.lines, bookCandidates);

  const totalTaxable = reconResult.lines.reduce((acc, l) => acc + l.taxableAmount, 0);
  const totalCgst = reconResult.lines.reduce((acc, l) => acc + l.cgst, 0);
  const totalSgst = reconResult.lines.reduce((acc, l) => acc + l.sgst, 0);
  const totalIgst = reconResult.lines.reduce((acc, l) => acc + l.igst, 0);
  const totalCess = reconResult.lines.reduce((acc, l) => acc + l.cess, 0);

  // Insert import record
  const [importRecord] = await db
    .insert(schema.gst2bImports)
    .values({
      tenantId: ctx.tenantId,
      gstin: parsed.gstin || "UNKNOWN",
      returnPeriod: parsed.returnPeriod,
      fileName: file.name || "gstr2b.json",
      fileSize: file.size,
      totalInvoices: reconResult.summary.total2bInvoices,
      totalTaxableAmount: totalTaxable,
      totalCgst: totalCgst,
      totalSgst: totalSgst,
      totalIgst: totalIgst,
      totalCess: totalCess,
      status: "reconciled",
      uploadedBy: ctx.userId,
    })
    .returning();

  // Insert lines
  if (reconResult.lines.length > 0) {
    await db.insert(schema.gst2bLines).values(
      reconResult.lines.map((l) => ({
        tenantId: ctx.tenantId,
        importId: importRecord.id,
        supplierGstin: l.supplierGstin,
        supplierName: l.supplierName,
        docType: l.docType,
        invoiceNo: l.invoiceNo,
        invoiceDate: l.invoiceDate,
        taxableAmount: l.taxableAmount,
        cgst: l.cgst,
        sgst: l.sgst,
        igst: l.igst,
        cess: l.cess,
        totalAmount: l.totalAmount,
        itcAvailability: l.itcAvailability,
        itcReason: l.itcReason,
        matchStatus: l.matchStatus,
        matchedPurchaseId: l.matchedPurchaseId,
        matchVarianceAmount: l.matchVarianceAmount,
        matchNotes: l.matchNotes,
        imsAction: l.imsAction,
      }))
    );
  }

  revalidatePath("/dashboard/gst/gstr2b");
  return {
    success: true as const,
    importId: importRecord.id,
    summary: reconResult.summary,
  };
}

/**
 * List past GSTR-2B imports
 */
export async function getGstr2bImportsAction() {
  const ctx = await requirePermission("gst.view");

  const imports = await db
    .select()
    .from(schema.gst2bImports)
    .where(eq(schema.gst2bImports.tenantId, ctx.tenantId))
    .orderBy(desc(schema.gst2bImports.createdAt));

  return imports;
}

/**
 * Fetch reconciliation details and lines for an import
 */
export async function getGstr2bReconciliationAction(importId: string) {
  const ctx = await requirePermission("gst.view");

  const [importMeta] = await db
    .select()
    .from(schema.gst2bImports)
    .where(and(eq(schema.gst2bImports.id, importId), eq(schema.gst2bImports.tenantId, ctx.tenantId)))
    .limit(1);

  if (!importMeta) return null;

  const lines = await db
    .select({
      id: schema.gst2bLines.id,
      supplierGstin: schema.gst2bLines.supplierGstin,
      supplierName: schema.gst2bLines.supplierName,
      docType: schema.gst2bLines.docType,
      invoiceNo: schema.gst2bLines.invoiceNo,
      invoiceDate: schema.gst2bLines.invoiceDate,
      taxableAmount: schema.gst2bLines.taxableAmount,
      cgst: schema.gst2bLines.cgst,
      sgst: schema.gst2bLines.sgst,
      igst: schema.gst2bLines.igst,
      cess: schema.gst2bLines.cess,
      totalAmount: schema.gst2bLines.totalAmount,
      itcAvailability: schema.gst2bLines.itcAvailability,
      itcReason: schema.gst2bLines.itcReason,
      matchStatus: schema.gst2bLines.matchStatus,
      matchedPurchaseId: schema.gst2bLines.matchedPurchaseId,
      matchVarianceAmount: schema.gst2bLines.matchVarianceAmount,
      matchNotes: schema.gst2bLines.matchNotes,
      imsAction: schema.gst2bLines.imsAction,
      imsActionDate: schema.gst2bLines.imsActionDate,
      imsActionBy: schema.gst2bLines.imsActionBy,
      purchaseNo: schema.purchases.purchaseNo,
      purchaseTotalAmount: schema.purchases.totalAmount,
      purchaseInvoiceDate: schema.purchases.invoiceDate,
    })
    .from(schema.gst2bLines)
    .leftJoin(schema.purchases, eq(schema.gst2bLines.matchedPurchaseId, schema.purchases.id))
    .where(and(eq(schema.gst2bLines.importId, importId), eq(schema.gst2bLines.tenantId, ctx.tenantId)))
    .orderBy(schema.gst2bLines.matchStatus, schema.gst2bLines.supplierGstin);

  return { importMeta, lines };
}

/**
 * Update IMS action for a single invoice line
 */
export async function updateImsAction(lineId: string, action: ImsAction) {
  const ctx = await requirePermission("accounting.post");

  await db
    .update(schema.gst2bLines)
    .set({
      imsAction: action,
      imsActionDate: new Date(),
      imsActionBy: ctx.userId,
    })
    .where(and(eq(schema.gst2bLines.id, lineId), eq(schema.gst2bLines.tenantId, ctx.tenantId)));

  revalidatePath("/dashboard/gst/gstr2b");
  return { success: true as const };
}

/**
 * Bulk update IMS action (e.g. Accept All Matched)
 */
export async function bulkUpdateImsAction(
  importId: string,
  action: ImsAction,
  matchStatusFilter?: string
) {
  const ctx = await requirePermission("accounting.post");

  const conditions = [
    eq(schema.gst2bLines.importId, importId),
    eq(schema.gst2bLines.tenantId, ctx.tenantId),
  ];

  if (matchStatusFilter) {
    conditions.push(eq(schema.gst2bLines.matchStatus, matchStatusFilter));
  }

  await db
    .update(schema.gst2bLines)
    .set({
      imsAction: action,
      imsActionDate: new Date(),
      imsActionBy: ctx.userId,
    })
    .where(and(...conditions));

  revalidatePath("/dashboard/gst/gstr2b");
  return { success: true as const };
}

/**
 * Generate GSTN IMS bulk action CSV export
 */
export async function exportImsActionsCsvAction(importId: string) {
  const ctx = await requirePermission("gst.view");

  const lines = await db
    .select()
    .from(schema.gst2bLines)
    .where(and(eq(schema.gst2bLines.importId, importId), eq(schema.gst2bLines.tenantId, ctx.tenantId)));

  const exportLines: ImsExportLine[] = lines.map((l) => ({
    supplierGstin: l.supplierGstin,
    supplierName: l.supplierName || "",
    docType: l.docType,
    invoiceNo: l.invoiceNo,
    invoiceDate: l.invoiceDate,
    taxableAmountPaise: l.taxableAmount || 0,
    igstPaise: l.igst || 0,
    cgstPaise: l.cgst || 0,
    sgstPaise: l.sgst || 0,
    cessPaise: l.cess || 0,
    totalAmountPaise: l.totalAmount || 0,
    imsAction: l.imsAction as ImsAction,
    remarks: l.itcReason,
  }));

  const csv = generateImsBulkActionCsv(exportLines);
  return { success: true as const, csv };
}
