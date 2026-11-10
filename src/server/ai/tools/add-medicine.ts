import { z } from "zod";
import type { AddMedicineProposalPayload, MediFlowAiTool, ToolProposal } from "../types";
import { createAiProposal } from "../actions-service";

export const addMedicineTool: MediFlowAiTool<
  {
    name: string;
    genericName?: string;
    mrp?: number;
    packSize?: string;
  },
  ToolProposal<AddMedicineProposalPayload> | { error: string }
> = {
  name: "add_medicine",
  description:
    "Propose adding a new medicine or healthcare product to the pharmacy database. Generates a proposal requiring pharmacist confirmation before insertion.",
  permission: "medicine.manage",
  isWriteAction: true,
  inputSchema: z.object({
    name: z.string().describe("The commercial or brand name of the medicine (e.g. Dolo 650)"),
    genericName: z.string().optional().describe("The generic composition / molecule (e.g. Paracetamol)"),
    mrp: z.number().optional().describe("The Maximum Retail Price (MRP) in rupees (e.g. 30.50)"),
    packSize: z.string().optional().describe("The pack size or presentation (e.g. 15 tablets, 100ml syrup)"),
  }),
  execute: async (ctx, { name, genericName, mrp, packSize }) => {
    if (!name || name.trim().length === 0) {
      return { error: "Medicine name is required." };
    }

    const mrpPaise = mrp && mrp > 0 ? Math.round(mrp * 100) : 0;
    const summary = `Add new medicine "${name.trim()}" (${genericName || "Unspecified salt"})${mrp ? ` with MRP ₹${mrp.toFixed(2)}` : ""} to catalogue`;

    const proposal = await createAiProposal<AddMedicineProposalPayload>({
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      userId: ctx.userId,
      tool: "add_medicine",
      intent: "add_medicine",
      summary,
      arguments: { name, genericName, mrp, packSize },
      payload: {
        name: name.trim(),
        genericName: genericName?.trim() || null,
        mrpPaise,
        packSize: packSize?.trim() || "1 Strip",
      },
      safetyLevel: 2,
    });

    return proposal;
  },
};
