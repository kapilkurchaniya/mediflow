"use server";

import { db } from "@/server/db";
import { requirePermission } from "@/server/rbac";
import {
  generateInspectorPack,
  formatScheduleH1Csv,
  type InspectorPackResult,
} from "@/server/domain/compliance/inspector-pack";
import {
  generateCaMonthEndPack,
  formatSalesRegisterCsv,
  formatPurchaseRegisterCsv,
  type CaMonthEndPackResult,
} from "@/server/domain/reports/ca-pack";
import {
  generateTallyDayBookXml,
  generateTallyMastersXml,
} from "@/server/domain/reports/tally-xml";
import { getOrSeedAccounts } from "@/server/domain/accounting";
import { schema } from "@/server/db";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";

export async function getDrugInspectorPackAction(input: {
  storeId?: string;
  startDate: string;
  endDate: string;
}): Promise<{
  success: boolean;
  data?: InspectorPackResult;
  h1Csv?: string;
  error?: string;
}> {
  try {
    const ctx = await requirePermission("report.view");
    const targetStoreId = input.storeId || ctx.storeId;
    if (!targetStoreId) throw new Error("Store ID is required");

    const result = await generateInspectorPack(db, {
      tenantId: ctx.tenantId,
      storeId: targetStoreId,
      startDate: input.startDate,
      endDate: input.endDate,
    });

    const h1Csv = formatScheduleH1Csv(result.scheduleH1);

    return { success: true, data: result, h1Csv };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to generate Drug Inspector pack",
    };
  }
}

export async function getCaMonthEndPackAction(input: {
  monthString: string;
  storeId?: string;
}): Promise<{
  success: boolean;
  data?: CaMonthEndPackResult;
  salesCsv?: string;
  purchasesCsv?: string;
  error?: string;
}> {
  try {
    const ctx = await requirePermission("report.export");
    const targetStoreId = input.storeId || ctx.storeId;

    const result = await generateCaMonthEndPack(db, {
      tenantId: ctx.tenantId,
      monthString: input.monthString,
      storeId: targetStoreId || undefined,
    });

    const salesCsv = formatSalesRegisterCsv(result.sales);
    const purchasesCsv = formatPurchaseRegisterCsv(result.purchases);

    return { success: true, data: result, salesCsv, purchasesCsv };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to generate CA Month-End pack",
    };
  }
}

export async function getTallyXmlExportAction(input: {
  monthString: string;
  storeId?: string;
}): Promise<{
  success: boolean;
  mastersXml?: string;
  dayBookXml?: string;
  voucherCount?: number;
  error?: string;
}> {
  try {
    const ctx = await requirePermission("report.export");
    const targetStoreId = input.storeId || ctx.storeId;
    const [yearStr, monthStr] = input.monthString.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (!year || !month) throw new Error("Invalid month format (expected YYYY-MM)");

    const fromDate = `${input.monthString}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const toDate = `${input.monthString}-${String(lastDay).padStart(2, "0")}`;

    await getOrSeedAccounts(db, ctx.tenantId);

    const [store] = await db
      .select({ name: schema.stores.name })
      .from(schema.stores)
      .where(and(eq(schema.stores.id, targetStoreId), eq(schema.stores.tenantId, ctx.tenantId)))
      .limit(1);

    const accounts = await db
      .select({
        code: schema.accounts.code,
        name: schema.accounts.name,
        type: schema.accounts.type,
        systemKey: schema.accounts.systemKey,
      })
      .from(schema.accounts)
      .where(eq(schema.accounts.tenantId, ctx.tenantId))
      .orderBy(asc(schema.accounts.code));

    const entries = await db
      .select({
        id: schema.journalEntries.id,
        entryNo: schema.journalEntries.entryNo,
        entryDate: schema.journalEntries.entryDate,
        narration: schema.journalEntries.narration,
        refType: schema.journalEntries.refType,
      })
      .from(schema.journalEntries)
      .where(
        and(
          eq(schema.journalEntries.tenantId, ctx.tenantId),
          eq(schema.journalEntries.storeId, targetStoreId),
          gte(schema.journalEntries.entryDate, fromDate),
          lte(schema.journalEntries.entryDate, toDate),
        ),
      )
      .orderBy(asc(schema.journalEntries.entryDate));

    const entryIds = entries.map((e) => e.id);
    const lines =
      entryIds.length > 0
        ? await db
            .select({
              entryId: schema.journalLines.entryId,
              accountName: schema.accounts.name,
              debit: schema.journalLines.debit,
              credit: schema.journalLines.credit,
            })
            .from(schema.journalLines)
            .innerJoin(schema.accounts, eq(schema.journalLines.accountId, schema.accounts.id))
            .where(and(eq(schema.journalLines.tenantId, ctx.tenantId), inArray(schema.journalLines.entryId, entryIds)))
        : [];

    const linesByEntry = new Map<string, Array<{ accountName: string; debitPaise: number; creditPaise: number }>>();
    for (const l of lines) {
      const arr = linesByEntry.get(l.entryId) ?? [];
      arr.push({ accountName: l.accountName, debitPaise: l.debit ?? 0, creditPaise: l.credit ?? 0 });
      linesByEntry.set(l.entryId, arr);
    }

    const companyName = store?.name || "MediFlow Pharmacy";
    const mastersXml = generateTallyMastersXml(companyName, accounts);
    const dayBookXml = generateTallyDayBookXml(
      companyName,
      entries.map((e) => ({
        entryNo: e.entryNo,
        entryDate: String(e.entryDate),
        narration: e.narration,
        refType: e.refType,
        lines: linesByEntry.get(e.id) ?? [],
      })),
    );

    return { success: true, mastersXml, dayBookXml, voucherCount: entries.length };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to generate Tally XML export",
    };
  }
}

