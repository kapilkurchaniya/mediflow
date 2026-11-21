import type { MediFlowAiTool } from "../types";
import { stockDetailsTool } from "./stock-details";
import { inventoryCheckTool } from "./inventory-check";
import { salesSummaryTool } from "./sales-summary";
import { salesDetailsTool } from "./sales-details";
import { purchaseSummaryTool } from "./purchase-summary";
import { stockReportTool } from "./stock-report";
import { drugInteractionsTool } from "./drug-interactions";
import { addMedicineTool } from "./add-medicine";
import { addToBillTool } from "./add-to-bill";
import { draftPurchaseOrderTool } from "./draft-po";
import { expiryRedistributionTool } from "./expiry-redistribution";
import { explainGstMismatchTool } from "./explain-gst";
import { webSearchTool } from "./web-search";

export {
  stockDetailsTool,
  inventoryCheckTool,
  salesSummaryTool,
  salesDetailsTool,
  purchaseSummaryTool,
  stockReportTool,
  drugInteractionsTool,
  addMedicineTool,
  addToBillTool,
  draftPurchaseOrderTool,
  expiryRedistributionTool,
  explainGstMismatchTool,
  webSearchTool,
};

export const ALL_AI_TOOLS: MediFlowAiTool[] = [
  stockDetailsTool as MediFlowAiTool,
  inventoryCheckTool as MediFlowAiTool,
  salesSummaryTool as MediFlowAiTool,
  salesDetailsTool as MediFlowAiTool,
  purchaseSummaryTool as MediFlowAiTool,
  stockReportTool as MediFlowAiTool,
  drugInteractionsTool as MediFlowAiTool,
  addMedicineTool as MediFlowAiTool,
  addToBillTool as MediFlowAiTool,
  draftPurchaseOrderTool as MediFlowAiTool,
  expiryRedistributionTool as MediFlowAiTool,
  explainGstMismatchTool as MediFlowAiTool,
  webSearchTool as MediFlowAiTool,
];

