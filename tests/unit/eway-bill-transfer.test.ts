import { describe, expect, it, vi } from "vitest";
import { generateEWayBillForTransfer } from "@/server/domain/transfers-eway";

describe("Inter-Store Transfer E-Way Bill Integration (CGST Schedule I & Rule 138)", () => {
  it("generates an E-Way Bill for an inter-store transfer and updates transfer record", async () => {
    const mockTransfer = {
      id: "transfer-101",
      tenantId: "tenant-1",
      transferNo: "TR/26-27/000001",
      fromStoreId: "store-a",
      toStoreId: "store-b",
      status: "dispatched",
      documentDate: new Date(),
      vehicleNo: null,
      transporterId: null,
      transporterName: null,
      transportMode: "road",
    };

    const mockGstDoc = {
      id: "gst-doc-transfer-1",
      tenantId: "tenant-1",
      docNo: "TR/26-27/000001",
      docType: "delivery_challan",
      total: 7500000, // ₹75,000 (> ₹50k)
      eWayBillNo: null,
      irn: null,
      status: "active",
      storeId: "store-a",
    };

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            return {
              limit: vi.fn().mockResolvedValue([mockGstDoc]),
              // for non-limited queries
              then: (resolve: (val: unknown) => unknown) => resolve([mockTransfer]),
            };
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ ...mockGstDoc, eWayBillNo: "311999888777" }]),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([]),
      }),
    } as unknown as Parameters<typeof generateEWayBillForTransfer>[0];

    const mockProvider = {
      name: "SIMULATOR",
      generateIRN: vi.fn(),
      cancelIRN: vi.fn(),
      generateEWayBill: vi.fn().mockResolvedValue({
        ewayBillNo: "311999888777",
        ewayBillDate: new Date().toISOString(),
        validUpto: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }),
      cancelEWayBill: vi.fn(),
    };

    const result = await generateEWayBillForTransfer(mockDb, {
      tenantId: "tenant-1",
      transferId: "transfer-101",
      transportDetails: {
        distanceKm: 85,
        vehicleNo: "MH12AB1234",
        transportMode: "1",
        transporterName: "Inter-City Express",
      },
      provider: mockProvider,
    });

    expect(result.success).toBe(true);
    expect(result.ewayBillNo).toBe("311999888777");
    expect(mockProvider.generateEWayBill).toHaveBeenCalledWith(
      "DIRECT",
      expect.objectContaining({
        vehicleNo: "MH12AB1234",
        distanceKm: 85,
      })
    );
  });

  it("rejects transfer E-Way Bill generation if vehicle number is invalid", async () => {
    const mockTransfer = {
      id: "transfer-102",
      tenantId: "tenant-1",
      transferNo: "TR/26-27/000002",
      fromStoreId: "store-a",
      toStoreId: "store-b",
    };

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockTransfer]),
        }),
      }),
    } as unknown as Parameters<typeof generateEWayBillForTransfer>[0];

    await expect(
      generateEWayBillForTransfer(mockDb, {
        tenantId: "tenant-1",
        transferId: "transfer-102",
        transportDetails: {
          distanceKm: 40,
          vehicleNo: "INVALID_VEHICLE",
        },
      })
    ).rejects.toThrow(/Invalid vehicle registration format/);
  });
});

