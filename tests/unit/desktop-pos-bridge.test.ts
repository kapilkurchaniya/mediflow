import { describe, it, expect, vi } from "vitest";
import { mapOfflineSaleToPrintData } from "@/desktop/offline-print-mapper";
import type { OfflinePendingSale } from "@/offline/types";

// Mock Dexie database
vi.mock("@/offline/db", () => ({
  getPosDB: vi.fn(() => ({
    medicines: {
      get: vi.fn(async (id: string) => {
        if (id === "med-1") return { id: "med-1", name: "Dolo 650mg Tablet" };
        return undefined;
      }),
    },
    batches: {
      get: vi.fn(async (id: string) => {
        if (id === "batch-1") {
          return {
            id: "batch-1",
            batchNumber: "B1234",
            expiryDate: "2027-11-30",
            mrpPaise: 3000,
            saleRatePaise: 3000,
          };
        }
        return undefined;
      }),
    },
  })),
}));

describe("Desktop POS Bridge & Mapper", () => {
  it("maps offline pending sale into structured SalePrintData with enriched db info", async () => {
    const mockBill: OfflinePendingSale = {
      clientSaleId: "cs-101",
      storeId: "store-1",
      deviceId: "dev-1",
      invoiceNo: "INV-001",
      fiscalYear: "2026-2027",
      sequenceNumber: 1,
      createdAt: "2026-11-04T12:00:00Z",
      updatedAt: "2026-11-04T12:00:00Z",
      nextRetryAt: "2026-11-04T12:00:00Z",
      status: "pending",
      retryCount: 0,
      payload: {
        clientSaleId: "cs-101",
        invoiceNo: "INV-001",
        fiscalYear: "2026-2027",
        sequenceNumber: 1,
        createdBy: "cashier-1",
        completedAt: "2026-11-04T12:00:00Z",
        lines: [
          {
            medicineId: "med-1",
            batchId: "batch-1",
            qty: 2,
            discountBp: 1000,
          },
        ],
        payments: [
          { method: "cash", amount: 5400 },
        ],
        billDiscountPaise: 0,
        compliance: {
          doctorName: "Dr. A. Sharma",
          doctorRegNo: "MCI-9988",
        },
      },
    };

    const printData = await mapOfflineSaleToPrintData(mockBill, "Apollo Pharmacy", "AP01");

    expect(printData.storeName).toBe("Apollo Pharmacy");
    expect(printData.invoiceNo).toBe("INV-001");
    expect(printData.doctorName).toBe("Dr. A. Sharma");
    expect(printData.items.length).toBe(1);
    expect(printData.items[0].name).toBe("Dolo 650mg Tablet");
    expect(printData.items[0].batchNo).toBe("B1234");
    expect(printData.items[0].discountBp).toBe(1000);
    expect(printData.payments.length).toBe(1);
    expect(printData.payments[0].method).toBe("cash");
    expect(printData.payments[0].amountPaise).toBe(5400);
    expect(printData.cgstPaise).toBeGreaterThan(0);
    expect(printData.sgstPaise).toBeGreaterThan(0);
  });

  it("gracefully falls back when database lookups are unavailable", async () => {
    const mockBill: OfflinePendingSale = {
      clientSaleId: "cs-102",
      storeId: "store-1",
      deviceId: "dev-1",
      invoiceNo: "INV-002",
      fiscalYear: "2026-2027",
      sequenceNumber: 2,
      createdAt: "2026-11-04T12:30:00Z",
      updatedAt: "2026-11-04T12:30:00Z",
      nextRetryAt: "2026-11-04T12:30:00Z",
      status: "pending",
      retryCount: 0,
      payload: {
        clientSaleId: "cs-102",
        invoiceNo: "INV-002",
        fiscalYear: "2026-2027",
        sequenceNumber: 2,
        createdBy: "cashier-1",
        completedAt: "2026-11-04T12:30:00Z",
        lines: [
          {
            medicineId: "unknown-med-uuid",
            batchId: "unknown-batch-uuid",
            qty: 1,
          },
        ],
        payments: [
          { method: "upi", amount: 1000 },
        ],
      },
    };

    const printData = await mapOfflineSaleToPrintData(mockBill, "Store", "01");
    expect(printData.invoiceNo).toBe("INV-002");
    expect(printData.items[0].name).toContain("Med #unknown-");
    expect(printData.items[0].batchNo).toBe("unknown-");
    expect(printData.totalPaise).toBe(1000);
  });
});
