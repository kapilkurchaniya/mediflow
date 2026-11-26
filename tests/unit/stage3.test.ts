import { describe, expect, it } from "vitest";
import { buildAbdmCareContextBundle, validateAbhaIdentifier } from "@/lib/compliance/abdm-abha";
import { mergeEdgeRelayEnvelopes } from "@/lib/offline/edge-relay";
import { convertChallanToWholesaleInvoiceSummary } from "@/lib/wholesale/challan";
import { buildOwnerExecutivePulse, calculateThreeYearTcoComparison } from "@/lib/analytics/owner-pulse";
import { parseMargOpenBillsCsv, parseMargPdcCsv } from "@/server/domain/import/marg-deep-migration";

describe("Stage 3: ABHA/HFR, Edge Relay, Wholesale Challan, eOwner Pulse & Marg Deep Migration", () => {
  it("validates ABHA number/address and builds FHIR MedicationDispense bundle", () => {
    expect(validateAbhaIdentifier("12345678901234")).toEqual({
      valid: true,
      kind: "abha_number",
      normalized: "12-3456-7890-1234",
    });
    expect(validateAbhaIdentifier("ramesh.patel@abdm").valid).toBe(true);

    const bundle = buildAbdmCareContextBundle({
      hfrFacilityId: "IN-HFR-001",
      patientAbhaAddress: "ramesh.patel@abdm",
      invoiceNo: "INV-2026-001",
      dispensedAtIso: "2026-11-26T10:00:00Z",
      doctorName: "Dr. Sharma",
      items: [
        {
          medicineName: "Dolo 650",
          genericName: "Paracetamol",
          qty: 15,
          batchNo: "B10",
          expiryDate: "2028-01-31",
        },
      ],
    });
    expect(bundle.resourceType).toBe("Bundle");
    expect(bundle.entry[0].resource.resourceType).toBe("MedicationDispense");
  });

  it("merges Store Edge Relay envelopes idempotently across terminals", () => {
    const res = mergeEdgeRelayEnvelopes(
      [
        {
          storeId: "s1",
          terminalId: "T1",
          seq: 1,
          entityType: "sale",
          entityId: "sale-1",
          createdAtIso: "2026-11-26T10:00:00Z",
          payload: {},
        },
      ],
      [
        {
          storeId: "s1",
          terminalId: "T1",
          seq: 1,
          entityType: "sale",
          entityId: "sale-1",
          createdAtIso: "2026-11-26T10:00:00Z",
          payload: {},
        },
        {
          storeId: "s1",
          terminalId: "T2",
          seq: 4,
          entityType: "sale",
          entityId: "sale-2",
          createdAtIso: "2026-11-26T10:05:00Z",
          payload: {},
        },
      ],
    );
    expect(res.merged).toHaveLength(2);
    expect(res.newlyAppliedCount).toBe(1);
    expect(res.highWaterSeqByTerminal).toEqual({ T1: 1, T2: 4 });
  });

  it("converts B2B wholesale challan to GST summary with e-Way threshold check", () => {
    const summary = convertChallanToWholesaleInvoiceSummary({
      challanNo: "CH-101",
      challanDate: "2026-11-26",
      buyerName: "City Medical Agency",
      buyerGstin: "27AABCU9603R1ZM",
      routeName: "South Zone",
      salesmanName: "Vikram",
      lrNo: "LR-9981",
      lines: [
        {
          medicineId: "m1",
          medicineName: "Augmentin 625",
          batchNo: "B1",
          qty: 500,
          freeQty: 50,
          ptrRatePaise: 10000,
          discountBp: 0,
          gstRateBp: 1200,
        },
      ],
    });
    expect(summary.taxablePaise).toBe(5000000);
    expect(summary.gstPaise).toBe(600000);
    expect(summary.grandTotalPaise).toBe(5600000); // ₹56,000 >= ₹50,000
    expect(summary.requiresEwayBill).toBe(true);
    expect(summary.totalFreeUnits).toBe(50);
  });

  it("computes eOwner multi-store pulse and 3-year Marg TCO savings", () => {
    const pulse = buildOwnerExecutivePulse([
      {
        storeId: "1",
        storeName: "Main Branch",
        todaySalesPaise: 500000,
        cashCollectedPaise: 200000,
        upiCollectedPaise: 250000,
        cardCollectedPaise: 50000,
        creditIssuedPaise: 0,
        nearExpiryValuePaise: 12000,
        lowStockSkuCount: 4,
      },
      {
        storeId: "2",
        storeName: "Hospital Branch",
        todaySalesPaise: 800000,
        cashCollectedPaise: 300000,
        upiCollectedPaise: 400000,
        cardCollectedPaise: 100000,
        creditIssuedPaise: 0,
        nearExpiryValuePaise: 5000,
        lowStockSkuCount: 2,
      },
    ]);
    expect(pulse.totalSalesPaise).toBe(1300000);
    expect(pulse.topStore?.storeName).toBe("Hospital Branch");

    const tco = calculateThreeYearTcoComparison({
      terminals: 3,
      margAnnualAmcPerTerminalInr: 4500,
      margWalletMonthlyInr: 500,
      mediflowAnnualPerStoreInr: 12000,
    });
    expect(tco.savingsInr).toBeGreaterThan(0);
  });

  it("parses Marg deep migration open bills and PDC CSVs", () => {
    const bills = parseMargOpenBillsCsv(
      "Type,Party,BillNo,Date,Pending\nCustomer,Ramesh,INV-1,2026-10-01,1250.50\nSupplier,Cipla Dist,PUR-9,2026-10-15,9800",
    );
    expect(bills).toHaveLength(2);
    expect(bills[0]).toMatchObject({ partyType: "customer", pendingAmountPaise: 125050 });
    expect(bills[1]).toMatchObject({ partyType: "supplier", pendingAmountPaise: 980000 });

    const pdcs = parseMargPdcCsv(
      "Direction,Party,ChequeNo,Date,Bank,Amount\nInward,Ramesh,445566,2026-12-05,HDFC,5000",
    );
    expect(pdcs).toHaveLength(1);
    expect(pdcs[0]).toMatchObject({ direction: "inward", chequeNo: "445566", amountPaise: 500000 });
  });
});
