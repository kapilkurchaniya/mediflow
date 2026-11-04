import { describe, expect, it, vi } from "vitest";
import { cancelEInvoiceForDocument, type IRPProvider } from "@/server/domain/e-invoice";

describe("E-Invoice Statutory 24-Hour Cancellation Guard", () => {
  it("rejects cancellation if more than 24 hours have elapsed since IRN generation", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: "doc-1",
              tenantId: "tenant-1",
              irn: "6D615F193AE5429E9EA3647BB9D41435E14DE6719FE851CBFF688E04CA2159BC",
              // Generated 26 hours ago
              irnDate: new Date(Date.now() - 26 * 60 * 60 * 1000),
              status: "active",
            },
          ]),
        }),
      }),
    } as any;

    const mockProvider: IRPProvider = {
      name: "TEST",
      generateIRN: vi.fn(),
      cancelIRN: vi.fn(),
      generateEWayBill: vi.fn(),
      cancelEWayBill: vi.fn(),
    };

    await expect(
      cancelEInvoiceForDocument(mockDb, {
        gstDocumentId: "doc-1",
        tenantId: "tenant-1",
        reasonCode: "2",
        remarks: "Data entry error in quantity",
        provider: mockProvider,
      })
    ).rejects.toThrow(/Cannot cancel IRN after statutory 24-hour limit.*Credit Note/i);

    expect(mockProvider.cancelIRN).not.toHaveBeenCalled();
  });

  it("permits cancellation within the 24-hour statutory window", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: "doc-2",
              tenantId: "tenant-1",
              irn: "6D615F193AE5429E9EA3647BB9D41435E14DE6719FE851CBFF688E04CA2159BC",
              // Generated 2 hours ago
              irnDate: new Date(Date.now() - 2 * 60 * 60 * 1000),
              status: "active",
            },
          ]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "doc-2",
                status: "cancelled",
                cancelledReason: "3",
                cancelledRemarks: "Customer cancelled order",
              },
            ]),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
    } as any;

    const mockProvider: IRPProvider = {
      name: "TEST",
      generateIRN: vi.fn(),
      cancelIRN: vi.fn().mockResolvedValue({ success: true, cancelledDate: new Date().toISOString() }),
      generateEWayBill: vi.fn(),
      cancelEWayBill: vi.fn(),
    };

    const res = await cancelEInvoiceForDocument(mockDb, {
      gstDocumentId: "doc-2",
      tenantId: "tenant-1",
      reasonCode: "3",
      remarks: "Customer cancelled order",
      provider: mockProvider,
    });

    expect(res.success).toBe(true);
    expect(res.document.status).toBe("cancelled");
    expect(mockProvider.cancelIRN).toHaveBeenCalledWith(
      "6D615F193AE5429E9EA3647BB9D41435E14DE6719FE851CBFF688E04CA2159BC",
      "3",
      "Customer cancelled order"
    );
  });
});
