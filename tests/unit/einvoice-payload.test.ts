import { describe, expect, it, vi } from "vitest";
import {
  buildEInvoicePayload,
  mapToGstUqc,
  formatGstDate,
} from "@/server/domain/e-invoice";

describe("E-Invoice Payload Builder (NIC Schema v1.03 Compliance)", () => {
  describe("mapToGstUqc", () => {
    it("maps pharmaceutical unit variants to standard GST UQC codes", () => {
      expect(mapToGstUqc("strip")).toBe("BOX");
      expect(mapToGstUqc("tab")).toBe("BOX");
      expect(mapToGstUqc("tablet")).toBe("BOX");
      expect(mapToGstUqc("bottle")).toBe("BTL");
      expect(mapToGstUqc("vial")).toBe("VIAL");
      expect(mapToGstUqc("ampoule")).toBe("VIAL");
      expect(mapToGstUqc("tube")).toBe("TUB");
      expect(mapToGstUqc("gm")).toBe("GMS");
      expect(mapToGstUqc("pack")).toBe("PAC");
      expect(mapToGstUqc(null)).toBe("NOS");
      expect(mapToGstUqc("unknown")).toBe("NOS");
    });
  });

  describe("formatGstDate", () => {
    it("converts ISO date strings to DD/MM/YYYY for NIC API", () => {
      expect(formatGstDate("2026-11-04")).toBe("04/11/2026");
      expect(formatGstDate("2027-12-31")).toBe("31/12/2027");
      expect(formatGstDate(null)).toBeUndefined();
    });
  });

  describe("buildEInvoicePayload", () => {
    it("constructs compliant NIC JSON with pharma batch details and tax summary", async () => {
      const mockGstDoc = {
        id: "gst-doc-1",
        tenantId: "tenant-1",
        storeId: "store-1",
        docType: "invoice",
        docNo: "MED-INV-2026-0042",
        docDate: "2026-11-04",
        supplyType: "B2B",
        partyGstin: "24AAACC1206D1ZM", // Inter-state (Gujarat 24 from Maharashtra 27)
        partyName: "Apex Pharma Distributors",
        partyStateCode: "24",
        taxableAmount: 100000, // 1,000.00 Rs in paise
        cgst: 0,
        sgst: 0,
        igst: 12000, // 120.00 Rs in paise
        cess: 0,
        total: 112000, // 1,120.00 Rs in paise
        refType: "sale",
        refId: "sale-uuid-1",
        isReverseCharge: false,
      };

      const mockStore = {
        id: "store-1",
        name: "MediFlow Central Chemist",
        gstin: "27GSPTE0985F1Z5", // Maharashtra (27)
        stateCode: "27",
        address: "Shop 4, Medical Square",
        city: "Mumbai",
        pincode: "400001",
      };

      const mockTenant = {
        id: "tenant-1",
        legalName: "MediFlow Healthcare Enterprises Pvt Ltd",
      };

      const mockSaleItems = [
        {
          medicineName: "Augmentin 625 Duo Tablet",
          qty: 10,
          rate: 10000, // 100.00 Rs
          discountAmount: 0,
          taxableAmount: 100000, // 1000.00 Rs
          cgst: 0,
          sgst: 0,
          igst: 12000, // 120.00 Rs
          totalAmount: 112000,
          hsn: "30041010",
          medHsn: "30041010",
          unit: "strip",
          packUnit: "strip",
          gstRateBp: 1200,
          batchNo: "AUG-2026A",
          expiryDate: "2028-06-30",
        },
      ];

      const mockDb = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation((_table: unknown) => {
            return {
              where: vi.fn().mockImplementation(() => {
                // Return appropriate mock data based on query structure
                return Promise.resolve([mockGstDoc]);
              }),
              leftJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(mockSaleItems),
              }),
            };
          }),
        })),
      } as unknown as Parameters<typeof buildEInvoicePayload>[0];

      // Mock sequence of selects: doc -> store -> tenant -> saleItems
      let selectCount = 0;
      mockDb.select = vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => {
          selectCount++;
          if (selectCount === 1) {
            return { where: vi.fn().mockResolvedValue([mockGstDoc]) };
          }
          if (selectCount === 2) {
            return { where: vi.fn().mockResolvedValue([mockStore]) };
          }
          if (selectCount === 3) {
            return { where: vi.fn().mockResolvedValue([mockTenant]) };
          }
          return {
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(mockSaleItems),
            }),
          };
        }),
      }));

      const payload = await buildEInvoicePayload(mockDb, {
        gstDocumentId: "gst-doc-1",
        tenantId: "tenant-1",
      });

      expect(payload.version).toBe("1.1");
      expect(payload.transactionDetails.supplyType).toBe("B2B");
      expect(payload.documentDetails.documentNumber).toBe("MED-INV-2026-0042");
      expect(payload.documentDetails.documentDate).toBe("04/11/2026");

      // Seller & Buyer details
      expect(payload.sellerDetails.gstin).toBe("27GSPTE0985F1Z5");
      expect(payload.buyerDetails.gstin).toBe("24AAACC1206D1ZM");

      // Item & Pharma batch details
      expect(payload.itemList.length).toBe(1);
      const item = payload.itemList[0]!;
      expect(item.itemDescription).toBe("Augmentin 625 Duo Tablet");
      expect(item.hsnCode).toBe("30041010");
      expect(item.unit).toBe("BOX");
      expect(item.quantity).toBe(10);
      expect(item.taxableAmount).toBe(1000);
      expect(item.igstAmount).toBe(120);
      expect(item.batchDetails?.batchNo).toBe("AUG-2026A");
      expect(item.batchDetails?.expiryDate).toBe("30/06/2028");

      // Value reconciliation
      expect(payload.valueDetails.assValue).toBe(1000);
      expect(payload.valueDetails.igstValue).toBe(120);
      expect(payload.valueDetails.totalInvoiceValue).toBe(1120);
      expect(payload.valueDetails.roundOff).toBe(0);
    });
  });
});

