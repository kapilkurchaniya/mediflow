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

