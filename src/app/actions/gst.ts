"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, gte, lte, sql, ilike, inArray, isNull, or } from "drizzle-orm";
import { requireAuth } from "@/server/auth";
import { requirePermission } from "@/server/rbac";
import { revalidatePath } from "next/cache";
import { isValidGstRateBp, type GstRateBp, GST_RATES_BP } from "@/lib/regulatory";
import { encryptSecret } from "@/server/crypto";
import {
  buildGstr1Data,
  buildGstr2Data,
  reconcileGst,
  buildGstr1JsonPayload,
  createGstDocumentFromSale,
  createGstDocumentFromPurchase,
  getTenantGstins,
} from "@/server/domain/gst";
import {
  generateEInvoiceForDocument,
  cancelEInvoiceForDocument,
  generateEWayBillForDocument,
  updateVehicleForEWayBill,
  cancelEWayBillForDocument,
  type EWayBillInput,
  type UpdateVehicleInput,
} from "@/server/domain/e-invoice";
import { writeAudit } from "@/server/audit";

export async function getTenantGstinsAction() {
  const ctx = await requirePermission("gst.view");
  return getTenantGstins(db, ctx.tenantId);
}

export async function getGstDashboard(params?: { month?: number; year?: number; gstin?: string }) {
  const ctx = await requirePermission("gst.view");

  const now = new Date();
  const month = params?.month || now.getMonth() + 1;
  const year = params?.year || now.getFullYear();
  const gstin = params?.gstin?.trim() || undefined;

  // Auto-sync any existing completed sales/purchases that don't have gstDocuments yet
  await syncPendingGstDocuments(ctx.tenantId, ctx.storeId);

  const queryParams = gstin
    ? { tenantId: ctx.tenantId, gstin, month, year }
    : { tenantId: ctx.tenantId, storeId: ctx.storeId, month, year };

  const [gstr1, gstr2, recon] = await Promise.all([
    buildGstr1Data(db, queryParams),
    buildGstr2Data(db, queryParams),
    reconcileGst(db, queryParams),
  ]);

  // Base conditions scoped by tenant and optionally by GSTIN
  const baseConditions = [eq(schema.gstDocuments.tenantId, ctx.tenantId)];

  if (gstin) {
    const matchingStores = await db
      .select({ id: schema.stores.id })
      .from(schema.stores)
      .where(and(eq(schema.stores.tenantId, ctx.tenantId), eq(schema.stores.gstin, gstin)));
    const storeIds = matchingStores.map((s) => s.id);
    if (storeIds.length > 0) {
      baseConditions.push(inArray(schema.gstDocuments.storeId, storeIds));
    }
  }

  const eInvoicesPending = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.gstDocuments)
    .where(
      and(
        ...baseConditions,
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
        ...baseConditions,
        sql`${schema.gstDocuments.eWayBillNo} is not null`,
        eq(schema.gstDocuments.status, "active")
      )
    );

  // Recent 10 GST Documents
  const recentDocs = await db
    .select()
    .from(schema.gstDocuments)
    .where(and(...baseConditions))
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
  gstin?: string;
}) {
  const ctx = await requirePermission("gst.view");
  const now = new Date();
  const month = params?.month || now.getMonth() + 1;
  const year = params?.year || now.getFullYear();
  const gstin = params?.gstin?.trim() || undefined;

  const data = await buildGstr1Data(db, {
    tenantId: ctx.tenantId,
    ...(gstin ? { gstin } : { storeId: ctx.storeId }),
    month,
    year,
  });

  return data;
}

export async function getInwardSupplies(params?: {
  month?: number;
  year?: number;
  gstin?: string;
}) {
  const ctx = await requirePermission("gst.view");
  const now = new Date();
  const month = params?.month || now.getMonth() + 1;
  const year = params?.year || now.getFullYear();
  const gstin = params?.gstin?.trim() || undefined;

  const data = await buildGstr2Data(db, {
    tenantId: ctx.tenantId,
    ...(gstin ? { gstin } : { storeId: ctx.storeId }),
    month,
    year,
  });

  return data;
}

export async function getGstReconciliation(params?: {
  month?: number;
  year?: number;
  gstin?: string;
}) {
  const ctx = await requirePermission("gst.view");
  const now = new Date();
  const month = params?.month || now.getMonth() + 1;
  const year = params?.year || now.getFullYear();
  const gstin = params?.gstin?.trim() || undefined;

  return reconcileGst(db, {
    tenantId: ctx.tenantId,
    ...(gstin ? { gstin } : { storeId: ctx.storeId }),
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
    revalidatePath("/dashboard/gst/e-way-bill");
    return {
      success: true,
      ewayBillNo: result.ewayBillNo,
      validUpto: result.validUpto,
    };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateEWayBillVehicleAction(
  gstDocumentId: string,
  input: UpdateVehicleInput
) {
  const ctx = await requirePermission("accounting.post");

  try {
    const result = await updateVehicleForEWayBill(db, {
      gstDocumentId,
      tenantId: ctx.tenantId,
      vehicleDetails: input,
    });

    await writeAudit(db, ctx, {
      action: "update",
      entityType: "eway_bill_vehicle",
      entityId: gstDocumentId,
      newValue: { vehicleNo: input.vehicleNo, validUpto: result.validUpto },
    });

    revalidatePath("/dashboard/gst");
    revalidatePath("/dashboard/gst/e-way-bill");
    return { success: true, validUpto: result.validUpto };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function cancelEWayBillAction(
  gstDocumentId: string,
  reasonCode: "1" | "2" | "3" | "4",
  remarks?: string
) {
  const ctx = await requirePermission("accounting.post");

  try {
    const result = await cancelEWayBillForDocument(db, {
      gstDocumentId,
      tenantId: ctx.tenantId,
      reasonCode,
      remarks,
    });

    await writeAudit(db, ctx, {
      action: "cancel",
      entityType: "eway_bill",
      entityId: gstDocumentId,
      newValue: { reasonCode, remarks },
    });

    revalidatePath("/dashboard/gst");
    revalidatePath("/dashboard/gst/e-way-bill");
    return { success: true };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function getEWayBillsAction(params?: {
  status?: "all" | "active" | "expiring_soon" | "expired" | "cancelled";
  search?: string;
  limit?: number;
  offset?: number;
}) {
  const ctx = await requirePermission("gst.view");
  const limit = params?.limit ?? 50;
  const offset = params?.offset ?? 0;
  const statusFilter = params?.status ?? "all";
  const search = params?.search?.trim();

  const conditions = [
    eq(schema.gstDocuments.tenantId, ctx.tenantId),
    sql`${schema.gstDocuments.eWayBillNo} is not null`,
  ];

  if (search) {
    const term = `%${search}%`;
    conditions.push(
      or(
        ilike(schema.gstDocuments.eWayBillNo, term),
        ilike(schema.gstDocuments.docNo, term),
        ilike(schema.gstDocuments.partyName, term),
        ilike(schema.gstDocuments.partyGstin, term),
        ilike(schema.gstDocuments.vehicleNo, term)
      )!
    );
  }

  const now = new Date();
  const twelveHoursLater = new Date(now.getTime() + 12 * 60 * 60 * 1000);

  if (statusFilter === "active") {
    conditions.push(
      eq(schema.gstDocuments.status, "active"),
      gte(schema.gstDocuments.eWayBillValidTill, now)
    );
  } else if (statusFilter === "expiring_soon") {
    conditions.push(
      eq(schema.gstDocuments.status, "active"),
      gte(schema.gstDocuments.eWayBillValidTill, now),
      lte(schema.gstDocuments.eWayBillValidTill, twelveHoursLater)
    );
  } else if (statusFilter === "expired") {
    conditions.push(
      eq(schema.gstDocuments.status, "active"),
      sql`${schema.gstDocuments.eWayBillValidTill} < ${now}`
    );
  } else if (statusFilter === "cancelled") {
    conditions.push(eq(schema.gstDocuments.status, "cancelled"));
  }

  const [totalCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.gstDocuments)
    .where(and(...conditions));

  const list = await db
    .select({
      id: schema.gstDocuments.id,
      docNo: schema.gstDocuments.docNo,
      docType: schema.gstDocuments.docType,
      docDate: schema.gstDocuments.docDate,
      partyName: schema.gstDocuments.partyName,
      partyGstin: schema.gstDocuments.partyGstin,
      total: schema.gstDocuments.total,
      taxableAmount: schema.gstDocuments.taxableAmount,
      eWayBillNo: schema.gstDocuments.eWayBillNo,
      eWayBillDate: schema.gstDocuments.eWayBillDate,
      eWayBillValidTill: schema.gstDocuments.eWayBillValidTill,
      vehicleNo: schema.gstDocuments.vehicleNo,
      transporterId: schema.gstDocuments.transporterId,
      transporterName: schema.gstDocuments.transporterName,
      transportMode: schema.gstDocuments.transportMode,
      distanceKm: schema.gstDocuments.distanceKm,
      status: schema.gstDocuments.status,
      cancelledReason: schema.gstDocuments.cancelledReason,
      refType: schema.gstDocuments.refType,
      refId: schema.gstDocuments.refId,
      storeId: schema.gstDocuments.storeId,
      storeName: schema.stores.name,
    })
    .from(schema.gstDocuments)
    .leftJoin(schema.stores, eq(schema.gstDocuments.storeId, schema.stores.id))
    .where(and(...conditions))
    .orderBy(desc(schema.gstDocuments.eWayBillDate), desc(schema.gstDocuments.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    items: list,
    total: Number(totalCount?.count ?? 0),
  };
}

export async function getEWayBillDetailAction(gstDocumentId: string) {
  const ctx = await requirePermission("gst.view");

  const [doc] = await db
    .select({
      id: schema.gstDocuments.id,
      docNo: schema.gstDocuments.docNo,
      docType: schema.gstDocuments.docType,
      docDate: schema.gstDocuments.docDate,
      partyName: schema.gstDocuments.partyName,
      partyGstin: schema.gstDocuments.partyGstin,
      partyStateCode: schema.gstDocuments.partyStateCode,
      placeOfSupply: schema.gstDocuments.placeOfSupply,
      supplyType: schema.gstDocuments.supplyType,
      taxableAmount: schema.gstDocuments.taxableAmount,
      cgst: schema.gstDocuments.cgst,
      sgst: schema.gstDocuments.sgst,
      igst: schema.gstDocuments.igst,
      cess: schema.gstDocuments.cess,
      total: schema.gstDocuments.total,
      eWayBillNo: schema.gstDocuments.eWayBillNo,
      eWayBillDate: schema.gstDocuments.eWayBillDate,
      eWayBillValidTill: schema.gstDocuments.eWayBillValidTill,
      vehicleNo: schema.gstDocuments.vehicleNo,
      transporterId: schema.gstDocuments.transporterId,
      transporterName: schema.gstDocuments.transporterName,
      transportMode: schema.gstDocuments.transportMode,
      distanceKm: schema.gstDocuments.distanceKm,
      status: schema.gstDocuments.status,
      cancelledReason: schema.gstDocuments.cancelledReason,
      cancelledRemarks: schema.gstDocuments.cancelledRemarks,
      refType: schema.gstDocuments.refType,
      refId: schema.gstDocuments.refId,
      irn: schema.gstDocuments.irn,
      signedQrCode: schema.gstDocuments.signedQrCode,
      storeId: schema.gstDocuments.storeId,
    })
    .from(schema.gstDocuments)
    .where(
      and(
        eq(schema.gstDocuments.id, gstDocumentId),
        eq(schema.gstDocuments.tenantId, ctx.tenantId)
      )
    );

  if (!doc) {
    return { error: "E-Way Bill / GST document not found" };
  }

  const [store] = await db
    .select()
    .from(schema.stores)
    .where(eq(schema.stores.id, doc.storeId));

  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, ctx.tenantId));

  const logs = await db
    .select()
    .from(schema.eInvoiceLogs)
    .where(
      and(
        eq(schema.eInvoiceLogs.tenantId, ctx.tenantId),
        eq(schema.eInvoiceLogs.gstDocumentId, gstDocumentId)
      )
    )
    .orderBy(desc(schema.eInvoiceLogs.createdAt));

  let items: Array<{
    name: string;
    hsn?: string | null;
    qty: number;
    unitPrice: number;
    taxableAmount: number;
    gstRateBp: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
    batchNo?: string | null;
  }> = [];

  if (doc.refType === "sale" && doc.refId) {
    const saleItems = await db
      .select({
        id: schema.saleItems.id,
        medicineName: schema.saleItems.medicineName,
        hsn: schema.medicines.hsn,
        qty: schema.saleItems.qty,
        unitPrice: schema.saleItems.rate,
        taxableAmount: schema.saleItems.taxableAmount,
        cgst: schema.saleItems.cgst,
        sgst: schema.saleItems.sgst,
        igst: schema.saleItems.igst,
        total: schema.saleItems.totalAmount,
        batchNo: schema.saleItems.batchNo,
      })
      .from(schema.saleItems)
      .leftJoin(schema.medicines, eq(schema.saleItems.medicineId, schema.medicines.id))
      .where(eq(schema.saleItems.saleId, doc.refId));

    items = saleItems.map((si) => ({
      name: si.medicineName,
      hsn: si.hsn,
      qty: si.qty,
      unitPrice: si.unitPrice ?? 0,
      taxableAmount: si.taxableAmount ?? 0,
      gstRateBp: 0,
      cgst: si.cgst ?? 0,
      sgst: si.sgst ?? 0,
      igst: si.igst ?? 0,
      total: si.total ?? 0,
      batchNo: si.batchNo,
    }));
  } else if (doc.refType === "transfer" && doc.refId) {
    const transferItems = await db
      .select({
        id: schema.stockTransferItems.id,
        medicineName: schema.medicines.name,
        hsn: schema.stockTransferItems.hsn,
        qty: schema.stockTransferItems.qty,
        qtyDispatched: schema.stockTransferItems.qtyDispatched,
        unitCost: schema.stockTransferItems.unitCost,
        gstRateBp: schema.stockTransferItems.gstRateBp,
        batchNo: schema.stockTransferItems.batchNo,
      })
      .from(schema.stockTransferItems)
      .innerJoin(schema.medicines, eq(schema.stockTransferItems.medicineId, schema.medicines.id))
      .where(eq(schema.stockTransferItems.transferId, doc.refId));

    items = transferItems.map((ti) => {
      const q = ti.qtyDispatched > 0 ? ti.qtyDispatched : ti.qty;
      const unit = ti.unitCost ?? 0;
      const taxable = q * unit;
      const rateBp = ti.gstRateBp ?? 0;
      const tax = Math.round((taxable * rateBp) / 10000);
      return {
        name: ti.medicineName,
        hsn: ti.hsn,
        qty: q,
        unitPrice: unit,
        taxableAmount: taxable,
        gstRateBp: rateBp,
        cgst: Math.round(tax / 2),
        sgst: Math.round(tax / 2),
        igst: 0,
        total: taxable + tax,
        batchNo: ti.batchNo,
      };
    });
  }

  return {
    success: true,
    document: doc,
    store,
    tenant,
    logs,
    items,
  };
}

export async function downloadGstr1JsonAction(month: number, year: number, selectedGstin?: string) {
  const ctx = await requirePermission("report.export");

  const [tenant] = await db
    .select({ gstin: schema.tenants.gstin })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, ctx.tenantId));

  const [store] = await db
    .select({ gstin: schema.stores.gstin })
    .from(schema.stores)
    .where(eq(schema.stores.id, ctx.storeId));

  const gstin = selectedGstin?.trim() || store?.gstin || tenant?.gstin || "27AAPCS1234F1Z5";

  const gstr1 = await buildGstr1Data(db, {
    tenantId: ctx.tenantId,
    ...(selectedGstin ? { gstin: selectedGstin.trim() } : { storeId: ctx.storeId }),
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

/**
 * Saves multi-tenant GSP / NIC API credentials securely encrypted at rest (B5.1).
 */
export async function saveGspCredentialsAction(input: {
  provider: string;
  clientId: string;
  clientSecret: string;
  portalUsername: string;
  portalPassword: string;
  isSandbox: boolean;
  storeId?: string | null;
}) {
  const ctx = await requirePermission("accounting.post");

  try {
    const clientIdEnc = encryptSecret(input.clientId.trim());
    const clientSecretEnc = encryptSecret(input.clientSecret.trim());
    const portalUsernameEnc = encryptSecret(input.portalUsername.trim());
    const portalPasswordEnc = encryptSecret(input.portalPassword.trim());

    const conditions = [
      eq(schema.tenantGspCredentials.tenantId, ctx.tenantId),
      eq(schema.tenantGspCredentials.isSandbox, input.isSandbox),
    ];
    if (input.storeId) {
      conditions.push(eq(schema.tenantGspCredentials.storeId, input.storeId));
    } else {
      conditions.push(isNull(schema.tenantGspCredentials.storeId));
    }

    const [existing] = await db
      .select({ id: schema.tenantGspCredentials.id })
      .from(schema.tenantGspCredentials)
      .where(and(...conditions))
      .limit(1);

    let credentialId: string;
    if (existing) {
      credentialId = existing.id;
      await db
        .update(schema.tenantGspCredentials)
        .set({
          provider: input.provider.trim(),
          clientIdEnc,
          clientSecretEnc,
          portalUsernameEnc,
          portalPasswordEnc,
          cachedAuthTokenEnc: null,
          tokenExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.tenantGspCredentials.id, existing.id));
    } else {
      const [inserted] = await db
        .insert(schema.tenantGspCredentials)
        .values({
          tenantId: ctx.tenantId,
          storeId: input.storeId || null,
          provider: input.provider.trim(),
          clientIdEnc,
          clientSecretEnc,
          portalUsernameEnc,
          portalPasswordEnc,
          isSandbox: input.isSandbox,
        })
        .returning({ id: schema.tenantGspCredentials.id });
      credentialId = inserted!.id;
    }

    await writeAudit(db, ctx, {
      action: "update",
      entityType: "gsp_credentials",
      entityId: credentialId,
      newValue: {
        provider: input.provider.trim(),
        isSandbox: input.isSandbox,
        storeId: input.storeId || null,
      },
    });

    revalidatePath("/dashboard/settings/gst");
    revalidatePath("/dashboard/gst/e-invoice");
    return { success: true };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Returns configured GSP integration settings per tenant (without plaintext secrets).
 */
export async function getGspSettingsAction() {
  const ctx = await requirePermission("gst.view");

  const creds = await db
    .select({
      id: schema.tenantGspCredentials.id,
      storeId: schema.tenantGspCredentials.storeId,
      provider: schema.tenantGspCredentials.provider,
      isSandbox: schema.tenantGspCredentials.isSandbox,
      hasToken: sql<boolean>`${schema.tenantGspCredentials.cachedAuthTokenEnc} is not null`,
      tokenExpiresAt: schema.tenantGspCredentials.tokenExpiresAt,
      updatedAt: schema.tenantGspCredentials.updatedAt,
    })
    .from(schema.tenantGspCredentials)
    .where(eq(schema.tenantGspCredentials.tenantId, ctx.tenantId));

  return creds;
}

/**
 * Tests authentication handshake with the GSP / NIC API using supplied credentials.
 */
export async function testGspConnectionAction(input: {
  provider: string;
  clientId: string;
  clientSecret: string;
  portalUsername: string;
  portalPassword: string;
  isSandbox: boolean;
}) {
  await requirePermission("accounting.post");

  try {
    const { GspIRPProvider } = await import("@/server/domain/einvoice-providers/gsp-provider");
    const testProvider = new GspIRPProvider({
      clientId: input.clientId.trim(),
      clientSecret: input.clientSecret.trim(),
      portalUsername: input.portalUsername.trim(),
      portalPassword: input.portalPassword.trim(),
      isSandbox: input.isSandbox,
    });

    const token = await testProvider.getAuthToken();
    return { success: true, tokenPreview: `${token.slice(0, 8)}...${token.slice(-4)}` };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
