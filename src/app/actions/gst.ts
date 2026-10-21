"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, gte, lte, sql, ilike } from "drizzle-orm";
import { requireAuth } from "@/server/auth";
import { requirePermission } from "@/server/rbac";
import { revalidatePath } from "next/cache";
import { isValidGstRateBp, type GstRateBp, GST_RATES_BP } from "@/lib/regulatory";
import {
  buildGstr1Data,
  buildGstr2Data,
  reconcileGst,
  buildGstr1JsonPayload,
  createGstDocumentFromSale,
  createGstDocumentFromPurchase,
} from "@/server/domain/gst";
import {
  generateEInvoiceForDocument,
  cancelEInvoiceForDocument,
  generateEWayBillForDocument,
  type EWayBillInput,
} from "@/server/domain/e-invoice";
import { writeAudit } from "@/server/audit";

export async function getGstDashboard(params?: { month?: number; year?: number }) {
  const ctx = await requirePermission("gst.view");

  const now = new Date();
  const month = params?.month || now.getMonth() + 1;
  const year = params?.year || now.getFullYear();

  // Auto-sync any existing completed sales/purchases that don't have gstDocuments yet
  await syncPendingGstDocuments(ctx.tenantId, ctx.storeId);

  const [gstr1, gstr2, recon] = await Promise.all([
    buildGstr1Data(db, { tenantId: ctx.tenantId, storeId: ctx.storeId, month, year }),
    buildGstr2Data(db, { tenantId: ctx.tenantId, storeId: ctx.storeId, month, year }),
    reconcileGst(db, { tenantId: ctx.tenantId, storeId: ctx.storeId, month, year }),
  ]);

  // E-Invoice counts
  const eInvoicesPending = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.gstDocuments)
    .where(
      and(
        eq(schema.gstDocuments.tenantId, ctx.tenantId),
        eq(schema.gstDocuments.supplyType, "B2B"),
        eq(schema.gstDocuments.refType, "sale"),
        sql`${schema.gstDocuments.irn} is null`,
        eq(schema.gstDocuments.status, "active")
      )
    );

  const activeEwb = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.gstDocuments)
    .where(
      and(
        eq(schema.gstDocuments.tenantId, ctx.tenantId),
        sql`${schema.gstDocuments.eWayBillNo} is not null`,
        eq(schema.gstDocuments.status, "active")
      )
    );

  // Recent 10 GST Documents
  const recentDocs = await db
    .select()
    .from(schema.gstDocuments)
    .where(eq(schema.gstDocuments.tenantId, ctx.tenantId))
    .orderBy(desc(schema.gstDocuments.docDate), desc(schema.gstDocuments.createdAt))
    .limit(10);

  return {
    month,
    year,
    gstr1Totals: gstr1.totals,
    gstr2Totals: gstr2.totals,
    reconciliation: recon,
    pendingEInvoiceCount: Number(eInvoicesPending[0]?.count || 0),
    activeEWayBillCount: Number(activeEwb[0]?.count || 0),
    recentDocs,
  };
}

export async function getOutwardSupplies(params?: {
  month?: number;
  year?: number;
  supplyType?: string;
}) {
  const ctx = await requirePermission("gst.view");
  const now = new Date();
  const month = params?.month || now.getMonth() + 1;
  const year = params?.year || now.getFullYear();

  const data = await buildGstr1Data(db, {
    tenantId: ctx.tenantId,
    storeId: ctx.storeId,
    month,
    year,
  });

  return data;
}

export async function getInwardSupplies(params?: {
  month?: number;
  year?: number;
}) {
  const ctx = await requirePermission("gst.view");
  const now = new Date();
  const month = params?.month || now.getMonth() + 1;
  const year = params?.year || now.getFullYear();

  const data = await buildGstr2Data(db, {
    tenantId: ctx.tenantId,
    storeId: ctx.storeId,
    month,
    year,
  });

  return data;
}

export async function getGstReconciliation(params?: {
  month?: number;
  year?: number;
}) {
  const ctx = await requirePermission("gst.view");
  const now = new Date();
  const month = params?.month || now.getMonth() + 1;
  const year = params?.year || now.getFullYear();

  return reconcileGst(db, {
    tenantId: ctx.tenantId,
    storeId: ctx.storeId,
    month,
    year,
  });
}

export async function getEInvoicesList(params?: { status?: string }) {
  const ctx = await requirePermission("gst.view");

  const conditions = [
    eq(schema.gstDocuments.tenantId, ctx.tenantId),
    eq(schema.gstDocuments.refType, "sale"),
    eq(schema.gstDocuments.supplyType, "B2B"),
  ];

  if (params?.status === "pending") {
    conditions.push(sql`${schema.gstDocuments.irn} is null`);
    conditions.push(eq(schema.gstDocuments.status, "active"));
  } else if (params?.status === "generated") {
    conditions.push(sql`${schema.gstDocuments.irn} is not null`);
    conditions.push(eq(schema.gstDocuments.status, "active"));
  } else if (params?.status === "cancelled") {
    conditions.push(eq(schema.gstDocuments.status, "cancelled"));
  }

  const invoices = await db
    .select()
    .from(schema.gstDocuments)
    .where(and(...conditions))
    .orderBy(desc(schema.gstDocuments.docDate), desc(schema.gstDocuments.createdAt));

  return invoices;
}

export async function generateEInvoiceAction(gstDocumentId: string) {
  const ctx = await requirePermission("accounting.post");

  try {
    const result = await generateEInvoiceForDocument(db, {
      gstDocumentId,
      tenantId: ctx.tenantId,
    });

    await writeAudit(db, ctx, {
      action: "create",
      entityType: "e_invoice",
      entityId: gstDocumentId,
      newValue: { irn: result.irn, ackNo: result.ackNo },
    });

    revalidatePath("/dashboard/gst");
    revalidatePath("/dashboard/gst/e-invoice");
    return { success: true, irn: result.irn, ackNo: result.ackNo };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function cancelEInvoiceAction(
  gstDocumentId: string,
  reasonCode: "1" | "2" | "3" | "4",
  remarks: string
) {
  const ctx = await requirePermission("accounting.post");

  try {
    const result = await cancelEInvoiceForDocument(db, {
      gstDocumentId,
      tenantId: ctx.tenantId,
      reasonCode,
      remarks,
    });

    await writeAudit(db, ctx, {
      action: "cancel",
      entityType: "e_invoice",
      entityId: gstDocumentId,
      reason: `Reason Code ${reasonCode}: ${remarks.trim()}`,
    });

    revalidatePath("/dashboard/gst");
    revalidatePath("/dashboard/gst/e-invoice");
    return { success: true, document: result.document };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function generateEWayBillAction(
  gstDocumentId: string,
  transportDetails: EWayBillInput
) {
  const ctx = await requirePermission("accounting.post");

  try {
    const result = await generateEWayBillForDocument(db, {
      gstDocumentId,
      tenantId: ctx.tenantId,
      transportDetails,
    });

    await writeAudit(db, ctx, {
      action: "create",
      entityType: "eway_bill",
      entityId: gstDocumentId,
      newValue: { ewayBillNo: result.ewayBillNo, validUpto: result.validUpto },
    });

    revalidatePath("/dashboard/gst");
    revalidatePath("/dashboard/gst/e-invoice");
    return {
      success: true,
      ewayBillNo: result.ewayBillNo,
      validUpto: result.validUpto,
    };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function downloadGstr1JsonAction(month: number, year: number) {
  const ctx = await requirePermission("report.export");

  const [tenant] = await db
    .select({ gstin: schema.tenants.gstin })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, ctx.tenantId));

  const [store] = await db
    .select({ gstin: schema.stores.gstin })
    .from(schema.stores)
    .where(eq(schema.stores.id, ctx.storeId));

  const gstin = store?.gstin || tenant?.gstin || "27AAPCS1234F1Z5";

  const gstr1 = await buildGstr1Data(db, {
    tenantId: ctx.tenantId,
    storeId: ctx.storeId,
    month,
    year,
  });

  const payload = buildGstr1JsonPayload(gstr1, gstin);
  return { success: true, payload, filename: `GSTR1_${gstin}_${month}_${year}.json` };
}

/**
 * Internal sync to backfill any existing completed sales and posted purchases
 * into the gst_documents register if they don't already have one.
 */
async function syncPendingGstDocuments(tenantId: string, storeId: string) {
  try {
    // 1. Check sales without GST doc
    const unlinkedSales = await db
      .select({ id: schema.sales.id })
      .from(schema.sales)
      .leftJoin(
        schema.gstDocuments,
        and(
          eq(schema.gstDocuments.refId, schema.sales.id),
          eq(schema.gstDocuments.refType, "sale")
        )
      )
      .where(
        and(
          eq(schema.sales.tenantId, tenantId),
          eq(schema.sales.storeId, storeId),
          eq(schema.sales.status, "completed"),
          sql`${schema.gstDocuments.id} is null`
        )
      )
      .limit(50);

    for (const sale of unlinkedSales) {
      await createGstDocumentFromSale(db, { saleId: sale.id, tenantId, storeId });
    }

    // 2. Check purchases without GST doc
    const unlinkedPurchases = await db
      .select({ id: schema.purchases.id })
      .from(schema.purchases)
      .leftJoin(
        schema.gstDocuments,
        and(
          eq(schema.gstDocuments.refId, schema.purchases.id),
          eq(schema.gstDocuments.refType, "purchase")
        )
      )
      .where(
        and(
          eq(schema.purchases.tenantId, tenantId),
          eq(schema.purchases.storeId, storeId),
          eq(schema.purchases.status, "posted"),
          sql`${schema.gstDocuments.id} is null`
        )
      )
      .limit(50);

    for (const purchase of unlinkedPurchases) {
      await createGstDocumentFromPurchase(db, { purchaseId: purchase.id, tenantId, storeId });
    }
  } catch (err) {
    console.error("GST document auto-sync notice:", err);
  }
}

/**
 * Returns current count of catalog medicines by GST rate (B1.6).
 */
export async function getGstRateDistribution() {
  const { session } = await requireAuth();

  const rows = await db
    .select({
      gstRateBp: schema.medicines.gstRateBp,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.medicines)
    .where(
      and(
        eq(schema.medicines.tenantId, session.tenantId),
        eq(schema.medicines.isActive, true)
      )
    )
    .groupBy(schema.medicines.gstRateBp)
    .orderBy(schema.medicines.gstRateBp);

  return rows;
}

/**
 * Previews medicine count and sample for a proposed GST re-rate (B1.6).
 */
export async function previewGstRerate(params: {
  fromRateBp: number;
  hsnPrefix?: string;
}) {
  const { session } = await requireAuth();

  const conditions = [
    eq(schema.medicines.tenantId, session.tenantId),
    eq(schema.medicines.gstRateBp, params.fromRateBp),
    eq(schema.medicines.isActive, true),
  ];

  if (params.hsnPrefix && params.hsnPrefix.trim().length > 0) {
    conditions.push(ilike(schema.medicines.hsn, `${params.hsnPrefix.trim()}%`));
  }

  const [countRes] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.medicines)
    .where(and(...conditions));

  const sample = await db
    .select({
      id: schema.medicines.id,
      name: schema.medicines.name,
      hsn: schema.medicines.hsn,
      mrp: schema.medicines.mrp,
      gstRateBp: schema.medicines.gstRateBp,
    })
    .from(schema.medicines)
    .where(and(...conditions))
    .limit(8);

  return {
    count: countRes?.count ?? 0,
    sample,
  };
}

/**
 * Bulk updates master catalog GST rates with audit logging (B1.6).
 * Protected by permission: medicine.manage.
 * Only the master is changed; historical sale_items and purchase_items keep their stored rate.
 */
export async function bulkUpdateGstRates(params: {
  fromRateBp: number;
  toRateBp: number;
  hsnPrefix?: string;
  reason?: string;
}) {
  const ctx = await requirePermission("medicine.manage");

  if (!isValidGstRateBp(params.fromRateBp)) {
    return { error: `Invalid source GST rate: ${params.fromRateBp} bp` };
  }
  if (!isValidGstRateBp(params.toRateBp)) {
    return { error: `Invalid target GST rate: ${params.toRateBp} bp` };
  }
  if (params.fromRateBp === params.toRateBp) {
    return { error: "Source and target GST rates must be different" };
  }

  try {
    const updatedCount = await db.transaction(async (tx) => {
      const conditions = [
        eq(schema.medicines.tenantId, ctx.tenantId),
        eq(schema.medicines.gstRateBp, params.fromRateBp),
      ];

      if (params.hsnPrefix && params.hsnPrefix.trim().length > 0) {
        conditions.push(ilike(schema.medicines.hsn, `${params.hsnPrefix.trim()}%`));
      }

      const updatedMedicines = await tx
        .update(schema.medicines)
        .set({
          gstRateBp: params.toRateBp,
          updatedAt: new Date(),
        })
        .where(and(...conditions))
        .returning({ id: schema.medicines.id });

      if (updatedMedicines.length > 0) {
        // Record single audit row for this bulk batch modification
        await tx.insert(schema.auditLogs).values({
          tenantId: ctx.tenantId,
          storeId: ctx.storeId,
          userId: ctx.userId,
          action: "medicine.gst_rerate",
          entityType: "medicine_batch_rerate",
          entityId: null,
          oldValue: {
            gstRateBp: params.fromRateBp,
            hsnPrefix: params.hsnPrefix?.trim() || null,
          },
          newValue: {
            gstRateBp: params.toRateBp,
            count: updatedMedicines.length,
          },
          reason: params.reason?.trim() || "GST 2.0 Notification Medicine Rate Rationalisation",
        });
      }

      return updatedMedicines.length;
    });

    revalidatePath("/dashboard/gst");
    revalidatePath("/dashboard/gst/rates");
    revalidatePath("/dashboard/inventory");

    return {
      success: true,
      count: updatedCount,
    };
  } catch (err: unknown) {
    return {
      error: err instanceof Error ? err.message : String(err) || "Failed to update GST rates",
    };
  }
}
