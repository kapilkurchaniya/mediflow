import { z } from "zod";
import { and, eq, gt, ilike } from "drizzle-orm";
import { db, schema } from "@/server/db";
import type { MediFlowAiTool } from "../types";

export const addToBillTool: MediFlowAiTool<{ medicineName: string }> = {
  name: "add_to_bill",
  description:
    "Add a medicine to the current bill or active cart in the Point of Sale interface. Finds the active FEFO batch in this store.",
  permission: "sale.create",
  isWriteAction: true,
  inputSchema: z.object({
    medicineName: z.string().describe("The name of the medicine to add to the active POS bill"),
  }),
  execute: async (ctx, { medicineName }) => {
    if (!ctx.storeId) {
      return { error: "Active store session required to add items to bill." };
    }

    // 1. Locate medicine
    const [med] = await db
      .select({
        id: schema.medicines.id,
        name: schema.medicines.name,
        mrp: schema.medicines.mrp,
        gstRateBp: schema.medicines.gstRateBp,
      })
      .from(schema.medicines)
      .where(
        and(
          eq(schema.medicines.tenantId, ctx.tenantId),
          eq(schema.medicines.isActive, true),
          ilike(schema.medicines.name, `%${medicineName.trim()}%`)
        )
      )
      .limit(1);

    if (!med) {
      return { error: `Medicine matching "${medicineName}" was not found in inventory.` };
    }

    // 2. Locate active batch with stock
    const [batch] = await db
      .select({
        batchId: schema.batches.id,
        batchNo: schema.batches.batchNo,
        mrp: schema.batches.mrp,
        qtyOnHand: schema.batches.qtyOnHand,
      })
      .from(schema.batches)
      .where(
        and(
          eq(schema.batches.tenantId, ctx.tenantId),
          eq(schema.batches.storeId, ctx.storeId),
          eq(schema.batches.medicineId, med.id),
          gt(schema.batches.qtyOnHand, 0)
        )
      )
      .orderBy(schema.batches.expiryDate)
      .limit(1);

    if (!batch) {
      return { error: `No batches with available stock found for "${med.name}" in this store.` };
    }

    return {
      action: "DISPATCH_ADD_TO_BILL",
      payload: {
        medicineId: med.id,
        medicineName: med.name,
        batchId: batch.batchId,
        batchNo: batch.batchNo,
        qty: 1,
        mrp: batch.mrp,
        qtyOnHand: batch.qtyOnHand,
        gstRateBp: med.gstRateBp || 0,
      },
      message: `Triggered action to add 1 unit of ${med.name} (Batch: ${batch.batchNo}) to the bill.`,
    };
  },
};
