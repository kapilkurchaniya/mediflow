import { describe, it, expect } from "vitest";
import { checkCdscoBannedFdc } from "@/lib/regulatory/banned-fdc";

describe("CDSCO banned FDC check (Q4)", () => {
  it("blocks banned FDC combinations regardless of case or order", () => {
    const res = checkCdscoBannedFdc({
      name: "Nimesulide + Paracetamol Suspension",
      genericName: "Paracetamol + Nimesulide",
    });
    expect(res.banned).toBe(true);
    expect(res.reason).toContain("MoHFW Gazette");
  });

  it("blocks single prohibited drugs like Rofecoxib", () => {
    const res = checkCdscoBannedFdc({ name: "Rofecoxib 25mg Tab" });
    expect(res.banned).toBe(true);
  });

  it("allows safe standard medicines", () => {
    const res = checkCdscoBannedFdc({
      name: "Dolo 650mg Tablet",
      genericName: "Paracetamol 650mg",
    });
    expect(res.banned).toBe(false);
  });
});
