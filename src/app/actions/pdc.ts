"use server";

import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { requirePermission } from "@/server/rbac";
import {
  clearPdcCheque,
  depositPdcCheque,
  dishonourPdcCheque,
  listPdcCheques,
  registerPdcCheque,
} from "@/server/domain/pdc";

export async function getPdcPageDataAction() {
  const ctx = await requirePermission("accounting.view");
  const [cheques, customers, suppliers] = await Promise.all([
    listPdcCheques(db, ctx.tenantId, ctx.storeId),
    db
      .select({ id: schema.customers.id, name: schema.customers.name })
      .from(schema.customers)
      .where(eq(schema.customers.tenantId, ctx.tenantId))
      .orderBy(asc(schema.customers.name))
      .limit(200),
    db
      .select({ id: schema.suppliers.id, name: schema.suppliers.name })
      .from(schema.suppliers)
      .where(eq(schema.suppliers.tenantId, ctx.tenantId))
      .orderBy(asc(schema.suppliers.name))
      .limit(200),
  ]);
  return { cheques, customers, suppliers };
}

export async function registerPdcAction(input: {
  direction: "inward" | "outward";
  partyType: "customer" | "supplier";
  partyId?: string | null;
  partyName: string;
  chequeNo: string;
  chequeDate: string;
  bankName: string;
  amountPaise: number;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await requirePermission("accounting.post");
    await registerPdcCheque({
      tx: db,
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      ...input,
      createdBy: ctx.userId,
    });
    revalidatePath("/dashboard/accounting/pdc");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to register PDC" };
  }
}

export async function depositPdcAction(input: {
  pdcId: string;
  payInSlipNo: string;
  depositedAt: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await requirePermission("accounting.post");
    await depositPdcCheque({ tx: db, tenantId: ctx.tenantId, ...input });
    revalidatePath("/dashboard/accounting/pdc");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to deposit PDC" };
  }
}

export async function clearPdcAction(input: {
  pdcId: string;
  clearedAt: string;
}): Promise<{ success: boolean; entryNo?: string; error?: string }> {
  try {
    const ctx = await requirePermission("accounting.post");
    const res = await db.transaction((tx) =>
      clearPdcCheque({
        tx,
        tenantId: ctx.tenantId,
        storeId: ctx.storeId,
        pdcId: input.pdcId,
        clearedAt: input.clearedAt,
        userId: ctx.userId,
      }),
    );
    revalidatePath("/dashboard/accounting/pdc");
    revalidatePath("/dashboard/accounting");
    return { success: true, entryNo: res.entryNo };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to clear PDC" };
  }
}

export async function dishonourPdcAction(input: {
  pdcId: string;
  reason: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await requirePermission("accounting.post");
    await dishonourPdcCheque({ tx: db, tenantId: ctx.tenantId, pdcId: input.pdcId, reason: input.reason });
    revalidatePath("/dashboard/accounting/pdc");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to mark PDC dishonoured" };
  }
}
