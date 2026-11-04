import { describe, it, expect } from "vitest";
import { DesktopPrintService } from "@/desktop/print-service";
import type { SalePrintData } from "@/desktop/types";

describe("Desktop Print Service & SLA", () => {
  const service = new DesktopPrintService();

  const sampleSale: SalePrintData = {
    storeName: "Apollo Pharmacy Metro",
    invoiceNo: "AP01-2627-000105",
    completedAt: "2026-11-04T12:00:00.000Z",
    items: [
      {
        name: "Cetirizine 10mg",
        batchNo: "B-CET-1",
        expiryDate: "2028-01-01",
        packQty: 1,
        looseQty: 0,
        unitsPerPack: 10,
        mrpPaise: 2500,
        ratePaise: 2500,
        discountBp: 0,
        gstRateBp: 1200,
        amountPaise: 2500,
      },
    ],
    payments: [{ method: "cash", amountPaise: 2500 }],
    grossPaise: 2500,
    discountPaise: 0,
    taxablePaise: 2232,
    cgstPaise: 134,
    sgstPaise: 134,
    igstPaise: 0,
    roundOffPaise: 0,
    totalPaise: 2500,
  };

  it("prints thermal 80mm receipt in under 1 second (SLA)", async () => {
    const result = await service.printSaleReceipt(sampleSale, {
      format: "thermal-80mm",
      kickDrawer: true,
    });

    expect(result.success).toBe(true);
    expect(result.format).toBe("thermal-80mm");
    expect(result.bytesSent).toBeGreaterThan(50);
    expect(result.durationMs).toBeLessThan(1000);
  });

  it("prints 58mm compact thermal receipt", async () => {
    const result = await service.printSaleReceipt(sampleSale, {
      format: "thermal-58mm",
    });

    expect(result.success).toBe(true);
    expect(result.format).toBe("thermal-58mm");
    expect(result.bytesSent).toBeGreaterThan(50);
  });

  it("prints 80-column dot-matrix invoice with tractor feed Form Feed", async () => {
    const result = await service.printSaleReceipt(sampleSale, {
      format: "dotmatrix-80col",
    });

    expect(result.success).toBe(true);
    expect(result.format).toBe("dotmatrix-80col");
    expect(result.bytesSent).toBeGreaterThan(100);
    expect(result.durationMs).toBeLessThan(1000);
  });

  it("triggers cash drawer solenoid pulse directly", async () => {
    const kicked = await service.kickDrawer();
    expect(kicked).toBe(true);
  });

  it("executes diagnostic test print", async () => {
    const result = await service.testPrint("Test Printer", "thermal-80mm");
    expect(result.success).toBe(true);
    expect(result.printerName).toBe("Test Printer");
    expect(result.bytesSent).toBeGreaterThan(0);
  });
});
