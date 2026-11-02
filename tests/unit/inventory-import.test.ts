import { describe, it, expect, vi, beforeEach } from "vitest";

const insertedMedicines: Record<string, unknown>[] = [];
const insertedBatches: Record<string, unknown>[] = [];
const insertedMovements: Record<string, unknown>[] = [];

// Mock db at the top level
vi.mock("@/server/db", () => ({
  db: {
    transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const txMock = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]), // No existing medicine or batch
          }),
        }),
        insert: vi.fn().mockImplementation(() => ({
          values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
            if (vals.mrp !== undefined && vals.name !== undefined) {
              // schema.medicines
              insertedMedicines.push(vals);
              return { returning: vi.fn().mockReturnValue([{ id: `med-${insertedMedicines.length}` }]) };
            }
            if (vals.batchNo !== undefined) {
              // schema.batches
              insertedBatches.push(vals);
              return { returning: vi.fn().mockReturnValue([{ id: `batch-${insertedBatches.length}` }]) };
            }
            // stockMovements
            insertedMovements.push(vals);
            return { returning: vi.fn().mockReturnValue([]) };
          }),
        })),
      };
      return cb(txMock);
    }),
  },
  schema: {
    medicines: {
      id: "id",
      tenantId: "tenantId",
      name: "name",
    },
    batches: {
      id: "id",
      storeId: "storeId",
      medicineId: "medicineId",
      batchNo: "batchNo",
      qtyOnHand: "qtyOnHand",
    },
    manufacturers: {
      id: "id",
      tenantId: "tenantId",
      name: "name",
    },
    categories: {
      id: "id",
      tenantId: "tenantId",
      name: "name",
    },
    stockMovements: {
      id: "id",
    },
  },
}));

// Mock auth module
vi.mock("@/server/auth", () => ({
  requireAuth: vi.fn().mockResolvedValue({
    session: {
      tenantId: "tenant-test-import-uuid",
      storeId: "store-test-import-uuid",
    },
    user: {
      id: "user-test-import-uuid",
    },
  }),
  getCurrentSession: vi.fn().mockResolvedValue({
    tenantId: "tenant-test-import-uuid",
    storeId: "store-test-import-uuid",
  }),
}));

// Mock stock movement domain
vi.mock("@/server/domain/stock", () => ({
  recordStockMovement: vi.fn().mockResolvedValue({ id: "movement-id" }),
}));

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { processInventoryImport, type ImportRow } from "@/app/actions/inventory-import";

describe("Smart Inventory Import (Actions & Data Sanitization)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertedMedicines.length = 0;
    insertedBatches.length = 0;
    insertedMovements.length = 0;
  });

  it("handles rows with NaN or invalid MRP / prices gracefully without crashing SQL insertion", async () => {
    // Row containing NaN for mrp and saleRate (reproducing user error: Paracetamol 650mg, NaN, NaN, 0)
    const testRows: ImportRow[] = [
      {
        medicineName: "Paracetamol 650mg",
        batchNo: "PCM-01",
        expiryDate: "2027-12-31",
        qty: 50,
        mrp: NaN,
        purchaseRate: 0,
        saleRate: NaN,
      },
    ];

    const result = await processInventoryImport(testRows);
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);

    // Verify medicine was inserted with 0 instead of NaN
    expect(insertedMedicines.length).toBe(1);
    expect(insertedMedicines[0].name).toBe("Paracetamol 650mg");
    expect(insertedMedicines[0].mrp).toBe(0);
    expect(insertedMedicines[0].salePrice).toBe(0);
    expect(insertedMedicines[0].purchasePrice).toBe(0);
    expect(Number.isNaN(insertedMedicines[0].mrp)).toBe(false);

    // Verify batch was inserted with 0 instead of NaN
    expect(insertedBatches.length).toBe(1);
    expect(insertedBatches[0].batchNo).toBe("PCM-01");
    expect(insertedBatches[0].mrp).toBe(0);
    expect(insertedBatches[0].saleRate).toBe(0);
    expect(Number.isNaN(insertedBatches[0].mrp)).toBe(false);
  });

  it("automatically estimates PTR at 80% of MRP when purchaseRate is missing or 0 to update stock valuation", async () => {
    // Paracetamol with MRP 35.00 (3500 paise) and purchaseRate: 0 (from CSV lacking PTR column)
    const testRows: ImportRow[] = [
      {
        medicineName: "Paracetamol 650mg",
        batchNo: "BT-2824",
        expiryDate: "2027-05-31",
        qty: 418,
        mrp: 3500, // ₹35.00
        purchaseRate: 0,
        saleRate: 3500,
      },
    ];

    const result = await processInventoryImport(testRows);
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);

    expect(insertedMedicines.length).toBe(1);
    // 80% of 3500 = 2800 paise (₹28.00)
    expect(insertedMedicines[0].purchasePrice).toBe(2800);

    expect(insertedBatches.length).toBe(1);
    expect(insertedBatches[0].batchNo).toBe("BT-2824");
    expect(insertedBatches[0].purchaseRate).toBe(2800);
    expect(insertedBatches[0].mrp).toBe(3500);
  });

  it("preserves explicit purchaseRate when provided in import", async () => {
    const testRows: ImportRow[] = [
      {
        medicineName: "Amoxicillin 500mg",
        batchNo: "AMX-101",
        expiryDate: "2027-06-30",
        qty: 100,
        mrp: 10000, // ₹100.00
        purchaseRate: 7000, // ₹70.00 explicit PTR
        saleRate: 10000,
      },
    ];

    const result = await processInventoryImport(testRows);
    expect(result.success).toBe(true);

    expect(insertedBatches[0].purchaseRate).toBe(7000);
  });
});
