"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { protectedAction } from "@/server/action";
import { requirePermission } from "@/server/rbac";
import {
  getBillAllocations,
  getPaymentAllocations,
  listCustomersWithDue,
  listOpenBills,
  listRecentPayments,
  postPayment,
} from "@/server/domain/payments";

const uuid = z.string().uuid();

/** Receive money from a customer and settle their bills (oldest first is a UI choice; the server settles exactly what it is told). */
export const recordReceipt = protectedAction("accounting.post")
  .inputSchema(
    z.object({
      customerId: uuid,
      method: z.enum(["cash", "upi", "card", "bank", "cheque", "neft", "rtgs"]),
      paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date"),
      reference: z.string().trim().max(64).optional(),
      note: z.string().trim().max(500).optional(),
      /** paise per bill. The receipt total is the sum of these. */
      bills: z.array(z.object({ saleId: uuid, amount: z.number().int().positive() })).min(1, "Choose at least one bill and an amount."),
    }),
  )
  .action(async ({ parsedInput: i, ctx }) => {
    const result = await db.transaction((tx) =>
      postPayment(tx, ctx, {
        direction: "in",
        partyType: "customer",
        partyId: i.customerId,
        method: i.method,
        amount: i.bills.reduce((sum, b) => sum + b.amount, 0),
        reference: i.reference,
        paymentDate: i.paymentDate,
        note: i.note,
        allocations: i.bills.map((b) => ({ refType: "sale" as const, refId: b.saleId, amount: b.amount })),
      }),
    );
    revalidatePath("/dashboard/accounting");
    revalidatePath("/dashboard/accounting/receipts");
    revalidatePath("/dashboard/accounting/outstanding");
    revalidatePath("/dashboard/customers");
    revalidatePath("/dashboard/customers/credit");
    return result;
  });

export async function getCustomersWithDue() {
  const ctx = await requirePermission("accounting.post");
  return listCustomersWithDue(db, ctx.tenantId, ctx.storeId);
}

export async function getOpenBills(customerId: string) {
  const ctx = await requirePermission("accounting.post");
  return listOpenBills(db, ctx.tenantId, ctx.storeId, uuid.parse(customerId));
}

export async function getRecentReceipts() {
  const ctx = await requirePermission("accounting.post");
  return listRecentPayments(db, ctx.tenantId, ctx.storeId, "in");
}

export async function getPaymentAllocationsAction(paymentId: string) {
  const ctx = await requirePermission("accounting.post");
  return getPaymentAllocations(db, ctx.tenantId, uuid.parse(paymentId));
}

export async function getBillAllocationsAction(
  refType: "sale" | "purchase",
  refId: string,
) {
  const ctx = await requirePermission("accounting.post");
  return getBillAllocations(db, ctx.tenantId, refType, uuid.parse(refId));
}
