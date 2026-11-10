import { z } from "zod";
import { and, eq, ilike, lte, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import type { MediFlowAiTool } from "../types";

export const inventoryCheckTool: MediFlowAiTool<{ productName?: string }> = {
  name: "check_inventory",
  description:
    "Check inventory levels across the catalogue or list items that are currently low in stock. Fully protected and scoped to this store.",
  permission: "inventory.view",
  isWriteAction: false,
  inputSchema: z.object({
    productName: z
      .string()
      .optional()
      .describe("Optional product name to search for. If omitted, returns low stock items."),
  }),
  execute: async (ctx, { productName }) => {
    if (!ctx.storeId) {
      return { error: "Active store session required to check inventory." };
    }

    if (productName) {
      const term = `%${productName.trim()}%`;
      const rows = await db
        .select({
          name: schema.medicines.name,
          genericName: schema.medicines.genericName,
          mrp: schema.medicines.mrp,
          reorderLevel: schema.medicines.reorderLevel,
          totalStock: sql<number>`coalesce(sum(${schema.batches.qtyOnHand}), 0)::int`,
        })
        .from(schema.medicines)
        .leftJoin(
          schema.batches,
          and(
            eq(schema.medicines.id, schema.batches.medicineId),
            eq(schema.batches.storeId, ctx.storeId),
            eq(schema.batches.tenantId, ctx.tenantId)
          )
        )
        .where(
          and(
            eq(schema.medicines.tenantId, ctx.tenantId),
            eq(schema.medicines.isActive, true),
            ilike(schema.medicines.name, term)
          )
        )
        .groupBy(
          schema.medicines.id,
          schema.medicines.name,
          schema.medicines.genericName,
          schema.medicines.mrp,
          schema.medicines.reorderLevel
        )
        .limit(10);

      const items = rows.map((r) => ({
        name: r.name,
        generic_composition: r.genericName,
        total_stock: Number(r.totalStock || 0),
        reorder_level: Number(r.reorderLevel || 10),
        mrp_display: `₹${(Number(r.mrp || 0) / 100).toFixed(2)}`,
      }));

      return {
        results: items,
        count: items.length,
        message: items.length ? `Found ${items.length} items.` : "No items found matching the criteria.",
      };
    }

    // Low stock items: items where onHand <= reorderLevel
    const rows = await db
      .select({
        name: schema.medicines.name,
        genericName: schema.medicines.genericName,
        mrp: schema.medicines.mrp,
        reorderLevel: schema.medicines.reorderLevel,
        totalStock: sql<number>`coalesce(sum(${schema.batches.qtyOnHand}), 0)::int`,
      })
      .from(schema.medicines)
      .leftJoin(
        schema.batches,
        and(
          eq(schema.medicines.id, schema.batches.medicineId),
          eq(schema.batches.storeId, ctx.storeId),
          eq(schema.batches.tenantId, ctx.tenantId)
        )
      )
      .where(
        and(
          eq(schema.medicines.tenantId, ctx.tenantId),
          eq(schema.medicines.isActive, true)
        )
      )
      .groupBy(
        schema.medicines.id,
        schema.medicines.name,
        schema.medicines.genericName,
        schema.medicines.mrp,
        schema.medicines.reorderLevel
      )
      .having(
        lte(
          sql`coalesce(sum(${schema.batches.qtyOnHand}), 0)`,
          sql`coalesce(${schema.medicines.reorderLevel}, 10)`
        )
      )
      .orderBy(sql`coalesce(sum(${schema.batches.qtyOnHand}), 0) ASC`)
      .limit(15);

    const items = rows.map((r) => ({
      name: r.name,
      generic_composition: r.genericName,
      total_stock: Number(r.totalStock || 0),
      reorder_level: Number(r.reorderLevel || 10),
      mrp_display: `₹${(Number(r.mrp || 0) / 100).toFixed(2)}`,
    }));

    return {
      results: items,
      count: items.length,
      message: items.length
        ? `Found ${items.length} low-stock items.`
        : "No low-stock items found.",
    };
  },
};

