import { describe, expect, it } from "vitest";
import { visibleNav, visiblePaletteItems, ALL_NAV_ITEMS } from "@/app/components/nav";
import {
  canStoreUsePos,
  canStoreManageShifts,
  canStoreParkBills,
  canStoreProcessSaleReturns,
  canStoreReceivePurchases,
  canStoreDispatchTransfers,
  canStorePerformInventoryOperations,
} from "@/server/domain/stores/policies";
import { SYSTEM_ROLES } from "@/lib/permissions";

describe("Task A3.5: Warehouse Navigation & Capabilities", () => {
  const ownerPerms = new Set<string>(SYSTEM_ROLES.find((r) => r.key === "owner")!.permissions);

  describe("navigation filtering by store kind", () => {
    it("hides POS and sales routes in warehouse mode", () => {
      const warehouseHrefs = visibleNav(ownerPerms, "warehouse").flatMap((g) => g.items.map((i) => i.href));

      expect(warehouseHrefs).not.toContain("/dashboard/sales/pos");
      expect(warehouseHrefs).not.toContain("/dashboard/sales");
      expect(warehouseHrefs).not.toContain("/dashboard/sales/returns");
      expect(warehouseHrefs).not.toContain("/dashboard/sales/register");

      // Verifies warehouse-critical operations remain accessible
      expect(warehouseHrefs).toContain("/dashboard");
      expect(warehouseHrefs).toContain("/dashboard/purchases");
      expect(warehouseHrefs).toContain("/dashboard/inventory");
      expect(warehouseHrefs).toContain("/dashboard/inventory/batches");
      expect(warehouseHrefs).toContain("/dashboard/inventory/transfers");
    });

    it("displays POS and sales routes in retail mode", () => {
      const retailHrefs = visibleNav(ownerPerms, "retail").flatMap((g) => g.items.map((i) => i.href));

      expect(retailHrefs).toContain("/dashboard/sales/pos");
      expect(retailHrefs).toContain("/dashboard/sales");
      expect(retailHrefs).toContain("/dashboard/sales/returns");
      expect(retailHrefs).toContain("/dashboard/sales/register");
    });

    it("command palette filters retail-only items in warehouse mode", () => {
      const paletteHrefs = visiblePaletteItems(ownerPerms, "warehouse").map((i) => i.href);

      expect(paletteHrefs).not.toContain("/dashboard/sales/pos");
      expect(paletteHrefs).not.toContain("/dashboard/sales");
      expect(paletteHrefs).not.toContain("/dashboard/sales/returns");
      expect(paletteHrefs).not.toContain("/dashboard/sales/register");

      expect(paletteHrefs).toContain("/dashboard/inventory/transfers");
      expect(paletteHrefs).toContain("/dashboard/purchases");
    });

    it("all retailOnly items have explicit retailOnly flag", () => {
      const retailOnlyItems = ALL_NAV_ITEMS.filter((i) => i.retailOnly);
      const retailOnlyHrefs = retailOnlyItems.map((i) => i.href);

      expect(retailOnlyHrefs).toContain("/dashboard/sales/pos");
      expect(retailOnlyHrefs).toContain("/dashboard/sales");
      expect(retailOnlyHrefs).toContain("/dashboard/sales/returns");
      expect(retailOnlyHrefs).toContain("/dashboard/sales/register");
    });
  });

  describe("store capabilities policy checks", () => {
    const activeRetail = { kind: "retail" as const, isActive: true };
    const inactiveRetail = { kind: "retail" as const, isActive: false };
    const activeWarehouse = { kind: "warehouse" as const, isActive: true };
    const inactiveWarehouse = { kind: "warehouse" as const, isActive: false };

    it("canStoreUsePos: true only for active retail store", () => {
      expect(canStoreUsePos(activeRetail)).toBe(true);
      expect(canStoreUsePos(inactiveRetail)).toBe(false);
      expect(canStoreUsePos(activeWarehouse)).toBe(false);
      expect(canStoreUsePos(inactiveWarehouse)).toBe(false);
    });

    it("canStoreManageShifts: true only for active retail store", () => {
      expect(canStoreManageShifts(activeRetail)).toBe(true);
      expect(canStoreManageShifts(inactiveRetail)).toBe(false);
      expect(canStoreManageShifts(activeWarehouse)).toBe(false);
      expect(canStoreManageShifts(inactiveWarehouse)).toBe(false);
    });

    it("canStoreParkBills: true only for active retail store", () => {
      expect(canStoreParkBills(activeRetail)).toBe(true);
      expect(canStoreParkBills(inactiveRetail)).toBe(false);
      expect(canStoreParkBills(activeWarehouse)).toBe(false);
      expect(canStoreParkBills(inactiveWarehouse)).toBe(false);
    });

    it("canStoreProcessSaleReturns: true only for active retail store", () => {
      expect(canStoreProcessSaleReturns(activeRetail)).toBe(true);
      expect(canStoreProcessSaleReturns(inactiveRetail)).toBe(false);
      expect(canStoreProcessSaleReturns(activeWarehouse)).toBe(false);
      expect(canStoreProcessSaleReturns(inactiveWarehouse)).toBe(false);
    });

    it("purchases, transfers, and inventory are allowed for active warehouses and retail", () => {
      expect(canStoreReceivePurchases(activeWarehouse)).toBe(true);
      expect(canStoreReceivePurchases(activeRetail)).toBe(true);
      expect(canStoreReceivePurchases(inactiveWarehouse)).toBe(false);

      expect(canStoreDispatchTransfers(activeWarehouse)).toBe(true);
      expect(canStoreDispatchTransfers(activeRetail)).toBe(true);
      expect(canStoreDispatchTransfers(inactiveWarehouse)).toBe(false);

      expect(canStorePerformInventoryOperations(activeWarehouse)).toBe(true);
      expect(canStorePerformInventoryOperations(activeRetail)).toBe(true);
      expect(canStorePerformInventoryOperations(inactiveWarehouse)).toBe(false);
    });
  });
});
