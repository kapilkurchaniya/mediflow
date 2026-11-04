import { describe, expect, it } from "vitest";
import { validateVehicleNumber } from "@/server/domain/e-invoice";

describe("E-Way Bill Vehicle Number Validation (Indian Motor Vehicles Act)", () => {
  it("accepts valid Indian vehicle registration numbers with standard formatting", () => {
    expect(validateVehicleNumber("MH12AB1234")).toEqual({
      valid: true,
      normalized: "MH12AB1234",
    });

    expect(validateVehicleNumber("DL01A9999")).toEqual({
      valid: true,
      normalized: "DL01A9999",
    });

    expect(validateVehicleNumber("KA05MB0001")).toEqual({
      valid: true,
      normalized: "KA05MB0001",
    });

    expect(validateVehicleNumber("GJ01XX1234")).toEqual({
      valid: true,
      normalized: "GJ01XX1234",
    });
  });

  it("normalizes and accepts vehicle numbers with hyphens and spaces", () => {
    expect(validateVehicleNumber("MH-12-AB-1234")).toEqual({
      valid: true,
      normalized: "MH12AB1234",
    });

    expect(validateVehicleNumber("dl 01 a 9999")).toEqual({
      valid: true,
      normalized: "DL01A9999",
    });

    expect(validateVehicleNumber("KA-05-MB-0001")).toEqual({
      valid: true,
      normalized: "KA05MB0001",
    });
  });

  it("rejects non-compliant or malformed vehicle inputs", () => {
    expect(validateVehicleNumber("1234").valid).toBe(false);
    expect(validateVehicleNumber("MH 12").valid).toBe(false);
    expect(validateVehicleNumber("TOOLONGVEHICLE12345").valid).toBe(false);
    expect(validateVehicleNumber("").valid).toBe(false);
  });
});

