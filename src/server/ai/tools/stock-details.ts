import { z } from "zod";
import { and, eq, gt, ilike, or } from "drizzle-orm";
import { db, schema } from "@/server/db";
import type { MediFlowAiTool } from "../types";

export const stockDetailsTool: MediFlowAiTool<{ searchTerm: string }> = {
  name: "get_stock_details",
  description:
    "Get detailed stock information for specific medicines, generic compositions, or batch numbers. Returns active batches, quantities on hand, expiry dates, and MRP. Strictly scoped to current store.",
  permission: "inventory.view",
  isWriteAction: false,
  inputSchema: z.object({
    searchTerm: z
      .string()
      .describe("The name of the medicine, generic salt, or batch number to look up stock details for."),
  }),
  execute: async (ctx, { searchTerm }) => {
    if (!ctx.storeId) {
      return { error: "Active store session required to inspect stock details." };
    }

    const term = `%${searchTerm.trim()}%`;

    // 1. Fetch matching active medicines for this tenant
    const matchingMeds = await db
      .select({
        id: schema.medicines.id,
        name: schema.medicines.name,
        genericName: schema.medicines.genericName,
        packSize: schema.medicines.packSize,
        mrp: schema.medicines.mrp,
        reorderLevel: schema.medicines.reorderLevel,
      })
      .from(schema.medicines)
      .where(
        and(
          eq(schema.medicines.tenantId, ctx.tenantId),
          eq(schema.medicines.isActive, true),
          or(
            ilike(schema.medicines.name, term),
            ilike(schema.medicines.genericName, term)
          )
        )
      )
      .orderBy(schema.medicines.name)
      .limit(5);

    if (matchingMeds.length === 0) {
      return {
        searchTerm,
        found: false,
        message: `No medicine matching "${searchTerm}" was found in this store's catalogue.`,
      };
    }

    const medicines = [];
    for (const row of matchingMeds) {
      // 2. Fetch active batches for this medicine in caller's store
      const batchRows = await db
        .select({
          id: schema.batches.id,
          batchNo: schema.batches.batchNo,
          expiryDate: schema.batches.expiryDate,
          qtyOnHand: schema.batches.qtyOnHand,
          mrp: schema.batches.mrp,
          saleRate: schema.batches.saleRate,
        })
        .from(schema.batches)
        .where(
          and(
            eq(schema.batches.tenantId, ctx.tenantId),
            eq(schema.batches.storeId, ctx.storeId),
            eq(schema.batches.medicineId, row.id),
            gt(schema.batches.qtyOnHand, 0)
          )
        )
        .orderBy(schema.batches.expiryDate);

      const batches = batchRows.map((b) => ({
        batch_no: b.batchNo,
        expiry_date: b.expiryDate,
        qty_on_hand: Number(b.qtyOnHand),
        mrp_display: `₹${(Number(b.mrp || 0) / 100).toFixed(2)}`,
        sale_rate_display: `₹${(Number(b.saleRate || b.mrp || 0) / 100).toFixed(2)}`,
      }));

      const totalStock = batches.reduce((sum, b) => sum + b.qty_on_hand, 0);
      const isLowStock = totalStock <= (Number(row.reorderLevel) || 10);

      medicines.push({
        id: row.id,
        name: row.name,
        generic_composition: row.genericName || "N/A",
        pack_size: row.packSize || "Unit",
        mrp_display: `₹${(Number(row.mrp || 0) / 100).toFixed(2)}`,
        total_stock_units: totalStock,
        stock_status: totalStock === 0 ? "OUT_OF_STOCK" : isLowStock ? "LOW_STOCK" : "IN_STOCK",
        active_batches: batches,
      });
    }

    return {
      searchTerm,
      found: true,
      count: medicines.length,
      medicines,
      protection_notice: "Protected store-scoped live stock data.",
    };
  },
};

