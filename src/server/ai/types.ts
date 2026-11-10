import type { z } from "zod";
import type { AuthCtx } from "@/server/rbac";
import type { Permission } from "@/lib/permissions";

export type AiProposalStatus =
  | "pending_confirmation"
  | "confirmed"
  | "cancelled"
  | "rejected"
  | "error";

export interface ToolProposal<TPayload = unknown> {
  type: "PROPOSAL";
  actionId: string;
  intent: string;
  tool: string;
  summary: string;
  payload: TPayload;
  status: AiProposalStatus;
  createdAt: string;
}

export interface MediFlowAiTool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  permission: Permission;
  inputSchema: z.ZodType<TInput>;
  isWriteAction: boolean;
  execute: (ctx: AuthCtx, input: TInput) => Promise<TOutput>;
}

export interface AddMedicineProposalPayload {
  name: string;
  genericName?: string | null;
  mrpPaise: number;
  packSize?: string | null;
}

export interface DraftPoProposalPayload {
  supplierId: string;
  supplierName: string;
  supplierPhone?: string | null;
  estimatedCostPaise: number;
  items: Array<{
    medicineId: string;
    medicineName: string;
    packUnit: string;
    unitsPerPack: number;
    suggestedPacks: number;
    suggestedQty: number;
    purchaseRatePaise: number;
    estimatedCostPaise: number;
  }>;
}

export interface ExpiryRedistributionProposalPayload {
  sourceStoreId: string;
  sourceStoreName: string;
  destinationStoreId: string;
  destinationStoreName: string;
  batchId: string;
  batchNo: string;
  medicineId: string;
  medicineName: string;
  expiryDate: string;
  daysToExpiry: number;
  transferUnits: number;
  transferPacks: number;
  potentialLossPreventedPaise: number;
}
