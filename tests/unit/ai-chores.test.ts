import { describe, it, expect } from "vitest";
import { draftPurchaseOrderTool } from "@/server/ai/tools/draft-po";
import { expiryRedistributionTool } from "@/server/ai/tools/expiry-redistribution";
import { explainGstMismatchTool } from "@/server/ai/tools/explain-gst";
import { addMedicineTool } from "@/server/ai/tools/add-medicine";
import type { AuthCtx } from "@/server/rbac";

describe("Autonomous AI Chores & Write Tools (Tasks B6.1 & B6.2)", () => {
  describe("Task B6.1: Add Medicine Tool (Two-Phase Proposal)", () => {
    it("declares write action requiring medicine.manage permission", () => {
      expect(addMedicineTool.name).toBe("add_medicine");
      expect(addMedicineTool.isWriteAction).toBe(true);
      expect(addMedicineTool.permission).toBe("medicine.manage");
    });

    it("validates required name field", async () => {
      const mockCtx = { tenantId: "t1", storeId: "s1", userId: "u1" } as unknown as AuthCtx;
      const res = await addMedicineTool.execute(mockCtx, { name: "" });
      expect("error" in res).toBe(true);
      if ("error" in res) {
        expect(res.error).toContain("required");
      }
    });
  });

  describe("Task B6.2: Draft Purchase Order Chore", () => {
    it("declares write chore requiring purchase.create permission", () => {
      expect(draftPurchaseOrderTool.name).toBe("draft_purchase_order");
      expect(draftPurchaseOrderTool.isWriteAction).toBe(true);
      expect(draftPurchaseOrderTool.permission).toBe("purchase.create");
    });

    it("validates input schema with optional supplierId and search", () => {
      const parsed = draftPurchaseOrderTool.inputSchema.safeParse({
        supplierId: "sup-123",
        search: "paracetamol",
      });
      expect(parsed.success).toBe(true);
    });
  });

  describe("Task B6.2: Expiry Redistribution Chore", () => {
    it("declares write chore requiring inventory.transfer permission", () => {
      expect(expiryRedistributionTool.name).toBe("expiry_redistribution");
      expect(expiryRedistributionTool.isWriteAction).toBe(true);
      expect(expiryRedistributionTool.permission).toBe("inventory.transfer");
    });

    it("validates input schema with default or custom days thresholds", () => {
      const parsed = expiryRedistributionTool.inputSchema.safeParse({
        minDays: 15,
        maxDays: 60,
      });
      expect(parsed.success).toBe(true);
    });
  });

  describe("Task B6.2: GSTR-2B Mismatch Explainer Chore", () => {
    it("declares read analytical chore requiring gst.view permission", () => {
      expect(explainGstMismatchTool.name).toBe("explain_gst_mismatch");
      expect(explainGstMismatchTool.isWriteAction).toBe(false);
      expect(explainGstMismatchTool.permission).toBe("gst.view");
    });

    it("validates input schema with optional invoiceNo and supplierGstin", () => {
      const parsed = explainGstMismatchTool.inputSchema.safeParse({
        invoiceNo: "INV/2026/004",
        supplierGstin: "27AABCU9603R1ZX",
      });
      expect(parsed.success).toBe(true);
    });
  });
});
