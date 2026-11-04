import { describe, expect, it, vi } from "vitest";
import { cancelEWayBillForDocument } from "@/server/domain/e-invoice";

describe("E-Way Bill 24-Hour Statutory Cancellation Window (CGST Rule 138(9))", () => {
  it("allows cancellation within the statutory 24-hour window", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const mockDoc = {
      id: "gst-doc-1",
      tenantId: "tenant-1",
      storeId: "store-1",
      eWayBillNo: "311123456789",
      eWayBillDate: twoHoursAgo,
      status: "active",
      refType: "sale",
      refId: "sale-1",
    };

    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockDoc]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ ...mockDoc, status: "cancelled" }]),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([]),
      }),
    } as unknown as Parameters<typeof cancelEWayBillForDocument>[0];

    const mockProvider = {
      name: "SIMULATOR",
      generateIRN: vi.fn(),
      cancelIRN: vi.fn(),
      generateEWayBill: vi.fn(),
      cancelEWayBill: vi.fn().mockResolvedValue({ success: true }),
    };

    const result = await cancelEWayBillForDocument(mockDb, {
      gstDocumentId: "gst-doc-1",
      tenantId: "tenant-1",
      reasonCode: "2",
      remarks: "Order cancelled by customer",
      provider: mockProvider,
    });

    expect(result.success).toBe(true);
    expect(mockProvider.cancelEWayBill).toHaveBeenCalledWith(
      "311123456789",
      expect.stringContaining("Order cancelled by customer")
    );
  });

  it("strictly rejects cancellation attempted after 24 hours per Rule 138(9)", async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);

    const mockDoc = {
      id: "gst-doc-2",
      tenantId: "tenant-1",
      storeId: "store-1",
      eWayBillNo: "311987654321",
      eWayBillDate: twentyFiveHoursAgo,
      status: "active",
    };

    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([mockDoc]),
    } as unknown as Parameters<typeof cancelEWayBillForDocument>[0];

    await expect(
      cancelEWayBillForDocument(mockDb, {
        gstDocumentId: "gst-doc-2",
        tenantId: "tenant-1",
        reasonCode: "1",
        remarks: "Duplicate bill",
      })
    ).rejects.toThrow(/statutory 24-hour limit/);
  });

  it("rejects cancellation if the document has no E-Way Bill", async () => {
    const mockDoc = {
      id: "gst-doc-3",
      tenantId: "tenant-1",
      eWayBillNo: null,
      status: "active",
    };

    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([mockDoc]),
    } as unknown as Parameters<typeof cancelEWayBillForDocument>[0];

    await expect(
      cancelEWayBillForDocument(mockDb, {
        gstDocumentId: "gst-doc-3",
        tenantId: "tenant-1",
        reasonCode: "4",
      })
    ).rejects.toThrow(/has no E-Way Bill to cancel/);
  });
});
