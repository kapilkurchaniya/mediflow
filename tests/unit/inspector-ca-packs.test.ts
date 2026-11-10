import { describe, it, expect } from "vitest";
import {
  formatScheduleH1Csv,
  type StatutoryRegisterRow,
} from "@/server/domain/compliance/inspector-pack";
import {
  formatSalesRegisterCsv,
  formatPurchaseRegisterCsv,
  type CaSalesRegisterRow,
  type CaPurchaseRegisterRow,
} from "@/server/domain/reports/ca-pack";
import { buildGstr1JsonPayload, type Gstr1Summary } from "@/server/domain/gst";

describe("Drug Inspector & CA Audit Packs Domain Tests (Task B6.4)", () => {
  describe("Drug Inspector Pack & Schedule H1 CSV", () => {
    const mockH1Rows: StatutoryRegisterRow[] = [
      {
        id: "log-1",
        dispensedAt: "2026-11-10 14:30:00",
        patientName: "Rajesh Sharma",
        patientAddress: "Flat 402, Shivam Apts, Pune",
        doctorName: "Dr. A. K. Verma",
        doctorRegNo: "MCI-48201",
        doctorAddress: "Lifeline Clinic, Pune",
        medicineName: "Augmentin 625 Duo Tablet",
        batchNo: "AG62-9901",
        expiryDate: "2027-10-31",
        quantityDispensed: 10,
        pharmacistName: "Sanjay Patil",
        pharmacistRegNo: "MSPC-88412",
        prescriptionRef: "RX-2026-001",
        schedule: "H1",
      },
    ];

    it("generates a valid D&C Rules 1945 Rule 65(9)(b) compliant CSV with BOM", () => {
      const csv = formatScheduleH1Csv(mockH1Rows);

      expect(csv.startsWith("\uFEFF")).toBe(true);
      expect(csv).toContain("Date & Time");
      expect(csv).toContain("Patient Name");
      expect(csv).toContain("Doctor Reg No");
      expect(csv).toContain("Dispensing Pharmacist");
      expect(csv).toContain("Rajesh Sharma");
      expect(csv).toContain("MCI-48201");
      expect(csv).toContain("Augmentin 625 Duo Tablet");
      expect(csv).toContain("AG62-9901");
    });

    it("escapes special characters and quotes properly in CSV", () => {
      const complexRow: StatutoryRegisterRow = {
        ...mockH1Rows[0],
        patientName: 'John "The Patient" Doe',
        doctorAddress: "Suite 1, Building A, Pune",
      };

      const csv = formatScheduleH1Csv([complexRow]);
      expect(csv).toContain('"John ""The Patient"" Doe"');
      expect(csv).toContain('"Suite 1, Building A, Pune"');
    });
  });

  describe("CA Month-End Pack CSV Generators", () => {
    it("formats Sales Register CSV with correct columns and rupee formatting", () => {
      const sales: CaSalesRegisterRow[] = [
        {
          invoiceNumber: "INV-2026-001",
          invoiceDate: "2026-11-05",
          customerName: "Apollo Clinic",
          customerGstin: "27AABCA1234A1Z5",
          saleType: "B2B",
          taxableAmountPaise: 100000, // ₹1000.00
          cgstPaise: 2500, // ₹25.00
          sgstPaise: 2500, // ₹25.00
          igstPaise: 0,
          totalPaise: 105000, // ₹1050.00
        },
      ];

      const csv = formatSalesRegisterCsv(sales);
      expect(csv.startsWith("\uFEFF")).toBe(true);
      expect(csv).toContain("Invoice No");
      expect(csv).toContain("Customer GSTIN");
      expect(csv).toContain("1000.00");
      expect(csv).toContain("25.00");
      expect(csv).toContain("1050.00");
      expect(csv).toContain("B2B");
    });

    it("formats Purchase & ITC Register CSV with ITC eligibility flag", () => {
      const purchases: CaPurchaseRegisterRow[] = [
        {
          invoiceNumber: "SUP-8842",
          invoiceDate: "2026-11-02",
          supplierName: "Sun Pharma Distributors",
          supplierGstin: "27AAACS1234S1Z9",
          taxableAmountPaise: 500000,
          cgstPaise: 12500,
          sgstPaise: 12500,
          igstPaise: 0,
          totalPaise: 525000,
          itcEligible: true,
        },
        {
          invoiceNumber: "CASH-001",
          invoiceDate: "2026-11-03",
          supplierName: "Local Vendor",
          supplierGstin: "Unregistered",
          taxableAmountPaise: 50000,
          cgstPaise: 0,
          sgstPaise: 0,
          igstPaise: 0,
          totalPaise: 50000,
          itcEligible: false,
        },
      ];

      const csv = formatPurchaseRegisterCsv(purchases);
      expect(csv).toContain("ITC Eligible");
      expect(csv).toContain('"YES"');
      expect(csv).toContain('"NO"');
      expect(csv).toContain("Sun Pharma Distributors");
    });
  });

  describe("GSTR-1 Official JSON Payload Generator", () => {
    it("builds GSTN Offline Tool compliant JSON payload", () => {
      const mockGstr1: Gstr1Summary = {
        period: { month: 11, year: 2026 },
        b2b: [
          {
            partyGstin: "27AABCA1234A1Z5",
            partyName: "City Hospital",
            docNo: "INV-001",
            docDate: "2026-11-02",
            total: 105000,
            taxableAmount: 100000,
            cgst: 2500,
            sgst: 2500,
            igst: 0,
            placeOfSupply: "27-Maharashtra",
          },
        ],
        b2cl: [],
        b2cs: [
          {
            placeOfSupply: "27-Maharashtra",
            rateBp: 500,
            taxableAmount: 200000,
            cgst: 5000,
            sgst: 5000,
            igst: 0,
          },
        ],
        cdnr: [],
        cdnur: [],
        export: [],
        nilRated: { nilRated: 0, exempted: 0, nonGst: 0 },
        hsnSummary: [
          {
            hsn: "3004",
            description: "Medicaments",
            uqc: "OTH",
            totalQty: 50,
            totalValue: 315000,
            taxableAmount: 300000,
            cgst: 7500,
            sgst: 7500,
            igst: 0,
          },
        ],
        docSummary: {
          fromDocNo: "INV-001",
          toDocNo: "INV-005",
          totalIssued: 5,
          cancelled: 0,
          netIssued: 5,
        },
        totals: {
          taxable: 300000,
          cgst: 7500,
          sgst: 7500,
          igst: 0,
          cess: 0,
          totalTax: 15000,
          grossTotal: 315000,
          b2bCount: 1,
          b2cCount: 1,
        },
      };

      const payload = buildGstr1JsonPayload(mockGstr1, "27AABCU9603R1ZM");

      expect(payload.gstin).toBe("27AABCU9603R1ZM");
      expect(payload.fp).toBe("112026");
      expect(payload.b2b).toHaveLength(1);
      expect(payload.b2b[0].ctin).toBe("27AABCA1234A1Z5");
      expect(payload.b2b[0].inv[0].inum).toBe("INV-001");
      expect(payload.b2b[0].inv[0].val).toBe(1050.0);
      expect(payload.b2cs).toHaveLength(1);
      expect(payload.hsn.data).toHaveLength(1);
      expect(payload.hsn.data[0].hsn_sc).toBe("3004");
    });
  });
});
