/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import {
  detectDistributorFormat,
  parseUnitsPerPack,
  normalizeGstRateBp,
  parseDistributorInvoice,
  quickCreateDistributorMedicines,
} from "@/server/domain/import/distributor-invoice";
import type { DbOrTx } from "@/server/db";

describe("Distributor Electronic Bill Import Engine (Task B4.6)", () => {
  const tenantId = "tenant-dist-test";

  it("accurately detects distributor format from headers", () => {
    const pharmarackHeaders = [
      "Item Name",
      "Batch No",
      "Expiry",
      "Pack",
      "Billed Qty",
      "Free Qty",
      "PTR",
      "MRP",
      "Disc %",
      "GST %",
      "HSN",
      "Barcode",
    ];
    const pDetect = detectDistributorFormat(pharmarackHeaders);
    expect(pDetect.source).toBe("pharmarack");
    expect(pDetect.confidence).toBeGreaterThan(0.8);
    expect(pDetect.mapping["Item Name"]).toBe("name");
    expect(pDetect.mapping["PTR"]).toBe("rate");

    const retailioHeaders = [
      "Item Description",
      "Batch",
      "Expiry",
      "Packing",
      "Billed Qty",
      "Free Qty",
      "Purchase Rate",
      "MRP",
      "Discount %",
      "Tax %",
      "HSN Code",
      "Barcode",
    ];
    const rDetect = detectDistributorFormat(retailioHeaders);
    expect(rDetect.source).toBe("retailio");
    expect(rDetect.confidence).toBeGreaterThan(0.7);
  });

  it("extracts units per pack from various packaging strings", () => {
    expect(parseUnitsPerPack("10'S")).toBe(10);
    expect(parseUnitsPerPack("15 TAB")).toBe(15);
    expect(parseUnitsPerPack("1x10")).toBe(10);
    expect(parseUnitsPerPack("10x15")).toBe(15);
    expect(parseUnitsPerPack("200ML")).toBe(1);
    expect(parseUnitsPerPack("")).toBe(1);
  });

  it("normalizes GST percentages to valid Indian regulatory basis points", () => {
    expect(normalizeGstRateBp(5)).toBe(500);
    expect(normalizeGstRateBp(12)).toBe(1200);
    expect(normalizeGstRateBp("18%")).toBe(1800);
    expect(normalizeGstRateBp(28)).toBe(2800);
    expect(normalizeGstRateBp(0)).toBe(0);
    expect(normalizeGstRateBp(null)).toBe(500); // default (DEFAULT_GST_RATE_BP is 500)
  });

  it("parses 40-item Pharmarack CSV in under 3 seconds with accurate landed cost calculation", async () => {
    const fixturePath = path.join(
      process.cwd(),
      "tests/fixtures/distributor/pharmarack_sample.csv"
    );
    const csvContent = fs.readFileSync(fixturePath, "utf-8");

    const startTime = Date.now();
    const result = await parseDistributorInvoice(csvContent);
    const elapsedMs = Date.now() - startTime;

    expect(elapsedMs).toBeLessThan(3000); // Benchmark: under 3 seconds
    expect(result.detectedSource).toBe("pharmarack");
    expect(result.totalLines).toBe(40);
    expect(result.validLines).toBe(40);

    // Verify first row calculations: AUGMENTIN 625 DUO TAB
    // Billed: 20, Free: 2, PTR: 168.50 (16850 paise), Disc: 5.0% (500 bp), GST: 12%
    const first = result.items[0];
    expect(first.name).toBe("AUGMENTIN 625 DUO TAB");
    expect(first.batchNo).toBe("AUG2601");
    expect(first.expiryDate).toBe("2027-12-31");
    expect(first.billedQty).toBe(20);
    expect(first.freeQty).toBe(2);
    expect(first.ptrPaise).toBe(16850);
    expect(first.mrpPaise).toBe(22350);
    expect(first.discountBp).toBe(500);
    expect(first.gstRateBp).toBe(1200);

    // Line total taxable = 20 * 16850 * 0.95 = 320150 paise
    // Effective landed cost per unit = 320150 / (20 + 2) = 14552 paise (Rs 145.52 vs PTR 168.50)
    expect(first.effectiveUnitCostPaise).toBe(14552);

    // DOLO 650MG TAB (row 6)
    // Billed: 100, Free: 10, PTR: 24.50 (2450 paise), Disc: 0%
    const dolo = result.items.find((i) => i.name.includes("DOLO"));
    expect(dolo).toBeDefined();
    expect(dolo!.billedQty).toBe(100);
    expect(dolo!.freeQty).toBe(10);
    // 100 * 2450 / 110 = 2227 paise (Rs 22.27 vs PTR 24.50)
    expect(dolo!.effectiveUnitCostPaise).toBe(2227);
  });

  it("matches catalog medicines by barcode and exact name", async () => {
    const csvData = `Item Name,Batch No,Expiry,Pack,Billed Qty,Free Qty,PTR,MRP,Disc %,GST %,HSN,Barcode
PAN 40MG TABLET,PAN402,05/27,15'S,50,5,115.00,155.00,3.5,12,300490,8901034500029
NEW MEDICINE UNKNOWN,NM001,11/27,10'S,10,0,50.00,70.00,0.0,12,300490,8909999999999`;

    const mockMedicines = [
      {
        id: "med-pan-40",
        name: "PAN 40MG TABLET",
        packSize: "15'S",
        barcode: "8901034500029",
      },
    ];

    const mockDb: any = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockMedicines),
        }),
      }),
    };

    const result = await parseDistributorInvoice(csvData, {
      db: mockDb as unknown as DbOrTx,
      tenantId,
    });

    expect(result.totalLines).toBe(2);
    expect(result.items[0].matchedMedicineId).toBe("med-pan-40");
    expect(result.items[0].matchType).toBe("exact_barcode");
    expect(result.items[0].matchConfidence).toBe(1.0);

    expect(result.items[1].matchedMedicineId).toBeNull();
    expect(result.items[1].matchType).toBe("unmatched");
    expect(result.unmatchedMedicinesCount).toBe(1);

    // Purchase items should contain only the matched item
    expect(result.purchaseItems.length).toBe(1);
    expect(result.purchaseItems[0].medicineId).toBe("med-pan-40");
    expect(result.purchaseItems[0].qty).toBe(50);
    expect(result.purchaseItems[0].freeQty).toBe(5);
  });

  it("quick-creates minimal medicines for unmatched items", async () => {
    const createdInDb: any[] = [];
    const mockDb: any = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // none exist initially
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((vals: any) => {
          const med = { id: `auto-med-${createdInDb.length + 1}`, ...vals };
          createdInDb.push(med);
          return {
            returning: vi.fn().mockResolvedValue([med]),
          };
        }),
      }),
    };

    const unmatchedItems = [
      {
        name: "CETRIZINE 10MG TAB",
        pack: "10'S",
        unitsPerPack: 10,
        hsn: "300490",
        gstRateBp: 1200 as const,
        mrpPaise: 4500,
        ptrPaise: 3000,
        barcode: "8901234567890",
      },
      {
        name: "PARACETAMOL 500MG",
        pack: "10'S",
        unitsPerPack: 10,
        hsn: "300490",
        gstRateBp: 1200 as const,
        mrpPaise: 2000,
        ptrPaise: 1200,
      },
    ];

    const createdMap = await quickCreateDistributorMedicines(
      mockDb as unknown as DbOrTx,
      tenantId,
      unmatchedItems
    );

    expect(createdMap.size).toBe(2);
    expect(createdMap.get("cetrizine 10mg tab")).toBe("auto-med-1");
    expect(createdMap.get("paracetamol 500mg")).toBe("auto-med-2");
    expect(createdInDb.length).toBe(2);
    expect(createdInDb[0].name).toBe("CETRIZINE 10MG TAB");
  });
});
