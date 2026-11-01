/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { commitImportJob } from "@/server/domain/import/commit";
import type { DbOrTx } from "@/server/db";

describe("Import Commit Engine (Task B4.4)", () => {
  const tenantId = "tenant-test-123";
  const storeId = "store-test-456";
  const userId = "user-test-789";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("commits valid medicine rows into medicines master", async () => {
    const jobId = "job-med-1";
    const jobMock = {
      id: jobId,
      tenantId,
      entity: "medicines",
      source: "marg",
      status: "validated",
      totals: { rows: 2, valid: 2, errors: 0, created: 0, updated: 0, skipped: 0 },
    };

    const stagedRows = [
      {
        id: "row-1",
        rowNo: 1,
        status: "valid",
        targetEntityId: null,
        errors: [],
        normalized: {
          name: "PAN 40MG TABLET",
          packaging: "15's",
          unitsPerPack: 15,
          hsn: "300490",
          gstRateBp: 500,
          mrpPaise: 15500,
          saleRatePaise: 13950,
          purchaseCostPaise: 11000,
          schedule: "h",
          barcode: "8901234567890",
        },
      },
    ];

    const updatedJobRows: any[] = [];
    const insertedMedicines: any[] = [];

    const mockDb: any = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockImplementation((table: any) => ({
          where: vi.fn().mockImplementation((cond: any) => ({
            limit: vi.fn().mockImplementation(() => {
              // getImportJob query
              return [jobMock];
            }),
            orderBy: vi.fn().mockReturnValue(stagedRows),
          })),
        })),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue([]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue([]),
      }),
      transaction: vi.fn().mockImplementation(async (cb: (tx: any) => Promise<any>) => {
        const txMock: any = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue([]), // No existing match
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockImplementation((vals: any) => {
              insertedMedicines.push(vals);
              return {
                returning: vi.fn().mockReturnValue([{ id: "med-new-1" }]),
              };
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockImplementation((updates: any) => {
              updatedJobRows.push(updates);
              return {
                where: vi.fn().mockReturnValue([]),
              };
            }),
          }),
        };
        return cb(txMock);
      }),
    };

    const result = await commitImportJob(mockDb as unknown as DbOrTx, {
      tenantId,
      storeId,
      jobId,
      userId,
    });

    expect(result.status).toBe("completed");
    expect(result.totals.created).toBe(1);
    expect(insertedMedicines.length).toBe(1);
    expect(insertedMedicines[0].name).toBe("PAN 40MG TABLET");
    expect(insertedMedicines[0].mrp).toBe(15500);
    expect(updatedJobRows[0].status).toBe("committed");
    expect(updatedJobRows[0].targetId).toBe("med-new-1");
  });

  it("commits batch rows and triggers opening stock movements", async () => {
    const jobId = "job-batch-1";
    const jobMock = {
      id: jobId,
      tenantId,
      storeId,
      entity: "batches",
      source: "marg",
      status: "validated",
      totals: { rows: 1, valid: 1, errors: 0, created: 0, updated: 0, skipped: 0 },
    };

    const stagedRows = [
      {
        id: "row-b1",
        rowNo: 1,
        status: "valid",
        targetEntityId: null,
        errors: [],
        normalized: {
          medicineCodeOrName: "AZITHRAL 500",
          batchNo: "AZ500-01",
          expiryDate: "2027-10-31",
          openingQty: 50,
          closingQty: 50,
          mrpPaise: 12000,
          purchaseRatePaise: 8500,
          saleRatePaise: 10800,
        },
      },
    ];

    const insertedBatches: any[] = [];
    const insertedMovements: any[] = [];

    const mockDb: any = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue([jobMock]),
            orderBy: vi.fn().mockReturnValue(stagedRows),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue([]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue([]),
      }),
      transaction: vi.fn().mockImplementation(async (cb: (tx: any) => Promise<any>) => {
        let selectCount = 0;
        const txMock: any = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockImplementation(() => {
                selectCount++;
                return {
                  limit: vi.fn().mockImplementation(() => {
                    // First call: find medicine -> returns existing medicine
                    if (selectCount === 1) return [{ id: "med-existing-99" }];
                    // Second call: find batch -> returns empty (new batch)
                    return [];
                  }),
                  for: vi.fn().mockReturnValue([{ id: "batch-new-1", qtyOnHand: 0 }]), // For stock lock
                };
              }),
            }),
          }),
          insert: vi.fn().mockImplementation((table: any) => ({
            values: vi.fn().mockImplementation((vals: any) => {
              if (vals.batchNo) {
                insertedBatches.push(vals);
                return { returning: vi.fn().mockReturnValue([{ id: "batch-new-1" }]) };
              }
              // stockMovements
              insertedMovements.push(vals);
              return { returning: vi.fn().mockReturnValue([]) };
            }),
          })),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue([]),
            }),
          }),
        };
        return cb(txMock);
      }),
    };

    const result = await commitImportJob(mockDb as unknown as DbOrTx, {
      tenantId,
      storeId,
      jobId,
      userId,
    });

    expect(result.status).toBe("completed");
    expect(result.totals.created).toBe(1);
    expect(insertedBatches.length).toBe(1);
    expect(insertedBatches[0].batchNo).toBe("AZ500-01");
    expect(insertedBatches[0].purchaseRate).toBe(8500);

    // Verify opening stock movement was recorded
    expect(insertedMovements.length).toBe(1);
    expect(insertedMovements[0].type).toBe("opening");
    expect(insertedMovements[0].qtyChange).toBe(50);
    expect(insertedMovements[0].unitCost).toBe(8500);
  });

  it("commits customer and supplier rows", async () => {
    const jobId = "job-cust-1";
    const jobMock = {
      id: jobId,
      tenantId,
      entity: "customers",
      source: "marg",
      status: "validated",
      totals: { rows: 1, valid: 1, errors: 0, created: 0, updated: 0, skipped: 0 },
    };

    const stagedRows = [
      {
        id: "row-c1",
        rowNo: 1,
        status: "valid",
        targetEntityId: null,
        errors: [],
        normalized: {
          name: "Ramesh Sharma",
          mobile: "9876543210",
          address: "Sector 14, Gurgaon",
          creditLimitPaise: 500000,
          openingBalancePaise: 120000,
        },
      },
    ];

    const insertedCustomers: any[] = [];

    const mockDb: any = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue([jobMock]),
            orderBy: vi.fn().mockReturnValue(stagedRows),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue([]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue([]),
      }),
      transaction: vi.fn().mockImplementation(async (cb: (tx: any) => Promise<any>) => {
        const txMock: any = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue([]), // Not existing
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockImplementation((vals: any) => {
              insertedCustomers.push(vals);
              return { returning: vi.fn().mockReturnValue([{ id: "cust-new-1" }]) };
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue([]),
            }),
          }),
        };
        return cb(txMock);
      }),
    };

    const result = await commitImportJob(mockDb as unknown as DbOrTx, {
      tenantId,
      storeId,
      jobId,
      userId,
    });

    expect(result.status).toBe("completed");
    expect(result.totals.created).toBe(1);
    expect(insertedCustomers.length).toBe(1);
    expect(insertedCustomers[0].name).toBe("Ramesh Sharma");
    expect(insertedCustomers[0].phone).toBe("9876543210");
    expect(insertedCustomers[0].creditLimit).toBe(500000);
    expect(insertedCustomers[0].openingBalance).toBe(120000);
  });

  it("is idempotent: re-committing already-done job returns immediately without changes", async () => {
    const jobId = "job-done-1";
    const jobMock = {
      id: jobId,
      tenantId,
      entity: "medicines",
      source: "marg",
      status: "done",
      totals: { rows: 10, valid: 10, errors: 0, created: 10, updated: 0, skipped: 0 },
    };

    const mockDb: any = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue([jobMock]),
          }),
        }),
      }),
      update: vi.fn(),
      insert: vi.fn(),
      transaction: vi.fn(),
    };

    const result = await commitImportJob(mockDb as unknown as DbOrTx, {
      tenantId,
      storeId,
      jobId,
      userId,
    });

    expect(result.status).toBe("completed");
    expect(result.totals.created).toBe(10);
    expect(mockDb.transaction).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});
