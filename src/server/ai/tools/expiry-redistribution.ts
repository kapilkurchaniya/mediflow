import { z } from "zod";
import type { ExpiryRedistributionProposalPayload, MediFlowAiTool, ToolProposal } from "../types";
import { computeExpiryRedistribution } from "@/server/domain/inventory/expiry-redistribution";
import { createAiProposal } from "../actions-service";

export const expiryRedistributionTool: MediFlowAiTool<
  {
    minDays?: number;
    maxDays?: number;
  },
  ToolProposal<ExpiryRedistributionProposalPayload> | { status: string; message: string; error?: string }
> = {
  name: "expiry_redistribution",
  description:
    "Analyze near-expiry slow-moving batches and propose an inter-branch stock transfer to high-velocity stores to prevent inventory write-offs.",
  permission: "inventory.transfer",
  isWriteAction: true,
  inputSchema: z.object({
    minDays: z.number().optional().describe("Minimum days to expiry (default 30)"),
    maxDays: z.number().optional().describe("Maximum days to expiry (default 90)"),
  }),
  execute: async (ctx, { minDays = 30, maxDays = 90 }) => {
    if (!ctx.storeId) {
      return { status: "error", message: "Active store session required to evaluate expiry redistribution." };
    }

    const report = await computeExpiryRedistribution(ctx.tenantId, {
      sourceStoreId: ctx.storeId,
      minDays,
      maxDays,
    });

    if (report.suggestions.length === 0) {
      return {
        status: "noop",
        message: "No near-expiry surplus stock requiring inter-branch redistribution was detected.",
      };
    }

    // Pick candidate with best destination and highest loss prevention
    const actionable = report.suggestions.filter((s) => s.bestDestinationStore !== null);

    if (actionable.length === 0) {
      return {
        status: "noop",
        message: `Found ${report.totalBatchesAtRisk} near-expiry batches, but other branches currently lack sufficient sales velocity to absorb the surplus.`,
      };
    }

    const top = actionable[0];
    const destination = top.bestDestinationStore!;

    const summary = `Transfer ${top.suggestedPacks} packs of ${top.medicineName} (Batch: ${top.batchNo}, Expiry: ${top.expiryDate}) from ${top.sourceStoreName} to ${destination.storeName} (Est. loss prevented: ₹${(top.potentialLossPreventedPaise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })})`;

    const payload: ExpiryRedistributionProposalPayload = {
      sourceStoreId: top.sourceStoreId,
      sourceStoreName: top.sourceStoreName,
      destinationStoreId: destination.storeId,
      destinationStoreName: destination.storeName,
      batchId: top.batchId,
      batchNo: top.batchNo,
      medicineId: top.medicineId,
      medicineName: top.medicineName,
      expiryDate: top.expiryDate,
      daysToExpiry: top.daysToExpiry,
      transferUnits: top.suggestedTransferQty,
      transferPacks: top.suggestedPacks,
      potentialLossPreventedPaise: top.potentialLossPreventedPaise,
    };

    const proposal = await createAiProposal<ExpiryRedistributionProposalPayload>({
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      userId: ctx.userId,
      tool: "expiry_redistribution",
      intent: "expiry_redistribution",
      summary,
      arguments: { minDays, maxDays },
      payload,
      safetyLevel: 2,
    });

    return proposal;
  },
};
