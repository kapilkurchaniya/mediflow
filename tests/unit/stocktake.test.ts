import { describe, it, expect, vi } from "vitest";
import {
  createStockAuditSession,
  recordStockAuditCounts,
  approveStockAuditSession,
  cancelStockAuditSession,
} from "@/server/domain/inventory/stocktake";
import { schema, type Tx } from "@/server/db";

describe("Physical Stocktake & Rack Audit Sessions (Task B3.7)", () => {
  describe("createStockAuditSession", () => {
    it("throws error if scope is racks and rackIds is empty", async () => {
      const mockTx = {} as unknown as Tx;
      await expect(
        createStockAuditSession(mockTx, {
          tenantId: "tenant-1",
          storeId: "store-1",
          scope: "racks",
          rackIds: [],
          userId: "user-1",
        })
      ).rejects.toThrow("At least one rack must be selected for a rack audit");
    });

    it("generates session number, header, and snapshots active batches", async () => {
      const insertedSessions: Record<string, unknown>[] = [];
      const insertedItems: Record<string, unknown>[] = [];

      const mockTx = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            innerJoin: vi.fn().mockImplementation(() => ({
              where: vi.fn().mockImplementation(() => ({
                orderBy: vi.fn().mockResolvedValue([
                  {
                    batch: {
                      id: "b-1",
                      batchNo: "B001",
                      purchaseRate: 5000,
                      qtyOnHand: 100,
                    },
                    medicine: {
                      id: "med-1",
                      name: "Paracetamol 650",
                      rackId: "rack-1",
                    },
                  },
                  {
                    batch: {
                      id: "b-2",
                      batchNo: "B002",
                      purchaseRate: 8000,
                      qtyOnHand: 50,
                    },
                    medicine: {
                      id: "med-2",
                      name: "Amoxicillin 500",
                      rackId: "rack-2",
                    },
                  },
                ]),
              })),
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
            if (table === schema.stockAuditSessions) {
              insertedSessions.push(val);
              return {
                returning: vi.fn().mockResolvedValue([
                  { id: "session-101", sessionNo: "AUD/26-27/000001", ...val },
                ]),
              };
            }
            if (table === schema.stockAuditItems) {
              insertedItems.push(val);
              return Promise.resolve();
            }
            return Promise.resolve();
          }),
        })),
      } as unknown as Tx;

      const res = await createStockAuditSession(mockTx, {
        tenantId: "tenant-1",
        storeId: "store-1",
        scope: "full_store",
        blindCount: true,
        userId: "user-1",
      });

      expect(res.sessionId).toBe("session-101");
      expect(res.totalItemsSnapshotted).toBe(2);
      expect(insertedSessions.length).toBe(1);
      expect(insertedSessions[0].blindCount).toBe(true);
      expect(insertedSessions[0].status).toBe("in_progress");
      expect(insertedItems.length).toBe(2);
      expect(insertedItems[0].status).toBe("pending");
      expect(insertedItems[0].systemQty).toBe(100);
      expect(insertedItems[0].countedQty).toBeNull();
    });
  });

  describe("recordStockAuditCounts", () => {
    it("throws error if counted quantity is negative", async () => {
      const mockTx = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockResolvedValue([
                { id: "session-1", status: "in_progress", blindCount: true },
              ]),
            })),
          })),
        })),
      } as unknown as Tx;

      await expect(
        recordStockAuditCounts(mockTx, {
          tenantId: "tenant-1",
          sessionId: "session-1",
          counts: [{ itemId: "item-1", countedQty: -5 }],
          userId: "user-1",
        })
      ).rejects.toThrow("Counted quantity cannot be negative");
    });

    it("calculates varianceQty and varianceCostPaise, and updates status to under_review", async () => {
      let updatedItemVal: Record<string, unknown> | undefined;
      let updatedSessionStatus: string | undefined;

      const mockTx = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation((table) => ({
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation(() => {
                if (table === schema.stockAuditSessions) {
                  return Promise.resolve([
                    { id: "session-1", status: "in_progress", blindCount: true },
                  ]);
                }
                if (table === schema.stockAuditItems) {
                  return Promise.resolve([
                    {
                      id: "item-1",
                      systemQty: 100, // system has 100
                      unitCostPaise: 5000, // ₹50 cost
                    },
                  ]);
                }
                return Promise.resolve([]);
              }),
            })),
          })),
        })),
        update: vi.fn().mockImplementation((table) => ({
          set: vi.fn().mockImplementation((val) => {
            if (table === schema.stockAuditItems) {
              updatedItemVal = val;
            }
            if (table === schema.stockAuditSessions) {
              updatedSessionStatus = val.status;
            }
            return {
              where: vi.fn().mockResolvedValue([]),
            };
          }),
        })),
      } as unknown as Tx;

      const res = await recordStockAuditCounts(mockTx, {
        tenantId: "tenant-1",
        sessionId: "session-1",
        counts: [{ itemId: "item-1", countedQty: 95 }], // 95 physical counted (shortage of 5)
        userId: "user-1",
      });

      expect(res.success).toBe(true);
      expect(updatedItemVal?.countedQty).toBe(95);
      expect(updatedItemVal?.varianceQty).toBe(-5);
      expect(updatedItemVal?.varianceCostPaise).toBe(-25000); // -5 * 5000 = -25000 paise (-₹250)
      expect(updatedItemVal?.status).toBe("counted");
      expect(updatedSessionStatus).toBe("under_review");
    });
  });

  describe("approveStockAuditSession", () => {
    it("adjusts batches, records stock movements, posts balanced journal voucher, and marks approved", async () => {
      let batchQtyOnHand: number | undefined;
      const insertedMovements: Record<string, unknown>[] = [];
      const insertedJvLines: Record<string, unknown>[] = [];

      const mockTx = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation((table) => ({
            where: vi.fn().mockImplementation(() => {
              if (table === schema.accounts) {
                return Promise.resolve([
                  { id: "acc-purchases", systemKey: "purchases" },
                  { id: "acc-inventory", systemKey: "inventory" },
                ]);
              }
              if (table === schema.stockAuditItems) {
                return Promise.resolve([
                  {
                    id: "item-1",
                    batchId: "batch-1",
                    medicineId: "med-1",
                    countedQty: 90, // counted 90
                    systemQty: 100, // system had 100 -> shortage of 10
                    varianceQty: -10,
                    unitCostPaise: 10000, // ₹100
                    varianceCostPaise: -100000, // -₹1,000
                    status: "counted",
                  },
                ]);
              }
              return {
                limit: vi.fn().mockImplementation(() => {
                  if (table === schema.stockAuditSessions) {
                    return Promise.resolve([
                      {
                        id: "session-1",
                        sessionNo: "AUD/26-27/000001",
                        status: "under_review",
                      },
                    ]);
                  }
                  return Promise.resolve([]);
                }),
                for: vi.fn().mockResolvedValue([
                  {
                    id: "batch-1",
                    qtyOnHand: 100,
                    status: "active",
                  },
                ]),
              };
            }),
          })),
        })),
        update: vi.fn().mockImplementation((table) => ({
          set: vi.fn().mockImplementation((val) => {
            if (table === schema.batches) {
              batchQtyOnHand = val.qtyOnHand;
            }
            return {
              where: vi.fn().mockImplementation(() => ({
                returning: vi.fn().mockResolvedValue([
                  { id: "session-1", sessionNo: "AUD/26-27/000001", status: "approved" },
                ]),
              })),
            };
          }),
        })),
        insert: vi.fn().mockImplementation((table) => ({
          values: vi.fn().mockImplementation((val) => {
            if (table === schema.accounts) {
              return {
                onConflictDoNothing: vi.fn().mockReturnValue({
                  returning: vi.fn().mockResolvedValue([{ id: "acc-1" }]),
                }),
              };
            }
            if (table === schema.docSequences) {
              return {
                onConflictDoUpdate: vi.fn().mockReturnValue({
                  returning: vi.fn().mockResolvedValue([{ nextValue: 2 }]),
                }),
              };
            }
            if (table === schema.stockMovements) {
              insertedMovements.push(val);
              return Promise.resolve();
            }
            if (table === schema.journalEntries) {
              return {
                returning: vi.fn().mockResolvedValue([{ id: "jv-1" }]),
              };
            }
            if (table === schema.journalLines) {
              insertedJvLines.push(...val);
              return Promise.resolve();
            }
            return Promise.resolve();
          }),
        })),
      } as unknown as Tx;

      const res = await approveStockAuditSession(mockTx, {
        tenantId: "tenant-1",
        storeId: "store-1",
        sessionId: "session-1",
        userId: "user-1",
      });

      expect(res.reconciledAdjustmentsCount).toBe(1);
      expect(res.totalShortagePaise).toBe(100000);
      expect(res.netFinancialImpactPaise).toBe(-100000);
      expect(batchQtyOnHand).toBe(90); // 100 - 10 = 90
      expect(insertedMovements.length).toBe(1);
      expect(insertedMovements[0].type).toBe("adjustment");
      expect(insertedMovements[0].qtyChange).toBe(-10);
      expect(insertedMovements[0].balanceAfter).toBe(90);
      // Journal Lines: Debit Purchases (Loss) 100000, Credit Inventory 100000
      expect(insertedJvLines.length).toBe(2);
      expect(insertedJvLines[0].debit).toBe(100000);
      expect(insertedJvLines[1].credit).toBe(100000);
    });
  });

  describe("cancelStockAuditSession", () => {
    it("cancels an ongoing session and updates status to cancelled", async () => {
      let updatedStatus: string | undefined;

      const mockTx = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockResolvedValue([
                { id: "session-1", status: "in_progress" },
              ]),
            })),
          })),
        })),
        update: vi.fn().mockImplementation(() => ({
          set: vi.fn().mockImplementation((val) => {
            updatedStatus = val.status;
            return {
              where: vi.fn().mockImplementation(() => ({
                returning: vi.fn().mockResolvedValue([{ id: "session-1", status: "cancelled" }]),
              })),
            };
          }),
        })),
      } as unknown as Tx;

      const res = await cancelStockAuditSession(mockTx, {
        tenantId: "tenant-1",
        storeId: "store-1",
        sessionId: "session-1",
        userId: "user-1",
      });

      expect(res.status).toBe("cancelled");
      expect(updatedStatus).toBe("cancelled");
    });
  });
});
