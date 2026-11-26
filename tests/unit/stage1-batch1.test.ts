import { describe, expect, it } from "vitest";
import { validateBalancedJournalLines } from "@/server/domain/accounting-vouchers";
import { generateTallyDayBookXml, generateTallyMastersXml, mapAccountToTallyGroup } from "@/server/domain/reports/tally-xml";
import { isAntiTbDrug } from "@/lib/regulatory/anti-tb";
import { aggregatePatientDoctorSales } from "@/server/domain/reports/patient-doctor";

describe("Stage 1 Batch 1: Accounting Vouchers, Tally XML, TB Register & Patient/Doctor Analytics", () => {
  it("validates balanced manual journal lines", () => {
    expect(
      validateBalancedJournalLines([
        { accountId: "a1", debitPaise: 50000, creditPaise: 0 },
        { accountId: "a2", debitPaise: 0, creditPaise: 50000 },
      ]),
    ).toEqual({ totalDebit: 50000, totalCredit: 50000 });

    expect(() =>
      validateBalancedJournalLines([
        { accountId: "a1", debitPaise: 50000, creditPaise: 0 },
        { accountId: "a2", debitPaise: 0, creditPaise: 40000 },
      ]),
    ).toThrow(/unbalanced/i);
  });

  it("generates valid Tally Prime Masters & Day Book XML", () => {
    const masters = generateTallyMastersXml("Apollo Chemist", [
      { code: "1010", name: "Cash on Hand", type: "asset", systemKey: "cash" },
      { code: "2050", name: "Output CGST", type: "liability", systemKey: "cgst_output" },
    ]);
    expect(masters).toContain("<REPORTNAME>All Masters</REPORTNAME>");
    expect(masters).toContain("<PARENT>Cash-in-Hand</PARENT>");
    expect(masters).toContain("<PARENT>Duties &amp; Taxes</PARENT>");
    expect(mapAccountToTallyGroup({ code: "1050", name: "Customer Receivables", type: "asset", systemKey: "debtors" })).toBe(
      "Sundry Debtors",
    );

    const dayBook = generateTallyDayBookXml("Apollo Chemist", [
      {
        entryNo: "CV-202611-0001",
        entryDate: "2026-11-26",
        narration: "Cash deposited",
        refType: "contra",
        lines: [
          { accountName: "Bank / Digital Payments", debitPaise: 100000, creditPaise: 0 },
          { accountName: "Cash on Hand", debitPaise: 0, creditPaise: 100000 },
        ],
      },
    ]);
    expect(dayBook).toContain('VCHTYPE="Contra"');
    expect(dayBook).toContain("<DATE>20261126</DATE>");
    expect(dayBook).toContain("<AMOUNT>-1000.00</AMOUNT>");
    expect(dayBook).toContain("<AMOUNT>1000.00</AMOUNT>");
  });

  it("identifies anti-TB drugs accurately", () => {
    expect(isAntiTbDrug({ medicineName: "R-Cinex 600", genericName: "Rifampicin + Isoniazid" })).toBe(true);
    expect(isAntiTbDrug({ medicineName: "AKT-4 Kit", genericName: "" })).toBe(true);
    expect(isAntiTbDrug({ medicineName: "Dolo 650", genericName: "Paracetamol" })).toBe(false);
  });

  it("aggregates patient-wise, doctor-wise, and doctor-company-wise sales", () => {
    const res = aggregatePatientDoctorSales([
      {
        saleId: "s1",
        completedAt: new Date("2026-11-20T10:00:00Z"),
        customerId: "c1",
        customerName: "Ramesh",
        customerPhone: "9876543210",
        doctorName: "Dr. Mehta",
        doctorRegNo: "MMC-123",
        saleTotal: 15000,
        saleCredit: 5000,
        qty: 2,
        lineTotal: 10000,
        manufacturer: "Cipla",
      },
      {
        saleId: "s1",
        completedAt: new Date("2026-11-20T10:00:00Z"),
        customerId: "c1",
        customerName: "Ramesh",
        customerPhone: "9876543210",
        doctorName: "Dr. Mehta",
        doctorRegNo: "MMC-123",
        saleTotal: 15000,
        saleCredit: 5000,
        qty: 1,
        lineTotal: 5000,
        manufacturer: "Sun Pharma",
      },
    ]);

    expect(res.patients).toHaveLength(1);
    expect(res.patients[0]).toMatchObject({ billCount: 1, totalQty: 3, totalAmountPaise: 15000, creditAmountPaise: 5000 });
    expect(res.doctors[0]).toMatchObject({ doctorName: "Dr. Mehta", rxCount: 1, uniquePatients: 1, totalAmountPaise: 15000 });
    expect(res.doctorCompanies).toHaveLength(2);
  });
});
