import { describe, expect, it } from "vitest";
import {
  evaluateGrnSupplierMatch,
  type SupplierCandidate,
} from "@/server/domain/import/supplier-matcher";

const SUPPLIERS: SupplierCandidate[] = [
  {
    id: "sup-1",
    name: "Apollo Pharma Distributors Pvt Ltd",
    gstin: "29AABCA1234F1Z5",
    phone: "9876543210",
    drugLicenseNo: "KA-BLR-20B-111111",
  },
  {
    id: "sup-2",
    name: "MedPlus Wholesale Agencies",
    gstin: "29AABCM9999K1Z2",
    phone: "9123456789",
    drugLicenseNo: "KA-BLR-20B-222222",
  },
];

describe("evaluateGrnSupplierMatch", () => {
  it("flags GSTIN mismatch when selected supplier differs from scanned bill GSTIN", () => {
    const res = evaluateGrnSupplierMatch({
      selectedSupplierId: "sup-1",
      suppliers: SUPPLIERS,
      extracted: {
        name: "MedPlus Wholesale Agencies",
        gstin: "29AABCM9999K1Z2",
      },
    });

    expect(res.status).toBe("mismatch");
    expect(res.selectedSupplier?.id).toBe("sup-1");
    expect(res.matchedSupplier?.id).toBe("sup-2");
    expect(res.reason).toContain("GSTIN mismatch");
  });

  it("returns matched when selected supplier GSTIN matches scanned bill", () => {
    const res = evaluateGrnSupplierMatch({
      selectedSupplierId: "sup-1",
      suppliers: SUPPLIERS,
      extracted: {
        name: "M/s Apollo Pharma",
        gstin: "29aabca1234f1z5",
      },
    });

    expect(res.status).toBe("matched");
    expect(res.matchedSupplier?.id).toBe("sup-1");
  });

  it("matches by fuzzy normalized name when GSTIN is absent", () => {
    const res = evaluateGrnSupplierMatch({
      selectedSupplierId: "sup-2",
      suppliers: SUPPLIERS,
      extracted: {
        name: "M/s MedPlus Wholesale",
        gstin: null,
      },
    });

    expect(res.status).toBe("matched");
    expect(res.matchedSupplier?.id).toBe("sup-2");
  });

  it("auto-matches supplier when no supplier is pre-selected", () => {
    const res = evaluateGrnSupplierMatch({
      selectedSupplierId: null,
      suppliers: SUPPLIERS,
      extracted: {
        name: "MedPlus Wholesale",
        gstin: "29AABCM9999K1Z2",
      },
    });

    expect(res.status).toBe("auto_matched");
    expect(res.matchedSupplier?.id).toBe("sup-2");
  });

  it("returns unreadable when OCR extracts no supplier header signal", () => {
    const res = evaluateGrnSupplierMatch({
      selectedSupplierId: "sup-1",
      suppliers: SUPPLIERS,
      extracted: {
        name: "",
        gstin: null,
        phone: null,
      },
    });

    expect(res.status).toBe("unreadable");
    expect(res.matchedSupplier).toBeNull();
  });
});

