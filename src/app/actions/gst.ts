"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { requireAuth } from "@/server/auth";
import { revalidatePath } from "next/cache";
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

export async function getGstDashboard(params?: { month?: number; year?: number }) {
  const { session } = await requireAuth();
  if (!session.storeId) throw new Error("Store required");

  const now = new Date();
  const month = params?.month || now.getMonth() + 1;
  const year = params?.year || now.getFullYear();

  // Auto-sync any existing completed sales/purchases that don't have gstDocuments yet
  await syncPendingGstDocuments(session.tenantId, session.storeId);

  const [gstr1, gstr2, recon] = await Promise.all([
    buildGstr1Data(db, { tenantId: session.tenantId, storeId: session.storeId, month, year }),
    buildGstr2Data(db, { tenantId: session.tenantId, storeId: session.storeId, month, year }),
    reconcileGst(db, { tenantId: session.tenantId, storeId: session.storeId, month, year }),
  ]);

  // E-Invoice counts
  const eInvoicesPending = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.gstDocuments)
    .where(
      and(
        eq(schema.gstDocuments.tenantId, session.tenantId),
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
        eq(schema.gstDocuments.tenantId, session.tenantId),
        sql`${schema.gstDocuments.eWayBillNo} is not null`,
        eq(schema.gstDocuments.status, "active")
      )
    );

  // Recent 10 GST Documents
  const recentDocs = await db
    .select()
    .from(schema.gstDocuments)
    .where(eq(schema.gstDocuments.tenantId, session.tenantId))
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
  const { session } = await requireAuth();
  const now = new Date();
  const month = params?.month || now.getMonth() + 1;
  const year = params?.year || now.getFullYear();

  const data = await buildGstr1Data(db, {
    tenantId: session.tenantId,
    storeId: session.storeId,
    month,
    year,
  });

  return data;
}

export async function getInwardSupplies(params?: {
  month?: number;
  year?: number;
}) {
  const { session } = await requireAuth();
  const now = new Date();
  const month = params?.month || now.getMonth() + 1;
  const year = params?.year || now.getFullYear();

  const data = await buildGstr2Data(db, {
    tenantId: session.tenantId,
    storeId: session.storeId,
    month,
    year,
  });

  return data;
}

export async function getGstReconciliation(params?: {
  month?: number;
  year?: number;
}) {
  const { session } = await requireAuth();
  const now = new Date();
  const month = params?.month || now.getMonth() + 1;
  const year = params?.year || now.getFullYear();

  return reconcileGst(db, {
    tenantId: session.tenantId,
    storeId: session.storeId,
    month,
    year,
  });
}

export async function getEInvoicesList(params?: { status?: string }) {
  const { session } = await requireAuth();

  const conditions = [
    eq(schema.gstDocuments.tenantId, session.tenantId),
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
  const { session } = await requireAuth();

  try {
    const result = await generateEInvoiceForDocument(db, {
      gstDocumentId,
      tenantId: session.tenantId,
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
  const { session } = await requireAuth();

  try {
    const result = await cancelEInvoiceForDocument(db, {
      gstDocumentId,
      tenantId: session.tenantId,
      reasonCode,
      remarks,
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
  const { session } = await requireAuth();

  try {
    const result = await generateEWayBillForDocument(db, {
      gstDocumentId,
      tenantId: session.tenantId,
      transportDetails,
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
  const { session } = await requireAuth();

  const [tenant] = await db
    .select({ gstin: schema.tenants.gstin })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, session.tenantId));

  const [store] = await db
    .select({ gstin: schema.stores.gstin })
    .from(schema.stores)
    .where(eq(schema.stores.id, session.storeId!));

  const gstin = store?.gstin || tenant?.gstin || "27AAPCS1234F1Z5";

  const gstr1 = await buildGstr1Data(db, {
    tenantId: session.tenantId,
    storeId: session.storeId,
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
