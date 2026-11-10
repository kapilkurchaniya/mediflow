import { z } from "zod";
import { and, desc, eq, ilike, ne, or } from "drizzle-orm";
import { db, schema } from "@/server/db";
import type { MediFlowAiTool } from "../types";

export interface GstMismatchExplanationItem {
  invoiceNo: string;
  invoiceDate: string;
  supplierGstin: string;
  supplierName?: string | null;
  matchStatus: string;
  variancePaise: number;
  varianceRupeesDisplay: string;
  itcAvailable: boolean;
  statutoryRule: string;
  explanation: string;
  recommendedAction: string;
}

export const explainGstMismatchTool: MediFlowAiTool<{
  invoiceNo?: string;
  supplierGstin?: string;
  limit?: number;
}> = {
  name: "explain_gst_mismatch",
  description:
    "Analyze GSTR-2B reconciliation mismatches (ITC ineligibility, missing supplier filings, tax variance) and provide plain-English statutory tax explanations and IMS action recommendations.",
  permission: "gst.view",
  isWriteAction: false,
  inputSchema: z.object({
    invoiceNo: z.string().optional().describe("Optional invoice number to inspect"),
    supplierGstin: z.string().optional().describe("Optional supplier GSTIN to filter by"),
    limit: z.number().optional().describe("Maximum discrepancies to analyze (default 5)"),
  }),
  execute: async (ctx, { invoiceNo, supplierGstin, limit = 5 }) => {
    const conditions = [eq(schema.gst2bLines.tenantId, ctx.tenantId)];

    if (invoiceNo) {
      conditions.push(ilike(schema.gst2bLines.invoiceNo, `%${invoiceNo.trim()}%`));
    }
    if (supplierGstin) {
      conditions.push(ilike(schema.gst2bLines.supplierGstin, `%${supplierGstin.trim()}%`));
    } else if (!invoiceNo) {
      // Default: inspect any mismatched lines
      conditions.push(ne(schema.gst2bLines.matchStatus, "exact_match"));
    }

    const lines = await db
      .select({
        id: schema.gst2bLines.id,
        invoiceNo: schema.gst2bLines.invoiceNo,
        invoiceDate: schema.gst2bLines.invoiceDate,
        supplierGstin: schema.gst2bLines.supplierGstin,
        supplierName: schema.gst2bLines.supplierName,
        taxableAmount: schema.gst2bLines.taxableAmount,
        totalAmount: schema.gst2bLines.totalAmount,
        itcAvailability: schema.gst2bLines.itcAvailability,
        itcReason: schema.gst2bLines.itcReason,
        matchStatus: schema.gst2bLines.matchStatus,
        matchVarianceAmount: schema.gst2bLines.matchVarianceAmount,
        matchNotes: schema.gst2bLines.matchNotes,
        imsAction: schema.gst2bLines.imsAction,
      })
      .from(schema.gst2bLines)
      .where(and(...conditions))
      .orderBy(desc(schema.gst2bLines.invoiceDate))
      .limit(Math.min(Math.max(1, limit), 10));

    if (lines.length === 0) {
      return {
        status: "clean",
        message: "No GSTR-2B reconciliation discrepancies found for the specified criteria. All invoices match clean.",
      };
    }

    const explanations: GstMismatchExplanationItem[] = lines.map((l) => {
      const variancePaise = Number(l.matchVarianceAmount || 0);
      const varianceDisplay = `₹${Math.abs(variancePaise / 100).toFixed(2)}`;
      let statutoryRule = "";
      let explanation = "";
      let recommendedAction = "";

      switch (l.matchStatus) {
        case "missing_in_books":
          statutoryRule = "GSTR-2B Inward Supply vs Book Purchase Ledger";
          explanation = `Supplier ${l.supplierName || l.supplierGstin} reported invoice #${l.invoiceNo} (Total: ₹${(Number(l.totalAmount) / 100).toFixed(2)}) in their GSTR-1, but no corresponding purchase GRN was recorded in MediFlow books.`;
          recommendedAction = "Verify if goods were physically received. If received, book the purchase invoice to claim ITC. If not received, reject on GST IMS to avoid fraudulent liability.";
          break;

        case "missing_in_2b":
          statutoryRule = "CGST Act 2017 Section 16(2)(aa)";
          explanation = `Invoice #${l.invoiceNo} is booked in MediFlow purchases, but has NOT appeared in GSTR-2B because the vendor has not filed their GSTR-1 for this tax period. Under Section 16(2)(aa), ITC is strictly blocked until the supplier files.`;
          recommendedAction = "Follow up with supplier to file their GSTR-1. Do not claim ITC on GSTR-3B until auto-populated in GSTR-2B.";
          break;

        case "tolerance_match":
          statutoryRule = "Rule 36(4) / Rounding Allowance";
          explanation = `Invoice #${l.invoiceNo} matched with a minor rounding difference of ${varianceDisplay} (within the allowable ₹10 tolerance limit).`;
          recommendedAction = "Accept invoice on GST IMS. The minor rounding difference is recognized and will not trigger tax notices.";
          break;

        case "mismatch":
        default:
          statutoryRule = "CGST Act Section 37 / IMS Validation";
          explanation = `Discrepancy detected on invoice #${l.invoiceNo}. Value or tax variance of ${varianceDisplay} between supplier's GSTR-1 and MediFlow purchase entry. ${l.matchNotes || ""}`;
          recommendedAction =
            Math.abs(variancePaise) > 1000
              ? "Reject on IMS or mark Pending. Request credit note from vendor for the discrepancy amount."
              : "Review line-level tax items and verify if invoice was booked with correct HSN / GST rate.";
          break;
      }

      if (l.itcAvailability === "N") {
        statutoryRule += " / Section 17(5) Blocked Credit";
        explanation += ` Note: ITC marked as INELIGIBLE by GSTN (${l.itcReason || "Ineligible recipient/place of supply"}).`;
      }

      return {
        invoiceNo: l.invoiceNo,
        invoiceDate: l.invoiceDate,
        supplierGstin: l.supplierGstin,
        supplierName: l.supplierName,
        matchStatus: l.matchStatus,
        variancePaise,
        varianceRupeesDisplay: varianceDisplay,
        itcAvailable: l.itcAvailability === "Y",
        statutoryRule,
        explanation,
        recommendedAction,
      };
    });

    return {
      status: "discrepancies_found",
      discrepancyCount: explanations.length,
      explanations,
      summary: `Analyzed ${explanations.length} GSTR-2B reconciliation item(s). Review recommendations below before filing GSTR-3B.`,
    };
  },
};
