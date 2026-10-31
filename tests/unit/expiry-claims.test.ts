import { describe, it, expect, vi } from "vitest";
import {
  quarantineBatch,
  createSupplierExpiryClaim,
  settleSupplierExpiryClaim,
} from "@/server/domain/inventory/expiry-claims";
import { schema, type Tx } from "@/server/db";

describe("Expiry Claim & Quarantine Dump Stock Lifecycle (Task B3.6)", () => {
  describe("quarantineBatch", () => {
    it("throws error if quarantine quantity is zero or negative", async () => {
      const mockTx = {} as unknown as Tx;
      await expect(
        quarantineBatch(mockTx, {
          tenantId: "tenant-1",
          storeId: "store-1",
          batchId: "batch-1",
          qty: 0,
          userId: "user-1",
        })
      ).rejects.toThrow("Quarantine quantity must be greater than zero");
    });

    it("throws error if batch is not found or has insufficient quantity", async () => {
      const mockTx = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => ({
              for: vi.fn().mockResolvedValue([
                {
                  id: "batch-1",
                  medicineId: "med-1",
                  batchNo: "B001",
                  expiryDate: "2026-10-01",
                  purchaseRate: 1000,
                  mrp: 1500,
                  supplierId: "sup-1",
                  qtyOnHand: 10,
                  status: "active",
                },
              ]),
            })),
          })),
        })),
      } as unknown as Tx;

      await expect(
        quarantineBatch(mockTx, {
          tenantId: "tenant-1",
          storeId: "store-1",
          batchId: "batch-1",
          qty: 25, // Requesting 25 when only 10 available
          userId: "user-1",
        })
      ).rejects.toThrow("Cannot quarantine 25 units. Only 10 units available on hand.");
    });

    it("deducts batch stock, records stock movement, and creates quarantined batch", async () => {
      let updatedBatchQty: number | undefined;
      let updatedBatchStatus: string | undefined;
      const insertedMovements: Record<string, unknown>[] = [];
      const insertedQuarantine: Record<string, unknown>[] = [];

      const mockTx = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => ({
              for: vi.fn().mockResolvedValue([
                {
                  id: "batch-1",
                  medicineId: "med-1",
                  batchNo: "B001",
                  expiryDate: "2026-10-01",
                  purchaseRate: 5000,
                  mrp: 8000,
                  supplierId: "sup-1",
                  qtyOnHand: 20,
                  status: "active",
                },
              ]),
            })),
          })),
        })),
        update: vi.fn().mockImplementation(() => ({
          set: vi.fn().mockImplementation((val) => {
            updatedBatchQty = val.qtyOnHand;
            updatedBatchStatus = val.status;
            return {
              where: vi.fn().mockResolvedValue([]),
            };
          }),
        })),
        insert: vi.fn().mockImplementation((table) => ({
          values: vi.fn().mockImplementation((val) => {
            if (table === schema.stockMovements) {
              insertedMovements.push(val);
              return Promise.resolve();
            }
            if (table === schema.quarantineBatches) {
              insertedQuarantine.push(val);
              return {
                returning: vi.fn().mockResolvedValue([{ id: "quarantine-1", ...val }]),
              };
            }
            return Promise.resolve();
          }),
        })),
      } as unknown as Tx;

      const res = await quarantineBatch(mockTx, {
        tenantId: "tenant-1",
        storeId: "store-1",
        batchId: "batch-1",
        qty: 20, // 20 units -> balance 0 -> status hold
        reason: "expired",
        userId: "user-1",
      });

      expect(res.id).toBe("quarantine-1");
      expect(updatedBatchQty).toBe(0);
      expect(updatedBatchStatus).toBe("hold"); // becomes hold when 0
      expect(insertedMovements.length).toBe(1);
      expect(insertedMovements[0].type).toBe("expired");
      expect(insertedMovements[0].qtyChange).toBe(-20);
      expect(insertedMovements[0].balanceAfter).toBe(0);
      expect(insertedQuarantine.length).toBe(1);
      expect(insertedQuarantine[0].qty).toBe(20);
      expect(insertedQuarantine[0].status).toBe("quarantined");
    });
  });

  describe("createSupplierExpiryClaim", () => {
    it("groups quarantined items, creates claim, items, updates status, and posts accounting", async () => {
      const insertedClaims: Record<string, unknown>[] = [];
      const insertedClaimItems: Record<string, unknown>[] = [];
      const updatedQuarantine: Record<string, unknown>[] = [];

      const mockTx = {
        select: vi.fn().mockImplementation((fields) => ({
          from: vi.fn().mockImplementation((table) => ({
            where: vi.fn().mockImplementation(() => {
              if (table === schema.accounts) {
                return Promise.resolve([
                  { id: "acc-creditors", systemKey: "creditors" },
                  { id: "acc-purchases", systemKey: "purchases" },
                ]);
              }
              return Promise.resolve([]);
            }),
            innerJoin: vi.fn().mockImplementation(() => ({
              innerJoin: vi.fn().mockImplementation(() => ({
                where: vi.fn().mockResolvedValue([
                  {
                    quarantine: {
                      id: "q-1",
                      supplierId: "sup-cipla",
                      qty: 10,
                      status: "quarantined",
                    },
                    batch: {
                      id: "b-1",
                      batchNo: "CP01",
                      purchaseRate: 10000, // ₹100
                    },
                    medicine: {
                      id: "med-1",
                      name: "Paracetamol 650",
                    },
                  },
                  {
                    quarantine: {
                      id: "q-2",
                      supplierId: "sup-cipla",
                      qty: 5,
                      status: "quarantined",
                    },
                    batch: {
                      id: "b-2",
                      batchNo: "CP02",
                      purchaseRate: 20000, // ₹200
                    },
                    medicine: {
                      id: "med-2",
                      name: "Azithromycin 500",
                    },
                  },
                ]),
              })),
            })),
          })),
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
            if (table === schema.expiryClaims) {
              insertedClaims.push(val);
              return {
                returning: vi.fn().mockResolvedValue([
                  { id: "claim-101", claimNo: "DN-EXP/26-27/000001", ...val },
                ]),
              };
            }
            if (table === schema.expiryClaimItems) {
              insertedClaimItems.push(val);
              return Promise.resolve();
            }
            if (table === schema.journalEntries) {
              return {
                returning: vi.fn().mockResolvedValue([{ id: "jv-101" }]),
              };
            }
            if (table === schema.journalLines) {
              return Promise.resolve();
            }
            return {
              returning: vi.fn().mockResolvedValue([{ id: "inserted-id" }]),
            };
          }),
        })),
        update: vi.fn().mockImplementation(() => ({
          set: vi.fn().mockImplementation((val) => {
            updatedQuarantine.push(val);
            return {
              where: vi.fn().mockResolvedValue([]),
            };
          }),
        })),
      } as unknown as Tx;

      const res = await createSupplierExpiryClaim(mockTx, {
        tenantId: "tenant-1",
        storeId: "store-1",
        supplierId: "sup-cipla",
        quarantineIds: ["q-1", "q-2"],
        userId: "user-1",
      });

      expect(res.claimId).toBe("claim-101");
      expect(res.itemCount).toBe(2);
      // Total value: 10 * 10000 + 5 * 20000 = 100,000 + 100,000 = 200,000 paise (₹2,000)
      expect(res.totalPaise).toBe(200000);
      expect(insertedClaims.length).toBe(1);
      expect(insertedClaims[0].status).toBe("submitted");
      expect(insertedClaimItems.length).toBe(2);
      expect(updatedQuarantine.length).toBe(1);
      expect(updatedQuarantine[0].status).toBe("claimed");
    });
  });

  describe("settleSupplierExpiryClaim", () => {
    it("settles claim with supplier credit note", async () => {
      let updatedClaimData: Record<string, unknown> | undefined;

      const mockTx = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockResolvedValue([
                {
                  id: "claim-1",
                  claimNo: "DN-EXP/26-27/000001",
                  status: "submitted",
                  supplierId: "sup-1",
                  totalPaise: 50000,
                },
              ]),
            })),
          })),
        })),
        update: vi.fn().mockImplementation((table) => ({
          set: vi.fn().mockImplementation((val) => {
            if (table === schema.expiryClaims) {
              updatedClaimData = val;
              return {
                where: vi.fn().mockImplementation(() => ({
                  returning: vi.fn().mockResolvedValue([{ id: "claim-1", ...val }]),
                })),
              };
            }
            return {
              where: vi.fn().mockResolvedValue([]),
            };
          }),
        })),
      } as unknown as Tx;

      const res = await settleSupplierExpiryClaim(mockTx, {
        tenantId: "tenant-1",
        storeId: "store-1",
        claimId: "claim-1",
        settlementType: "credit_note",
        supplierCreditNoteNo: "CN-CIPLA-889",
        userId: "user-1",
      });

      expect(res.status).toBe("settled");
      expect(updatedClaimData?.status).toBe("settled");
      expect(updatedClaimData?.settlementType).toBe("credit_note");
      expect(updatedClaimData?.supplierCreditNoteNo).toBe("CN-CIPLA-889");
    });
  });
});
