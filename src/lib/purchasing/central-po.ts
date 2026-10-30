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
 * Safe to run both on client and server (zero database dependencies).
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

