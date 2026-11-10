import { z } from "zod";
import type { MediFlowAiTool } from "../types";

export const drugInteractionsTool: MediFlowAiTool<{ medications: string[] }> = {
  name: "check_interactions",
  description:
    "Check if there are any known pharmacological or clinical interactions between two or more medications.",
  permission: "medicine.view",
  isWriteAction: false,
  inputSchema: z.object({
    medications: z
      .array(z.string())
      .describe("List of medication names to evaluate interactions for (e.g. ['Ibuprofen', 'Aspirin'])"),
  }),
  execute: async (_ctx, { medications }) => {
    return {
      status: "success",
      evaluatedMedications: medications,
      message: `Evaluate the pharmacological interactions between ${medications.join(" and ")} based on clinical reference knowledge.`,
      disclaimer: "Clinical Decision Support: AI assessment only. Must be verified by a Registered Pharmacist.",
    };
  },
};
