import { z } from "zod";
import type { DraftPoProposalPayload, MediFlowAiTool, ToolProposal } from "../types";
import { computeReorderSuggestions } from "@/server/domain/purchasing/reorder";
import { createAiProposal } from "../actions-service";

export const draftPurchaseOrderTool: MediFlowAiTool<
  {
    supplierId?: string;
    search?: string;
  },
  ToolProposal<DraftPoProposalPayload> | { status: string; message: string; error?: string }
> = {
  name: "draft_purchase_order",
  description:
    "Evaluate low-stock medicines against reorder points and supplier lead times, and generate an editable Purchase Order draft proposal for human confirmation.",
  permission: "purchase.create",
  isWriteAction: true,
  inputSchema: z.object({
    supplierId: z.string().optional().describe("Optional supplier UUID to restrict the purchase order to"),
    search: z.string().optional().describe("Optional medicine name search term"),
  }),
  execute: async (ctx, { supplierId, search }) => {
    if (!ctx.storeId) {
      return { status: "error", message: "Active store session required to evaluate reorders." };
    }

    // 1. Compute reorder suggestions using the domain engine
    const report = await computeReorderSuggestions(ctx.tenantId, ctx.storeId, {
      supplierId,
      search,
    });

    if (report.totalSuggestionsCount === 0 || report.suppliers.length === 0) {
      return {
        status: "noop",
        message: "All evaluated medicines are adequately stocked above their reorder thresholds. No purchase order required.",
      };
    }

    // 2. Select target supplier group (matching supplierId or highest cost group)
    const targetGroup = supplierId
      ? report.suppliers.find((s) => s.supplierId === supplierId) || report.suppliers[0]
      : report.suppliers.reduce((prev, curr) =>
          curr.totalEstimatedCostPaise > prev.totalEstimatedCostPaise ? curr : prev
        );

    if (!targetGroup || targetGroup.items.length === 0) {
      return {
        status: "noop",
        message: "No reorder items found for the specified supplier.",
      };
    }

    const targetSupplierId = targetGroup.supplierId === "unassigned" ? "" : targetGroup.supplierId;
    const summary = `Draft Purchase Order for ${targetGroup.supplierName} (${targetGroup.items.length} items, est. ₹${(targetGroup.totalEstimatedCostPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })})`;

    const payload: DraftPoProposalPayload = {
      supplierId: targetSupplierId,
      supplierName: targetGroup.supplierName,
      supplierPhone: targetGroup.phone,
      estimatedCostPaise: targetGroup.totalEstimatedCostPaise,
      items: targetGroup.items.map((it) => ({
        medicineId: it.medicineId,
        medicineName: it.medicineName,
        packUnit: it.packUnit,
        unitsPerPack: it.unitsPerPack,
        suggestedPacks: it.suggestedPacks,
        suggestedQty: it.suggestedQty,
        purchaseRatePaise: it.lastPurchaseRatePaise,
        estimatedCostPaise: it.estimatedCostPaise,
      })),
    };

    const proposal = await createAiProposal<DraftPoProposalPayload>({
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      userId: ctx.userId,
      tool: "draft_purchase_order",
      intent: "draft_purchase_order",
      summary,
      arguments: { supplierId, search },
      payload,
      safetyLevel: 2,
    });

    return proposal;
  },
};
