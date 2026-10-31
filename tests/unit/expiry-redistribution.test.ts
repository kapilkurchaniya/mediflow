import { describe, it, expect, vi } from "vitest";
import {
  calculateRedistributionForBatch,
  createRedistributionTransferDraft,
} from "@/server/domain/inventory/expiry-redistribution";
import { schema, type Tx } from "@/server/db";

describe("Expiry Redistribution Suggestions Engine (Task B3.5)", () => {
  describe("calculateRedistributionForBatch", () => {
    it("returns null if onHandSource is 0 or negative", () => {
      const res = calculateRedistributionForBatch({
        daysToExpiry: 60,
        onHandSource: 0,
        velocitySource: 0.5,
        purchaseRatePaise: 10000,
        candidateStores: [],
      });
      expect(res).toBeNull();
    });

    it("returns null if stock will naturally sell out at source store before expiry", () => {
      // 100 units on hand, 2 units/day velocity, 60 days to expiry => projected sales = 120 units.
      // Surplus = max(0, 100 - 120) = 0.
      const res = calculateRedistributionForBatch({
        daysToExpiry: 60,
        onHandSource: 100,
        velocitySource: 2.0,
        purchaseRatePaise: 15000,
        candidateStores: [
          {
            storeId: "store-2",
            storeName: "Branch 2",
            storeCode: "B2",
            onHand: 10,
            velocity: 5.0,
          },
        ],
      });
      expect(res).toBeNull();
    });

    it("identifies surplus at risk and matches with high-velocity candidate store", () => {
      // Source: 100 units on hand, 0.5 units/day velocity, 60 days to expiry.
      // Projected sales = floor(0.5 * 60) = 30 units.
      // Surplus at risk = 100 - 30 = 70 units.
      //
      // Candidate 1 (Branch B): 10 on hand, velocity 2.0/day.
      // Projected demand = floor(2.0 * 60) = 120 units.
      // Net capacity = 120 - 10 = 110 units.
      //
      // Candidate 2 (Branch C): 50 on hand, velocity 1.0/day.
      // Projected demand = floor(1.0 * 60) = 60 units.
      // Net capacity = 60 - 50 = 10 units.
      const res = calculateRedistributionForBatch({
        daysToExpiry: 60,
        onHandSource: 100,
        velocitySource: 0.5,
        purchaseRatePaise: 20000, // ₹200.00
        unitsPerPack: 10,
        candidateStores: [
          {
            storeId: "store-c",
            storeName: "Branch C",
            storeCode: "BC",
            onHand: 50,
            velocity: 1.0,
          },
          {
            storeId: "store-b",
            storeName: "Branch B",
            storeCode: "BB",
            onHand: 10,
            velocity: 2.0,
          },
        ],
      });

      expect(res).not.toBeNull();
      if (!res) return;

      expect(res.surplusAtRisk).toBe(70);
      expect(res.bestDestination?.storeId).toBe("store-b");
      expect(res.bestDestination?.netCapacity).toBe(110);
      // Transfer qty is capped at surplus (70 <= 110)
      expect(res.suggestedTransferQty).toBe(70);
      expect(res.suggestedPacks).toBe(7); // 70 / 10 = 7 packs
      expect(res.potentialLossPreventedPaise).toBe(70 * 20000); // 1,400,000 paise (₹14,000)
      expect(res.urgency).toBe("high"); // 60 days is <= 75 days
    });

    it("caps suggested transfer at destination net capacity when surplus is larger", () => {
      // Source: 100 units on hand, 0 velocity, 40 days to expiry.
      // Surplus at risk = 100 units.
      // Candidate: on hand 5, velocity 1.0/day.
      // Projected demand = 40 units. Net capacity = 40 - 5 = 35 units.
      const res = calculateRedistributionForBatch({
        daysToExpiry: 40,
        onHandSource: 100,
        velocitySource: 0,
        purchaseRatePaise: 5000,
        unitsPerPack: 10,
        candidateStores: [
          {
            storeId: "store-dest",
            storeName: "Store Dest",
            storeCode: "SD",
            onHand: 5,
            velocity: 1.0,
          },
        ],
      });

      expect(res).not.toBeNull();
      if (!res) return;

      expect(res.surplusAtRisk).toBe(100);
      expect(res.suggestedTransferQty).toBe(35);
      expect(res.suggestedPacks).toBe(4); // ceil(35 / 10) = 4 packs
      expect(res.urgency).toBe("critical"); // <= 45 days
    });

    it("ignores candidate stores with zero velocity or where onHand exceeds demand", () => {
      const res = calculateRedistributionForBatch({
        daysToExpiry: 50,
        onHandSource: 50,
        velocitySource: 0.1,
        purchaseRatePaise: 8000,
        candidateStores: [
          {
            storeId: "store-dead",
            storeName: "Dead Store",
            storeCode: "DS",
            onHand: 0,
            velocity: 0, // 0 sales velocity
          },
          {
            storeId: "store-overstocked",
            storeName: "Overstocked Store",
            storeCode: "OS",
            onHand: 100, // already has 100 on hand
            velocity: 1.0, // demand is 50, onHand is 100 -> net capacity 0
          },
        ],
      });

      expect(res).not.toBeNull();
      if (!res) return;

      expect(res.surplusAtRisk).toBe(45); // 50 - floor(0.1 * 50) = 45
      expect(res.allCandidates.length).toBe(0);
      expect(res.bestDestination).toBeNull();
      expect(res.suggestedTransferQty).toBe(0);
    });
  });

  describe("createRedistributionTransferDraft", () => {
    it("creates draft transfer with delivery challan when fromStore and toStore share GSTIN", async () => {
      const insertedTransfers: Record<string, unknown>[] = [];
      const insertedItems: Record<string, unknown>[] = [];

      const mockTx = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation(() => {
                return Promise.resolve([
                  { id: "store-a", gstin: "27AAAAA0000A1Z5" },
                ]);
              }),
            })),
          })),
        })),
        insert: vi.fn().mockImplementation((table) => ({
          values: vi.fn().mockImplementation((val) => {
            if (table === schema.docSequences) {
              return {
                onConflictDoUpdate: vi.fn().mockReturnValue({
                  returning: vi.fn().mockResolvedValue([{ nextValue: 2 }]),
                }),
              };
            }
            if (table === schema.stockTransfers) {
              insertedTransfers.push(val);
              return {
                returning: vi.fn().mockResolvedValue([{ id: "trf-101" }]),
              };
            }
            if (table === schema.stockTransferItems) {
              insertedItems.push(val);
              return Promise.resolve();
            }
            return {
              returning: vi.fn().mockResolvedValue([{ id: "item-1" }]),
            };
          }),
        })),
      } as unknown as Tx;

      const res = await createRedistributionTransferDraft(mockTx, {
        tenantId: "tenant-1",
        fromStoreId: "store-a",
        toStoreId: "store-b",
        createdBy: "user-1",
        items: [
          {
            batchId: "batch-1",
            medicineId: "med-1",
            batchNo: "B2026",
            expiryDate: "2026-12-31",
            qty: 50,
            unitCost: 10000,
            mrp: 15000,
          },
        ],
      });

      expect(res.transferId).toBe("trf-101");
      expect(insertedTransfers.length).toBe(1);
      expect(insertedTransfers[0].docKind).toBe("delivery_challan");
      expect(insertedTransfers[0].status).toBe("draft");
      expect(insertedItems.length).toBe(1);
      expect(insertedItems[0].qty).toBe(50);
    });

    it("creates draft transfer with tax_invoice when fromStore and toStore have distinct GSTINs", async () => {
      const insertedTransfers: Record<string, unknown>[] = [];
      const insertedItems: Record<string, unknown>[] = [];

      let storeCallCount = 0;
      const mockTx = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation(() => {
                storeCallCount++;
                if (storeCallCount === 1) {
                  return Promise.resolve([
                    { id: "store-mh", gstin: "27AAAAA0000A1Z5" },
                  ]);
                }
                return Promise.resolve([
                  { id: "store-ka", gstin: "29BBBBB1111B1Z6" },
                ]);
              }),
            })),
          })),
        })),
        insert: vi.fn().mockImplementation((table) => ({
          values: vi.fn().mockImplementation((val) => {
            if (table === schema.docSequences) {
              return {
                onConflictDoUpdate: vi.fn().mockReturnValue({
                  returning: vi.fn().mockResolvedValue([{ nextValue: 2 }]),
                }),
              };
            }
            if (table === schema.stockTransfers) {
              insertedTransfers.push(val);
              return {
                returning: vi.fn().mockResolvedValue([{ id: "trf-202" }]),
              };
            }
            if (table === schema.stockTransferItems) {
              insertedItems.push(val);
              return Promise.resolve();
            }
            return {
              returning: vi.fn().mockResolvedValue([{ id: "item-1" }]),
            };
          }),
        })),
      } as unknown as Tx;

      const res = await createRedistributionTransferDraft(mockTx, {
        tenantId: "tenant-1",
        fromStoreId: "store-mh",
        toStoreId: "store-ka",
        createdBy: "user-1",
        items: [
          {
            batchId: "batch-2",
            medicineId: "med-2",
            batchNo: "K2026",
            expiryDate: "2026-11-30",
            qty: 25,
            unitCost: 12000,
            mrp: 18000,
          },
        ],
      });

      expect(res.transferId).toBe("trf-202");
      expect(insertedTransfers.length).toBe(1);
      expect(insertedTransfers[0].docKind).toBe("tax_invoice");
      expect(insertedTransfers[0].status).toBe("draft");
      expect(insertedItems.length).toBe(1);
      expect(insertedItems[0].qty).toBe(25);
    });
  });
});
