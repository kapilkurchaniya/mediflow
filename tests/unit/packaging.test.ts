import { describe, it, expect } from "vitest";
import {
  parsePackaging,
  parsePackAndLooseQty,
  computeBaseUnitCost,
  resolveOcrCatalogPackConflict,
} from "@/lib/packaging";

describe("Indian Pharma Packaging Utility", () => {
  describe("parsePackaging", () => {
    it("parses standard Indian strip formats", () => {
      expect(parsePackaging({ packRaw: "10'S", medicineName: "Metformin 500mg" })).toEqual({
        unitsPerPack: 10,
        packUnit: "strip",
        looseUnit: "tablet",
        packSize: "10'S",
        isSolidDoseCandidate: true,
        warning: null,
      });

      expect(parsePackaging({ packRaw: "1x15", medicineName: "Pantoprazole 40mg" })).toEqual({
        unitsPerPack: 15,
        packUnit: "strip",
        looseUnit: "tablet",
        packSize: "1x15",
        isSolidDoseCandidate: true,
        warning: null,
      });

      expect(parsePackaging({ packRaw: "10x10", medicineName: "Amoxicillin 500mg Cap" })).toEqual({
        unitsPerPack: 10,
        packUnit: "strip",
        looseUnit: "capsule",
        packSize: "10x10",
        isSolidDoseCandidate: true,
        warning: null,
      });

      expect(parsePackaging({ packRaw: "Strip of 15", medicineName: "Dolo 650" })).toEqual({
        unitsPerPack: 15,
        packUnit: "strip",
        looseUnit: "tablet",
        packSize: "Strip of 15",
        isSolidDoseCandidate: true,
        warning: null,
      });
    });

    it("enforces unitsPerPack = 1 for syrups, creams, drops, and injections", () => {
      const syrup = parsePackaging({ packRaw: "100ML", medicineName: "Benadryl Cough Syrup" });
      expect(syrup.unitsPerPack).toBe(1);
      expect(syrup.packUnit).toBe("bottle");
      expect(syrup.isSolidDoseCandidate).toBe(false);
      expect(syrup.warning).toBeNull();

      const cream = parsePackaging({ packRaw: "15GM", medicineName: "Betnovate Cream" });
      expect(cream.unitsPerPack).toBe(1);
      expect(cream.packUnit).toBe("tube");
      expect(cream.isSolidDoseCandidate).toBe(false);

      const inj = parsePackaging({ packRaw: "10ML", medicineName: "Ceftriaxone Injection" });
      expect(inj.unitsPerPack).toBe(1);
      expect(inj.packUnit).toBe("vial");
      expect(inj.isSolidDoseCandidate).toBe(false);
    });

    it("flags solid-dose candidates when pack size is missing (e.g. Paracetamol 650mg)", () => {
      const res = parsePackaging({ medicineName: "Paracetamol 650mg" });
      expect(res.unitsPerPack).toBe(1);
      expect(res.packUnit).toBe("strip");
      expect(res.looseUnit).toBe("tablet");
      expect(res.isSolidDoseCandidate).toBe(true);
      expect(res.warning).toMatch(/Units\/Pack/i);
    });
  });

  describe("parsePackAndLooseQty", () => {
    it("multiplies packs by unitsPerPack in default packs mode", () => {
      expect(parsePackAndLooseQty(209, 0, 15, "packs")).toEqual({
        packs: 209,
        loose: 0,
        baseQty: 3135,
      });
      expect(parsePackAndLooseQty(10, 4, 15, "packs")).toEqual({
        packs: 10,
        loose: 4,
        baseQty: 154,
      });
    });

    it("supports Marg/Busy S.L decimal notation in packs mode", () => {
      expect(parsePackAndLooseQty("12.4", undefined, 10, "packs")).toEqual({
        packs: 12,
        loose: 4,
        baseQty: 124,
      });
      expect(parsePackAndLooseQty("5.12", undefined, 15, "packs")).toEqual({
        packs: 5,
        loose: 12,
        baseQty: 87,
      });
    });

    it("treats qty directly as individual loose tablets in loose mode", () => {
      expect(parsePackAndLooseQty(209, 0, 15, "loose")).toEqual({
        packs: 13,
        loose: 14,
        baseQty: 209,
      });
    });
  });

  describe("computeBaseUnitCost", () => {
    it("divides pack PTR by unitsPerPack for per-base-unit cost", () => {
      expect(computeBaseUnitCost(2800, 15)).toBe(187);
      expect(computeBaseUnitCost(7600, 15)).toBe(507);
      expect(computeBaseUnitCost(3500, 1)).toBe(3500);
      expect(computeBaseUnitCost(0, 10)).toBe(0);
    });
  });

  describe("resolveOcrCatalogPackConflict", () => {
    it("keeps OCR strip size and suggests catalog update when catalog is 1 and OCR > 1", () => {
      expect(resolveOcrCatalogPackConflict(1, 15)).toEqual({
        effectiveUpp: 15,
        catalogUpp: 1,
        packMismatch: true,
        suggestCatalogUpdate: true,
      });
    });

    it("inherits catalog strip size when document omits pack column (OCR = 1)", () => {
      expect(resolveOcrCatalogPackConflict(15, 1)).toEqual({
        effectiveUpp: 15,
        catalogUpp: 15,
        packMismatch: false,
        suggestCatalogUpdate: false,
      });
    });

    it("flags mismatch when both catalog and OCR have conflicting strip sizes > 1", () => {
      expect(resolveOcrCatalogPackConflict(10, 15)).toEqual({
        effectiveUpp: 15,
        catalogUpp: 10,
        packMismatch: true,
        suggestCatalogUpdate: false,
      });
    });
  });
});

