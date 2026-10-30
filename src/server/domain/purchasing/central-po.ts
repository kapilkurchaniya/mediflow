import { db, schema, type Tx } from "@/server/db";
import { eq, and, inArray } from "drizzle-orm";
import { DomainError, ForbiddenError } from "@/server/errors";
import { writeAudit } from "@/server/audit";
import { nextDocNumber } from "@/server/domain/sequence";
import type { AuthCtx } from "@/server/rbac";
import { z } from "zod";

export const CentralSplitPoAllocationSchema = z.object({
  storeId: z.string().uuid("Invalid store ID"),
  qty: z.number().int().min(0, "Quantity must be non-negative"),
  freeQty: z.number().int().min(0, "Free quantity cannot be negative").default(0),
});

export const CentralSplitPoItemSchema = z.object({
  medicineId: z.string().uuid("Invalid medicine ID"),
  rate: z.number().int().min(0, "Rate in paise must be non-negative"),
  allocations: z.array(CentralSplitPoAllocationSchema).min(1, "At least one branch allocation required"),
});

export const CreateCentralSplitPoSchema = z.object({
  supplierId: z.string().uuid("Invalid supplier ID"),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected date must be YYYY-MM-DD").optional(),
  notes: z.string().max(500).optional(),
  items: z.array(CentralSplitPoItemSchema).min(1, "At least one item required"),
});

export type CreateCentralSplitPoInput = z.infer<typeof CreateCentralSplitPoSchema>;

export interface CentralPoMatrixSummary {
  totalItems: number;
  totalQuantity: number;
  totalEstimatedCostPaise: number;
  branchTotals: Record<
    string,
    {
      totalQuantity: number;
      totalEstimatedCostPaise: number;
      itemCount: number;
    }
  >;
}

export interface CentralSplitPoResult {
  supplierId: string;
  supplierName: string;
  totalStores: number;
  totalItems: number;
  totalEstimatedPaise: number;
  createdOrders: {
    storeId: string;
    storeName: string;
    storeCode: string;
    poId: string;
    poNo: string;
    itemCount: number;
    estimatedTotalPaise: number;
  }[];
}

/**
 * Pure helper to compute matrix totals across medicines and branches.
 */
export function calculateCentralPoMatrix(
  items: z.infer<typeof CentralSplitPoItemSchema>[]
): CentralPoMatrixSummary {
  let totalItems = 0;
  let totalQuantity = 0;
  let totalEstimatedCostPaise = 0;
  const branchTotals: Record<
    string,
    {
      totalQuantity: number;
      totalEstimatedCostPaise: number;
      itemCount: number;
    }
  > = {};

  for (const item of items) {
    let itemHasAllocation = false;
    for (const alloc of item.allocations) {
      if (alloc.qty > 0) {
        itemHasAllocation = true;
        totalQuantity += alloc.qty;
        const lineCost = alloc.qty * item.rate;
        totalEstimatedCostPaise += lineCost;

        if (!branchTotals[alloc.storeId]) {
          branchTotals[alloc.storeId] = {
            totalQuantity: 0,
            totalEstimatedCostPaise: 0,
            itemCount: 0,
          };
        }
        branchTotals[alloc.storeId].totalQuantity += alloc.qty;
        branchTotals[alloc.storeId].totalEstimatedCostPaise += lineCost;
        branchTotals[alloc.storeId].itemCount += 1;
      }
    }
    if (itemHasAllocation) {
      totalItems += 1;
    }
  }

  return {
    totalItems,
    totalQuantity,
    totalEstimatedCostPaise,
    branchTotals,
  };
}

/**
 * Creates multi-branch child Purchase Orders from a single central purchasing split matrix.
 * Executed atomically in a transaction.
 */
export async function createMultiBranchSplitPo(
  tx: Tx,
  ctx: AuthCtx,
  rawInput: CreateCentralSplitPoInput
): Promise<CentralSplitPoResult> {
  const input = CreateCentralSplitPoSchema.parse(rawInput);

  // 1. Verify supplier
  const [supplier] = await tx
    .select({
      id: schema.suppliers.id,
      name: schema.suppliers.name,
    })
    .from(schema.suppliers)
    .where(
      and(
        eq(schema.suppliers.id, input.supplierId),
        eq(schema.suppliers.tenantId, ctx.tenantId)
      )
    )
    .limit(1);

  if (!supplier) {
    throw new DomainError(
      "SUPPLIER_NOT_FOUND",
      "Supplier does not exist or does not belong to this pharmacy"
    );
  }

  // 2. Validate all medicines belong to tenant
  const medIds = input.items.map((i) => i.medicineId);
  const foundMeds = await tx
    .select({ id: schema.medicines.id })
    .from(schema.medicines)
    .where(
      and(
        eq(schema.medicines.tenantId, ctx.tenantId),
        inArray(schema.medicines.id, medIds)
      )
    );

  if (foundMeds.length !== medIds.length) {
    throw new DomainError(
      "INVALID_MEDICINES",
      "One or more selected medicines were not found"
    );
  }

  // 3. Find unique target stores
  const targetStoreIds = new Set<string>();
  for (const item of input.items) {
    for (const alloc of item.allocations) {
      if (alloc.qty > 0) {
        targetStoreIds.add(alloc.storeId);
      }
    }
  }

  if (targetStoreIds.size === 0) {
    throw new DomainError(
      "NO_ALLOCATIONS",
      "At least one item must have quantity greater than 0 allocated to a branch"
    );
  }

  // Check store permission
  if (ctx.allowedStoreIds !== "all") {
    const allowed = new Set(ctx.allowedStoreIds);
    for (const sId of targetStoreIds) {
      if (!allowed.has(sId)) {
        throw new ForbiddenError("store.access");
      }
    }
  }

  // Fetch store details
  const stores = await tx
    .select({
      id: schema.stores.id,
      name: schema.stores.name,
      code: schema.stores.code,
    })
    .from(schema.stores)
    .where(
      and(
        eq(schema.stores.tenantId, ctx.tenantId),
        inArray(schema.stores.id, Array.from(targetStoreIds))
      )
    );

  const storeMap = new Map(stores.map((s) => [s.id, s]));

  // 4. Group allocations by storeId
  const storeItemsMap = new Map<
    string,
    { medicineId: string; qty: number; freeQty: number; rate: number }[]
  >();

  for (const item of input.items) {
    for (const alloc of item.allocations) {
      if (alloc.qty > 0) {
        const list = storeItemsMap.get(alloc.storeId) || [];
        list.push({
          medicineId: item.medicineId,
          qty: alloc.qty,
          freeQty: alloc.freeQty || 0,
          rate: item.rate,
        });
        storeItemsMap.set(alloc.storeId, list);
      }
    }
  }

  const createdOrders: CentralSplitPoResult["createdOrders"] = [];
  let grandTotalEstimatedPaise = 0;

  // 5. Create a PO per destination branch
  for (const [sId, items] of storeItemsMap.entries()) {
    const storeInfo = storeMap.get(sId);
    if (!storeInfo) continue;

    const branchTotal = items.reduce(
      (sum, it) => sum + it.qty * it.rate,
      0
    );
    grandTotalEstimatedPaise += branchTotal;

    const poNo = await nextDocNumber(
      tx,
      ctx.tenantId,
      sId,
      "purchase_order",
      "PO"
    );

    const notes = input.notes?.trim()
      ? `[Central PO Split] ${input.notes.trim()}`
      : `[Central PO Split] Ordered for branch ${storeInfo.name}`;

    const [po] = await tx
      .insert(schema.purchaseOrders)
      .values({
        tenantId: ctx.tenantId,
        storeId: sId,
        poNo,
        supplierId: input.supplierId,
        status: "draft",
        expectedDate: input.expectedDate || null,
        notes,
        estimatedTotal: branchTotal,
        createdBy: ctx.userId,
      })
      .returning({ id: schema.purchaseOrders.id });

    await tx.insert(schema.purchaseOrderItems).values(
      items.map((it) => ({
        tenantId: ctx.tenantId,
        purchaseOrderId: po.id,
        medicineId: it.medicineId,
        qty: it.qty,
        freeQty: it.freeQty,
        rate: it.rate,
        receivedQty: 0,
      }))
    );

    // Link any pending promise orders for this store
    const storeMedIds = items.map((it) => it.medicineId);
    await tx
      .update(schema.promiseOrders)
      .set({
        purchaseOrderId: po.id,
        status: "ordered",
      })
      .where(
        and(
          eq(schema.promiseOrders.tenantId, ctx.tenantId),
          eq(schema.promiseOrders.storeId, sId),
          inArray(schema.promiseOrders.medicineId, storeMedIds),
          eq(schema.promiseOrders.status, "pending")
        )
      );

    // Write audit log
    await writeAudit(tx, ctx, {
      action: "create",
      entityType: "purchase_order",
      entityId: po.id,
      newValue: {
        poNo,
        supplierId: input.supplierId,
        storeId: sId,
        storeCode: storeInfo.code,
        estimatedTotal: branchTotal,
        itemsCount: items.length,
        source: "central_split_po",
      },
      reason: `Created central split purchase order ${poNo} for branch ${storeInfo.name} (${storeInfo.code})`,
    });

    createdOrders.push({
      storeId: sId,
      storeName: storeInfo.name,
      storeCode: storeInfo.code,
      poId: po.id,
      poNo,
      itemCount: items.length,
      estimatedTotalPaise: branchTotal,
    });
  }

  return {
    supplierId: supplier.id,
    supplierName: supplier.name,
    totalStores: createdOrders.length,
    totalItems: input.items.length,
    totalEstimatedPaise: grandTotalEstimatedPaise,
    createdOrders,
  };
}

