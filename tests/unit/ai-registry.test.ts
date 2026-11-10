import { describe, it, expect } from "vitest";
import { getAvailableAiTools } from "@/server/ai/registry";
import type { AuthCtx } from "@/server/rbac";
import type { Permission } from "@/lib/permissions";

describe("MediFlow AI Tool Registry & Permission Guard", () => {
  function makeMockCtx(permissions: Permission[]): AuthCtx {
    return {
      tenantId: "tenant-1",
      storeId: "store-1",
      userId: "user-1",
      user: { id: "user-1", name: "Test Staff", email: "staff@test.com", pharmacistRegNo: "PH-12345" },
      permissions: new Set(permissions),
      allowedStoreIds: "all",
    };
  }

  it("registers all authorized tools for owner with all permissions", () => {
    const allPerms: Permission[] = [
      "inventory.view",
      "sale.view",
      "purchase.view",
      "medicine.view",
      "medicine.manage",
      "sale.create",
      "purchase.create",
      "inventory.transfer",
      "gst.view",
      "ai.use",
    ];
    const ctx = makeMockCtx(allPerms);
    const tools = getAvailableAiTools(ctx);

    expect(tools["get_stock_details"]).toBeDefined();
    expect(tools["get_sales_summary"]).toBeDefined();
    expect(tools["get_purchase_summary"]).toBeDefined();
    expect(tools["add_medicine"]).toBeDefined();
    expect(tools["draft_purchase_order"]).toBeDefined();
    expect(tools["expiry_redistribution"]).toBeDefined();
    expect(tools["explain_gst_mismatch"]).toBeDefined();
  });

  it("excludes tools when user lacks the corresponding permission", () => {
    // Cashier who lacks purchase.view, purchase.create, medicine.manage, inventory.transfer, gst.view
    const cashierPerms: Permission[] = [
      "inventory.view",
      "sale.view",
      "sale.create",
      "medicine.view",
      "ai.use",
    ];
    const ctx = makeMockCtx(cashierPerms);
    const tools = getAvailableAiTools(ctx);

    // Permitted tools
    expect(tools["get_stock_details"]).toBeDefined();
    expect(tools["get_sales_summary"]).toBeDefined();
    expect(tools["add_to_bill"]).toBeDefined();

    // Restricted tools MUST BE completely absent
    expect(tools["get_purchase_summary"]).toBeUndefined();
    expect(tools["add_medicine"]).toBeUndefined();
    expect(tools["draft_purchase_order"]).toBeUndefined();
    expect(tools["expiry_redistribution"]).toBeUndefined();
    expect(tools["explain_gst_mismatch"]).toBeUndefined();
  });
});
