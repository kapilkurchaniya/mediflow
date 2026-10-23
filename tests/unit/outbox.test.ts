import { describe, expect, it } from "vitest";
import { calculateBackoffMs, type OutboxType } from "@/server/jobs/outbox";
import { handlers } from "@/server/jobs/handlers";

describe("Transactional Outbox Arithmetic & Backoff (B2.1)", () => {
  it("calculates exponential backoff based on attempt count", () => {
    // 2^attempts * 5000ms
    expect(calculateBackoffMs(1)).toBe(10000); // 10s
    expect(calculateBackoffMs(2)).toBe(20000); // 20s
    expect(calculateBackoffMs(3)).toBe(40000); // 40s
    expect(calculateBackoffMs(4)).toBe(80000); // 80s
    expect(calculateBackoffMs(5)).toBe(160000); // 160s
  });

  it("caps exponential backoff at maximum 1 hour (3,600,000 ms)", () => {
    expect(calculateBackoffMs(10)).toBe(3600000);
    expect(calculateBackoffMs(20)).toBe(3600000);
  });

  it("registers handlers for every valid OutboxType", () => {
    const requiredTypes: OutboxType[] = [
      "whatsapp.receipt",
      "sms.send",
      "reminder.send",
      "gst.doc_retry",
      "einvoice.generate",
    ];

    for (const type of requiredTypes) {
      expect(handlers[type]).toBeDefined();
      expect(typeof handlers[type]).toBe("function");
    }
  });
});
