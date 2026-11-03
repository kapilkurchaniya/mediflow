import { describe, it, expect, vi } from "vitest";
import {
  createStockAuditSession,
  recordStockAuditCounts,
  approveStockAuditSession,
  cancelStockAuditSession,
} from "@/server/domain/inventory/stocktake";
import { schema, type Tx } from "@/server/db";

describe("Physical Stocktake & Rack Audit Sessions (Task A3.6)", () => {
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

    it("generates session number and snapshots batches with store-specific racks", async () => {
      const insertedSessions: Record<string, unknown>[] = [];
      const insertedItems: Record<string, unknown>[] = [];

      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValue([
                    {
                      batch: { id: "b-1", batchNo: "B001", purchaseRate: 5000, qtyOnHand: 100 },
                      medicine: { id: "med-1", name: "Paracetamol 650", rackId: "global-rack-old" },
                      storeSetting: { rackId: "store-1-rack-A" }, // store-specific override
                    },
                    {
                      batch: { id: "b-2", batchNo: "B002", purchaseRate: 8000, qtyOnHand: 50 },
                      medicine: { id: "med-2", name: "Amoxicillin 500", rackId: "global-rack-old" },
                      storeSetting: null, // unassigned in this store
                    },
                  ]),
                }),
              }),
            }),
          }),
        }),
        insert: vi.fn().mockImplementation((table) => ({
          values: vi.fn().mockImplementation((val) => {
            if (table === schema.docSequences) {
              return { onConflictDoUpdate: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ nextValue: 2 }]) }) };
            }
            if (table === schema.stockAuditSessions) {
              insertedSessions.push(val);
              return { returning: vi.fn().mockResolvedValue([{ id: "session-101", sessionNo: "AUD/26-27/000001", ...val }]) };
            }
            if (table === schema.stockAuditItems) {
              insertedItems.push(val);
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
      expect(insertedSessions[0].status).toBe("in_progress");
      expect(insertedItems.length).toBe(2);
      // Item 1 resolves store-specific rack, NOT global rack
      expect(insertedItems[0].rackId).toBe("store-1-rack-A");
      expect(insertedItems[0].systemQty).toBe(100);
      // Item 2 has no store setting -> null rackId (Unassigned), NOT global rack
      expect(insertedItems[1].rackId).toBeNull();
    });
  });

  describe("recordStockAuditCounts", () => {
    it("throws error if counted quantity is negative", async () => {
      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: "session-1", status: "in_progress", blindCount: true }]),
            }),
          }),
        }),
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

    it("calculates variance and updates status to under_review", async () => {
      let updatedItemVal: Record<string, unknown> | undefined;
      let updatedSessionStatus: string | undefined;

      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockImplementation((table) => ({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockImplementation(() => {
                if (table === schema.stockAuditSessions) {
                  return Promise.resolve([{ id: "session-1", status: "in_progress", blindCount: true }]);
                }
                if (table === schema.stockAuditItems) {
                  return Promise.resolve([{ id: "item-1", systemQty: 100, unitCostPaise: 5000 }]);
                }
                return Promise.resolve([]);
              }),
            }),
          })),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockImplementation((val) => {
            if ("countedQty" in val) updatedItemVal = val;
            if ("status" in val && val.status === "under_review") updatedSessionStatus = val.status;
            return { where: vi.fn().mockResolvedValue([]) };
          }),
        }),
      } as unknown as Tx;

      const res = await recordStockAuditCounts(mockTx, {
        tenantId: "tenant-1",
        sessionId: "session-1",
        counts: [{ itemId: "item-1", countedQty: 95 }],
        userId: "user-1",
      });

      expect(res.success).toBe(true);
      expect(updatedItemVal?.countedQty).toBe(95);
      expect(updatedItemVal?.varianceQty).toBe(-5);
      expect(updatedItemVal?.varianceCostPaise).toBe(-25000);
      expect(updatedItemVal?.status).toBe("counted");
      expect(updatedSessionStatus).toBe("under_review");
    });
  });

  describe("approveStockAuditSession", () => {
    it("reconciles batches, posts movements, journal voucher, and audit log", async () => {
      let batchQtyOnHand: number | undefined;
      const insertedMovements: Record<string, unknown>[] = [];
      const insertedJvLines: Record<string, unknown>[] = [];
      let auditLogInserted = false;

      const mockTx = {
        select: vi.fn().mockReturnValue({
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
                    countedQty: 90,
                    systemQty: 100,
                    varianceQty: -10,
                    unitCostPaise: 10000,
                    varianceCostPaise: -100000,
                    status: "counted",
                    countedAt: new Date(),
                  },
                ]);
              }
              if (table === schema.stockMovements) {
                return Promise.resolve([]); // zero interim movements
              }
              return {
                limit: vi.fn().mockReturnValue({
                  for: vi.fn().mockImplementation(() => {
                    if (table === schema.stockAuditSessions) {
                      return Promise.resolve([{ id: "session-1", sessionNo: "AUD/26-27/000001", status: "under_review" }]);
                    }
                    return Promise.resolve([]);
                  }),
                }),
                for: vi.fn().mockResolvedValue([{ id: "batch-1", qtyOnHand: 100, status: "active" }]),
              };
            }),
          })),
        }),
        update: vi.fn().mockImplementation((table) => ({
          set: vi.fn().mockImplementation((val) => {
            if (table === schema.batches) batchQtyOnHand = val.qtyOnHand;
            return { where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "session-1", sessionNo: "AUD/26-27/000001", status: "approved" }]) }) };
          }),
        })),
        insert: vi.fn().mockImplementation((table) => ({
          values: vi.fn().mockImplementation((val) => {
            if (table === schema.accounts) {
              return { onConflictDoNothing: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "acc-1" }]) }) };
            }
            if (table === schema.docSequences) {
              return { onConflictDoUpdate: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ nextValue: 2 }]) }) };
            }
            if (table === schema.stockMovements) insertedMovements.push(val);
            if (table === schema.journalEntries) return { returning: vi.fn().mockResolvedValue([{ id: "jv-1" }]) };
            if (table === schema.journalLines) insertedJvLines.push(...val);
            if (table === schema.auditLogs) auditLogInserted = true;
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
      expect(batchQtyOnHand).toBe(90);
      expect(insertedMovements.length).toBe(1);
      expect(insertedMovements[0].type).toBe("adjustment");
      expect(insertedMovements[0].qtyChange).toBe(-10);
      expect(insertedMovements[0].balanceAfter).toBe(90);
      expect(insertedJvLines.length).toBe(2);
      expect(auditLogInserted).toBe(true);
    });
  });

  describe("cancelStockAuditSession", () => {
    it("cancels an ongoing session and updates status to cancelled", async () => {
      let updatedStatus: string | undefined;

      const mockTx = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: "session-1", status: "in_progress" }]),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockImplementation((val) => {
            updatedStatus = val.status;
            return { where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: "session-1", status: "cancelled" }]) }) };
          }),
        }),
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
