"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { requirePermission } from "@/server/rbac";
import { convertChallanToWholesaleInvoiceSummary, type WholesaleChallan } from "@/lib/wholesale/challan";
import { computeTdsDeduction, type TdsSection } from "@/lib/tax/composition-and-tds";
import { buildOwnerExecutivePulse, type StorePulseInput } from "@/lib/analytics/owner-pulse";
import { registerPdcCheque } from "@/server/domain/pdc";
import type { MigratedPdcRow } from "@/server/domain/import/marg-deep-migration";

export async function listWholesaleChallansAction() {
  const ctx = await requirePermission("sale.view");
  return db
    .select()
    .from(schema.wholesaleChallans)
    .where(and(eq(schema.wholesaleChallans.tenantId, ctx.tenantId), eq(schema.wholesaleChallans.storeId, ctx.storeId)))
    .orderBy(desc(schema.wholesaleChallans.challanDate), desc(schema.wholesaleChallans.createdAt))
    .limit(50);
}

export async function saveWholesaleChallanAction(input: WholesaleChallan): Promise<{
  success: boolean;
  id?: string;
  error?: string;
}> {
  try {
    const ctx = await requirePermission("sale.create");
    const summary = convertChallanToWholesaleInvoiceSummary(input);
    const [inserted] = await db
      .insert(schema.wholesaleChallans)
      .values({
        tenantId: ctx.tenantId,
        storeId: ctx.storeId,
        challanNo: input.challanNo.trim(),
        challanDate: input.challanDate,
        buyerName: input.buyerName.trim(),
        buyerGstin: input.buyerGstin?.trim() || null,
        routeName: input.routeName?.trim() || null,
        salesmanName: input.salesmanName?.trim() || null,
        lrNo: input.lrNo?.trim() || null,
        taxableAmount: summary.taxablePaise,
        gstAmount: summary.gstPaise,
        grandTotal: summary.grandTotalPaise,
        requiresEwayBill: summary.requiresEwayBill,
        status: "open",
        lines: input.lines as unknown as Array<Record<string, unknown>>,
        createdBy: ctx.userId,
      })
      .returning({ id: schema.wholesaleChallans.id });

    revalidatePath("/dashboard/wholesale");
    return { success: true, id: inserted.id };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to save challan" };
  }
}

export async function listTdsEntriesAction() {
  const ctx = await requirePermission("gst.view");
  return db
    .select()
    .from(schema.tdsEntries)
    .where(and(eq(schema.tdsEntries.tenantId, ctx.tenantId), eq(schema.tdsEntries.storeId, ctx.storeId)))
    .orderBy(desc(schema.tdsEntries.entryDate), desc(schema.tdsEntries.createdAt))
    .limit(50);
}

export async function recordTdsEntryAction(input: {
  section: TdsSection;
  partyName: string;
  partyPan?: string;
  entryDate: string;
  baseAmountPaise: number;
  hasPan: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await requirePermission("accounting.post");
    const calc = computeTdsDeduction({
      section: input.section,
      baseAmountPaise: input.baseAmountPaise,
      hasPan: input.hasPan,
    });
    await db.insert(schema.tdsEntries).values({
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      section: calc.section,
      partyName: input.partyName.trim() || "Vendor",
      partyPan: input.partyPan?.trim().toUpperCase() || null,
      entryDate: input.entryDate,
      baseAmount: calc.baseAmountPaise,
      rateBp: calc.rateBp,
      tdsAmount: calc.tdsAmountPaise,
      netPayable: calc.netPayablePaise,
      createdBy: ctx.userId,
    });
    revalidatePath("/dashboard/gst/ims-and-tax");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to record TDS entry" };
  }
}

export async function getLiveOwnerPulseAction() {
  const ctx = await requirePermission("report.view");
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const nearExpiryCutoff = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);

  const stores = await db
    .select({ id: schema.stores.id, name: schema.stores.name })
    .from(schema.stores)
    .where(and(eq(schema.stores.tenantId, ctx.tenantId), eq(schema.stores.isActive, true)));

  const pulseInputs: StorePulseInput[] = [];
  for (const s of stores) {
    const [salesRows, nearExpBatches] = await Promise.all([
      db
        .select({
          totalAmount: schema.sales.totalAmount,
          paidAmount: schema.sales.paidAmount,
          creditAmount: schema.sales.creditAmount,
        })
        .from(schema.sales)
        .where(
          and(
            eq(schema.sales.tenantId, ctx.tenantId),
            eq(schema.sales.storeId, s.id),
            eq(schema.sales.status, "completed"),
            gte(schema.sales.completedAt, todayStart),
          ),
        ),
      db
        .select({
          qtyOnHand: schema.batches.qtyOnHand,
          purchaseRate: schema.batches.purchaseRate,
        })
        .from(schema.batches)
        .where(
          and(
            eq(schema.batches.tenantId, ctx.tenantId),
            eq(schema.batches.storeId, s.id),
            eq(schema.batches.status, "active"),
            lt(schema.batches.expiryDate, nearExpiryCutoff),
          ),
        ),
    ]);

    let todaySalesPaise = 0;
    let cashCollectedPaise = 0;
    let creditIssuedPaise = 0;
    for (const r of salesRows) {
      todaySalesPaise += r.totalAmount || 0;
      cashCollectedPaise += r.paidAmount || 0;
      creditIssuedPaise += r.creditAmount || 0;
    }

    let nearExpiryValuePaise = 0;
    for (const b of nearExpBatches) {
      nearExpiryValuePaise += Math.max(0, b.qtyOnHand) * (b.purchaseRate || 0);
    }

    pulseInputs.push({
      storeId: s.id,
      storeName: s.name,
      todaySalesPaise,
      cashCollectedPaise,
      upiCollectedPaise: 0,
      cardCollectedPaise: 0,
      creditIssuedPaise,
      nearExpiryValuePaise,
      lowStockSkuCount: 0,
    });
  }

  return buildOwnerExecutivePulse(pulseInputs);
}

export async function commitMargPdcImportAction(rows: MigratedPdcRow[]): Promise<{
  success: boolean;
  importedCount?: number;
  error?: string;
}> {
  try {
    const ctx = await requirePermission("accounting.post");
    let count = 0;
    await db.transaction(async (tx) => {
      for (const row of rows) {
        await registerPdcCheque({
          tx,
          tenantId: ctx.tenantId,
          storeId: ctx.storeId,
          direction: row.direction,
          partyType: row.direction === "inward" ? "customer" : "supplier",
          partyName: row.partyName,
          chequeNo: row.chequeNo,
          chequeDate: row.chequeDate,
          bankName: row.bankName,
          amountPaise: row.amountPaise,
          createdBy: ctx.userId,
        });
        count++;
      }
    });
    revalidatePath("/dashboard/accounting/pdc");
    return { success: true, importedCount: count };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to import PDCs" };
  }
}
