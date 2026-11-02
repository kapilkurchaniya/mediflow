import { describe, expect, it } from "vitest";
import { formatWhatsAppPhone, buildWhatsAppDirectUrl, buildInvoiceWhatsAppMessage } from "@/lib/whatsapp";
import { calculateReorderQuantity } from "@/server/domain/purchasing/reorder";

describe("Phase 4: WhatsApp Omnichannel Fallback (P4-T01)", () => {
  it("normalizes standard 10-digit Indian mobile numbers with country code 91", () => {
    expect(formatWhatsAppPhone("9876543210")).toBe("919876543210");
  });

  it("normalizes numbers with leading 0", () => {
    expect(formatWhatsAppPhone("09876543210")).toBe("919876543210");
  });

  it("handles numbers already prefixed with 91 or formatting symbols", () => {
    expect(formatWhatsAppPhone("+91 98765-43210")).toBe("919876543210");
    expect(formatWhatsAppPhone("91-9876543210")).toBe("919876543210");
    expect(formatWhatsAppPhone("(+91) 9876543210")).toBe("919876543210");
  });

  it("builds a valid wa.me click-to-chat URL with properly encoded message text", () => {
    const url = buildWhatsAppDirectUrl("9876543210", "Hello & Welcome to MediFlow!");
    expect(url).toBe("https://wa.me/919876543210?text=Hello%20%26%20Welcome%20to%20MediFlow!");
  });

  it("formats statutory digital invoice message for patient WhatsApp sharing", () => {
    const msg = buildInvoiceWhatsAppMessage({
      customerName: "Ramesh Kumar",
      storeName: "Apollo Pharmacy Indiranagar",
      invoiceNo: "INV-2026-0042",
      totalINR: "₹450.00",
      dateStr: "03 Nov 2026",
      itemCount: 3,
    });

    expect(msg).toContain("Dear Ramesh Kumar");
    expect(msg).toContain("Apollo Pharmacy Indiranagar");
    expect(msg).toContain("INV-2026-0042");
    expect(msg).toContain("₹450.00");
    expect(msg).toContain("Items Dispensed:* 3");
  });

  it("gracefully falls back when customerName or invoiceNo is omitted", () => {
    const msg = buildInvoiceWhatsAppMessage({
      storeName: "HealthPlus Chemist",
      totalINR: "₹120.00",
      dateStr: "03 Nov 2026",
    });

    expect(msg).toContain("Dear Valued Customer");
    expect(msg).toContain("HealthPlus Chemist");
    expect(msg).toContain("₹120.00");
  });
});

describe("Phase 4: Wholesale Distributor Pack Rounding (P4-T02)", () => {
  it("strictly rounds loose tablet deficits up to nearest full distributor pack", () => {
    // 14 loose units deficit on a 10-tablet pack item -> must round up to 2 packs (20 units)
    const result = calculateReorderQuantity({
      onHand: 10,
      onOrder: 0,
      avgDailySales: 1, // safetyStock = ceil(1 * 9) = 9
      reorderLevel: 15, // targetStock = 24
      unitsPerPack: 10,
    });

    // deficit = 24 - 10 = 14
    expect(result.suggestedPacks).toBe(2);
    expect(result.suggestedQty).toBe(20);
  });

  it("rounds a 1-unit deficit up to 1 full commercial box/strip", () => {
    const result = calculateReorderQuantity({
      onHand: 19,
      onOrder: 0,
      avgDailySales: 1, // safetyStock = 9
      reorderLevel: 11, // targetStock = 20
      unitsPerPack: 10,
    });

    // deficit = 20 - 19 = 1
    expect(result.suggestedPacks).toBe(1);
    expect(result.suggestedQty).toBe(10);
  });

  it("does not reorder when pipeline satisfies target stock", () => {
    const result = calculateReorderQuantity({
      onHand: 25,
      onOrder: 0,
      avgDailySales: 1,
      reorderLevel: 10,
      unitsPerPack: 10,
    });

    expect(result.suggestedPacks).toBe(0);
    expect(result.suggestedQty).toBe(0);
  });
});

