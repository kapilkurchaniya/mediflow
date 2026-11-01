import { describe, expect, it } from "vitest";
import type { DbOrTx } from "@/server/db";
import type { AuthCtx } from "@/server/rbac";
import type { Permission } from "@/lib/permissions";
import {
  getStoreMedicineSettings,
  updateStoreMedicineSettings,
  updateStoreMedicineSettingsSchema,
} from "@/server/domain/catalog/store-settings";
import { DomainError, ForbiddenError, NotFoundError } from "@/server/errors";

function createMockQuery<T>(result: T) {
  const query = {
    from: () => query,
    leftJoin: () => query,
    where: () => query,
    limit: () => query,
    then: (resolve: (v: T) => void) => resolve(result),
  };
  return query;
}

describe("Store Medicine Settings Unit Tests (Task A3.3)", () => {
  const tenantId = "11111111-1111-4111-8111-111111111111";
  const storeAId = "22222222-2222-4222-8222-222222222222";
  const storeBId = "33333333-3333-4333-8333-333333333333";
  const inactiveStoreId = "44444444-4444-4444-8444-444444444444";
  const medicineId = "55555555-5555-4555-8555-555555555555";
  const rackAId = "66666666-6666-4666-8666-666666666666";
  const rackBId = "77777777-7777-4777-8777-777777777777";

  function createMockCtx(permissions: Permission[] = ["medicine.view", "medicine.manage"]): AuthCtx {
    return {
      userId: "user_test",
      tenantId,
      storeId: storeAId,
      user: { id: "user_test", name: "Test User", email: "test@example.com", pharmacistRegNo: null },
      permissions: new Set<Permission>(permissions),
      allowedStoreIds: [storeAId, storeBId],
    };
  }

  describe("Validation Schema", () => {
    it("accepts valid positive numbers and UUIDs", () => {
      const valid = updateStoreMedicineSettingsSchema.parse({
        reorderLevel: 25,
        maxStock: 200,
        rackId: rackAId,
        salePriceOverride: 45000,
      });
      expect(valid.reorderLevel).toBe(25);
      expect(valid.maxStock).toBe(200);
      expect(valid.salePriceOverride).toBe(45000);
    });

    it("allows null values to reset overrides to catalog defaults", () => {
      const valid = updateStoreMedicineSettingsSchema.parse({
        reorderLevel: null,
        maxStock: null,
        rackId: null,
        salePriceOverride: null,
      });
      expect(valid.reorderLevel).toBeNull();
      expect(valid.rackId).toBeNull();
    });

    it("allows zero values for thresholds and price", () => {
      const valid = updateStoreMedicineSettingsSchema.parse({
        reorderLevel: 0,
        maxStock: 0,
        salePriceOverride: 0,
      });
      expect(valid.reorderLevel).toBe(0);
      expect(valid.maxStock).toBe(0);
      expect(valid.salePriceOverride).toBe(0);
    });

    it("rejects negative numbers", () => {
      expect(() =>
        updateStoreMedicineSettingsSchema.parse({ reorderLevel: -5 }),
      ).toThrow("Reorder level must be non-negative");

      expect(() =>
        updateStoreMedicineSettingsSchema.parse({ maxStock: -1 }),
      ).toThrow("Maximum stock must be non-negative");

      expect(() =>
        updateStoreMedicineSettingsSchema.parse({ salePriceOverride: -100 }),
      ).toThrow("Selling price override must be non-negative");
    });

    it("rejects invalid rack UUID format", () => {
      expect(() =>
        updateStoreMedicineSettingsSchema.parse({ rackId: "not-a-uuid" }),
      ).toThrow("Invalid rack ID");
    });
  });

  describe("getStoreMedicineSettings (Bulk Resolution & Fallback)", () => {
    it("returns an empty Map when medicineIds list is empty", async () => {
      const mockTx = {} as DbOrTx;
      const res = await getStoreMedicineSettings(mockTx, { tenantId }, storeAId, []);
      expect(res.size).toBe(0);
    });

    it("resolves catalog defaults when no store override exists", async () => {
      const mockRows = [
        {
          medicineId,
          tenantId,
          catalogReorderLevel: 15,
          catalogMaxStock: 150,
          catalogSalePrice: 10000,
          overrideReorderLevel: null,
          overrideMaxStock: null,
          overrideRackId: null,
          overrideSalePrice: null,
          rackId: null,
          rackCode: null,
          rackName: null,
        },
      ];

      const mockTx = {
        select: () => createMockQuery(mockRows),
      } as unknown as DbOrTx;

      const res = await getStoreMedicineSettings(mockTx, { tenantId }, storeAId, [medicineId]);
      const setting = res.get(medicineId);

      expect(setting).toBeDefined();
      expect(setting?.reorderLevel).toBe(15);
      expect(setting?.maxStock).toBe(150);
      expect(setting?.salePrice).toBe(10000);
      expect(setting?.salePriceSource).toBe("catalog_default");
      expect(setting?.rackId).toBeNull();
      expect(setting?.hasStoreOverrides).toBe(false);
    });

    it("applies store overrides over catalog defaults", async () => {
      const mockRows = [
        {
          medicineId,
          tenantId,
          catalogReorderLevel: 10,
          catalogMaxStock: 100,
          catalogSalePrice: 10000,
          overrideReorderLevel: 30,
          overrideMaxStock: 300,
          overrideRackId: rackAId,
          overrideSalePrice: 12000,
          rackId: rackAId,
          rackCode: "R1-S1",
          rackName: "Shelf 1",
        },
      ];

      const mockTx = {
        select: () => createMockQuery(mockRows),
      } as unknown as DbOrTx;

      const res = await getStoreMedicineSettings(mockTx, { tenantId }, storeAId, [medicineId]);
      const setting = res.get(medicineId);

      expect(setting).toBeDefined();
      expect(setting?.reorderLevel).toBe(30);
      expect(setting?.maxStock).toBe(300);
      expect(setting?.salePrice).toBe(12000);
      expect(setting?.salePriceSource).toBe("store_override");
      expect(setting?.rackId).toBe(rackAId);
      expect(setting?.rackCode).toBe("R1-S1");
      expect(setting?.hasStoreOverrides).toBe(true);
    });

    it("correctly handles 0 as a valid override value without falling back to catalog", async () => {
      const mockRows = [
        {
          medicineId,
          tenantId,
          catalogReorderLevel: 10,
          catalogMaxStock: 100,
          catalogSalePrice: 10000,
          overrideReorderLevel: 0,
          overrideMaxStock: 0,
          overrideRackId: null,
          overrideSalePrice: 0,
          rackId: null,
          rackCode: null,
          rackName: null,
        },
      ];

      const mockTx = {
        select: () => createMockQuery(mockRows),
      } as unknown as DbOrTx;

      const res = await getStoreMedicineSettings(mockTx, { tenantId }, storeAId, [medicineId]);
      const setting = res.get(medicineId);

      expect(setting?.reorderLevel).toBe(0);
      expect(setting?.maxStock).toBe(0);
      expect(setting?.salePrice).toBe(0);
      expect(setting?.salePriceSource).toBe("store_override");
      expect(setting?.hasStoreOverrides).toBe(true);
    });
  });

  describe("updateStoreMedicineSettings (Permissions & Guardrails)", () => {
    it("throws ForbiddenError if caller lacks medicine.manage permission", async () => {
      const ctx = createMockCtx(["medicine.view"]);
      const mockTx = {} as DbOrTx;

      await expect(
        updateStoreMedicineSettings(mockTx, ctx, storeAId, medicineId, { reorderLevel: 20 }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("throws NotFoundError if store does not exist in tenant", async () => {
      const ctx = createMockCtx();
      const mockTx = {
        select: () => createMockQuery([]),
      } as unknown as DbOrTx;

      await expect(
        updateStoreMedicineSettings(mockTx, ctx, "nonexistent-store", medicineId, { reorderLevel: 20 }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("throws DomainError('STORE_INACTIVE') if target store is deactivated", async () => {
      const ctx = createMockCtx();
      const mockTx = {
        select: () => createMockQuery([{ id: inactiveStoreId, isActive: false }]),
      } as unknown as DbOrTx;

      await expect(
        updateStoreMedicineSettings(mockTx, ctx, inactiveStoreId, medicineId, { reorderLevel: 20 }),
      ).rejects.toThrow("Cannot modify settings for an inactive store.");
    });

    it("throws NotFoundError if rack belongs to another store", async () => {
      const ctx = createMockCtx();

      let queryCallCount = 0;
      const mockSelect = () => {
        queryCallCount++;
        if (queryCallCount === 1) {
          return createMockQuery([{ id: storeAId, isActive: true }]);
        }
        if (queryCallCount === 2) {
          return createMockQuery([{ id: medicineId }]);
        }
        return createMockQuery([]);
      };

      const mockTx = { select: mockSelect } as unknown as DbOrTx;

      await expect(
        updateStoreMedicineSettings(mockTx, ctx, storeAId, medicineId, { rackId: rackBId }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
