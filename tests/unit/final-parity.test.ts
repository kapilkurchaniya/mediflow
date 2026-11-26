import { describe, expect, it } from "vitest";
import { checkDpcoCeilingPrice } from "@/lib/regulatory/dpco-ceiling";
import { buildGstr9AnnualSummary } from "@/server/domain/reports/gstr9";
import { detectKeymapConflicts, getBindingsForScope, KEYMAP_REGISTRY } from "@/lib/keyboard/keymap-registry";

describe("Final Parity Workstreams: DPCO Ceiling, GSTR-9 Summary & Keymap Registry", () => {
  it("flags formulations exceeding NPPA DPCO ceiling price", () => {
    const ok = checkDpcoCeilingPrice({
      medicineName: "Dolo 650",
      genericName: "Paracetamol 650",
      packRatePaise: 3000, // ₹30 for 15 tabs = ₹2.00/tab <= ₹2.40
      unitsPerPack: 15,
    });
    expect(ok.exceedsCeiling).toBe(false);

    const high = checkDpcoCeilingPrice({
      medicineName: "Paracetamol 650",
      genericName: "Paracetamol 650",
      packRatePaise: 4500, // ₹45 for 15 tabs = ₹3.00/tab > ₹2.40
      unitsPerPack: 15,
    });
    expect(high.exceedsCeiling).toBe(true);
    expect(high.message).toContain("DPCO ceiling");
  });

  it("aggregates GSTR-9 annual outward taxable, net ITC, and tax payable", () => {
    const summary = buildGstr9AnnualSummary("2026-27", [
      {
        month: "2026-04",
        b2bTaxablePaise: 100000,
        b2cTaxablePaise: 200000,
        creditNoteTaxablePaise: 10000,
        outputTaxPaise: 34800,
        itcClaimedPaise: 25000,
        itcReversedPaise: 1000,
      },
    ]);
    expect(summary.outwardTaxablePaise).toBe(290000);
    expect(summary.netItcPaise).toBe(24000);
    expect(summary.netTaxPayableOrCreditPaise).toBe(10800);
  });

  it("has zero conflicts in KEYMAP_REGISTRY across both MediFlow and Marg profiles", () => {
    const mediflowConflicts = detectKeymapConflicts(
      KEYMAP_REGISTRY.map((b) => ({ scope: b.scope, key: b.mediflowKey, id: b.id })),
    );
    const margConflicts = detectKeymapConflicts(
      KEYMAP_REGISTRY.map((b) => ({ scope: b.scope, key: b.margKey, id: b.id })),
    );
    expect(mediflowConflicts).toHaveLength(0);
    expect(margConflicts).toHaveLength(0);
    expect(getBindingsForScope("pos", "marg").some((b) => b.keyLabel.includes("End"))).toBe(true);
  });
});
