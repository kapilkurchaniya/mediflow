import { describe, expect, it } from "vitest";
import {
  validateDispensingCompliance,
  getScheduleRule,
  isScheduledDrug,
  SCHEDULE_RULES,
} from "@/server/domain/compliance";
import {
  MIN_REGISTER_RETENTION_YEARS,
  H1_REGISTER_RETENTION_YEARS,
  NARCOTIC_REGISTER_RETENTION_YEARS,
} from "@/lib/regulatory";

describe("Schedule Rules & Retention Requirements", () => {
  it("enforces correct statutory retention periods", () => {
    expect(SCHEDULE_RULES.H.retentionYears).toBe(MIN_REGISTER_RETENTION_YEARS); // 2 years
    expect(SCHEDULE_RULES.H1.retentionYears).toBe(H1_REGISTER_RETENTION_YEARS); // 3 years (Rule 65(3)(h))
    expect(SCHEDULE_RULES.X.retentionYears).toBe(MIN_REGISTER_RETENTION_YEARS); // 2 years
    expect(SCHEDULE_RULES.narcotic.retentionYears).toBe(NARCOTIC_REGISTER_RETENTION_YEARS); // 5 years (NDPS)
  });

  it("identifies scheduled and controlled drugs", () => {
    expect(isScheduledDrug("H")).toBe(true);
    expect(isScheduledDrug("H1")).toBe(true);
    expect(isScheduledDrug("X")).toBe(true);
    expect(isScheduledDrug("narcotic")).toBe(true);
    expect(isScheduledDrug("G")).toBe(false);
    expect(isScheduledDrug("none")).toBe(false);
    expect(isScheduledDrug(null)).toBe(false);
  });

  it("resolves schedule rules case-insensitively", () => {
    expect(getScheduleRule("h1").schedule).toBe("H1");
    expect(getScheduleRule("H1").schedule).toBe("H1");
    expect(getScheduleRule("NARCOTIC").schedule).toBe("narcotic");
    expect(getScheduleRule("unknown").schedule).toBe("none");
  });
});

describe("validateDispensingCompliance", () => {
  it("passes when cart has only non-controlled items", () => {
    const res = validateDispensingCompliance({
      items: [
        { medicineName: "Paracetamol 500mg", schedule: "none", qty: 10 },
        { medicineName: "Antacid Gel", schedule: "G", qty: 1 },
      ],
    });

    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.warnings).toHaveLength(0);
    expect(res.controlledItems).toHaveLength(0);
  });

  it("Schedule H: requires Doctor Name", () => {
    // Missing doctor name -> Error
    const invalidRes = validateDispensingCompliance({
      items: [
        { medicineName: "Amoxicillin 500mg", schedule: "H", qty: 10 },
      ],
      doctorName: "",
    });
    expect(invalidRes.valid).toBe(false);
    expect(invalidRes.errors[0]).toContain("Doctor Name is required");

    // With doctor name -> Valid
    const validRes = validateDispensingCompliance({
      items: [
        { medicineName: "Amoxicillin 500mg", schedule: "H", qty: 10 },
      ],
      doctorName: "Dr. A. K. Verma",
    });
    expect(validRes.valid).toBe(true);
    expect(validRes.errors).toHaveLength(0);
  });

  it("Schedule H1: requires Doctor Name, gives warnings for Doctor Reg No and Patient Address", () => {
    const res = validateDispensingCompliance({
      items: [
        { medicineName: "Cefixime 200mg", schedule: "H1", qty: 10 },
      ],
      doctorName: "Dr. R. Sharma",
      // doctorRegNo missing
      // patientAddress missing
    });

    expect(res.valid).toBe(true); // warnings don't block cart, but warn for statutory register completeness
    expect(res.warnings).toHaveLength(2);
    expect(res.warnings[0]).toContain("Doctor Registration No");
    expect(res.warnings[1]).toContain("Patient Address");

    // Complete H1 details
    const completeRes = validateDispensingCompliance({
      items: [
        { medicineName: "Cefixime 200mg", schedule: "H1", qty: 10 },
      ],
      doctorName: "Dr. R. Sharma",
      doctorRegNo: "MCI-48291",
      patientAddress: "124 Marine Lines, Mumbai",
    });
    expect(completeRes.valid).toBe(true);
    expect(completeRes.warnings).toHaveLength(0);
  });

  it("Schedule X / Narcotic: strictly requires Doctor Reg No and Patient Address as blocking errors", () => {
    const res = validateDispensingCompliance({
      items: [
        { medicineName: "Alprazolam 0.5mg", schedule: "X", qty: 10 },
      ],
      doctorName: "Dr. S. Mehta",
      // missing doctorRegNo and patientAddress
    });

    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("Doctor Registration Number is strictly mandatory"))).toBe(true);
    expect(res.errors.some((e) => e.includes("Patient Address is mandatory"))).toBe(true);

    // Complete Schedule X details -> Valid
    const completeRes = validateDispensingCompliance({
      items: [
        { medicineName: "Alprazolam 0.5mg", schedule: "X", qty: 10 },
      ],
      doctorName: "Dr. S. Mehta",
      doctorRegNo: "MCI-99412",
      patientAddress: "Flat 4B, Hill View Apts, Bandra",
    });
    expect(completeRes.valid).toBe(true);
    expect(completeRes.errors).toHaveLength(0);
  });

  it("Narcotic drug: enforces strict NDPS compliance", () => {
    const res = validateDispensingCompliance({
      items: [
        { medicineName: "Morphine Sulphate 10mg", schedule: "narcotic", qty: 5 },
      ],
      doctorName: "Dr. P. Nair",
      doctorRegNo: "MCI-12003",
      patientAddress: "Sector 15, Vashi, Navi Mumbai",
    });

    expect(res.valid).toBe(true);
    expect(res.controlledItems).toHaveLength(1);
    expect(res.controlledItems[0]?.rule.statutoryRegister).toBe("narcotics");
  });

  it("rxRequired: requires Doctor Name even when schedule is none", () => {
    const invalidRes = validateDispensingCompliance({
      items: [
        { medicineName: "Azithromycin 500mg", schedule: "none", rxRequired: true, qty: 5 },
      ],
      doctorName: "",
    });
    expect(invalidRes.valid).toBe(false);
    expect(invalidRes.errors[0]).toContain("Doctor Name is required");

    const validRes = validateDispensingCompliance({
      items: [
        { medicineName: "Azithromycin 500mg", schedule: "none", rxRequired: true, qty: 5 },
      ],
      doctorName: "Dr. K. Patel",
    });
    expect(validRes.valid).toBe(true);
  });
});
