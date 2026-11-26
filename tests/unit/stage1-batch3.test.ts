import { describe, expect, it } from "vitest";
import { evaluatePurchaseRateDiff } from "@/lib/purchases/rate-diff";
import { normalizeDistributorItemName } from "@/server/domain/import/supplier-item-map";
import { buildWhatsAppDeepLink, normalizeWhatsAppPhone } from "@/lib/comms/whatsapp-link";
import { lookupGstinTaxpayer, validateGstinStructure } from "@/server/domain/gst-lookup";

describe("Stage 1 Batch 3: Diff Rate, Supplier Item Map, WhatsApp Deep Link & GSTIN Lookup", () => {
  it("detects purchase rate diff above 2% threshold", () => {
    const higher = evaluatePurchaseRateDiff({ currentRatePaise: 11200, previousRatePaise: 10000 });
    expect(higher.hasDiff).toBe(true);
    expect(higher.direction).toBe("higher");
    expect(higher.diffPercent).toBe(12);
    expect(higher.alertLevel).toBe("warn");

    const same = evaluatePurchaseRateDiff({ currentRatePaise: 10100, previousRatePaise: 10000 });
    expect(same.hasDiff).toBe(false);
  });

  it("normalizes distributor item names consistently for supplier_item_map", () => {
    expect(normalizeDistributorItemName("  DOLO  650MG  TAB  ")).toBe("dolo 650mg tab");
  });

  it("builds WhatsApp desktop and web deep links with normalized Indian phone numbers", () => {
    expect(normalizeWhatsAppPhone("98765-43210")).toBe("919876543210");
    expect(
      buildWhatsAppDeepLink({ phone: "9876543210", text: "Your Rx is ready", preferDesktop: true }),
    ).toBe("whatsapp://send?phone=919876543210&text=Your%20Rx%20is%20ready");
    expect(
      buildWhatsAppDeepLink({ phone: "919876543210", text: "Hi", preferDesktop: false }),
    ).toBe("https://wa.me/919876543210?text=Hi");
  });

  it("validates GSTIN structure and returns state info", async () => {
    const valid = validateGstinStructure("27aabcu9603r1zm");
    expect(valid.valid).toBe(true);
    expect(valid.stateCode).toBe("27");
    expect(valid.stateName).toBe("Maharashtra");

    const lookup = await lookupGstinTaxpayer("27AABCU9603R1ZM");
    expect(lookup.valid).toBe(true);
    expect(lookup.source).toBe("structural_validator");

    const invalid = await lookupGstinTaxpayer("INVALID");
    expect(invalid.valid).toBe(false);
    expect(invalid.status).toBe("Invalid");
  });
});
