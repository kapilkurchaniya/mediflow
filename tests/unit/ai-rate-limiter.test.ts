import { describe, it, expect, beforeEach } from "vitest";
import { checkAiRateLimit, resetAiRateLimit } from "@/server/ai/rate-limiter";

describe("MediFlow AI Rate Limiter", () => {
  const tenantId = "tenant-001";
  const userId = "user-123";

  beforeEach(() => {
    resetAiRateLimit();
  });

  it("permits initial request and tracks remaining queries", () => {
    const res = checkAiRateLimit(tenantId, userId);
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(59);
    expect(res.resetInSeconds).toBeGreaterThan(0);
  });

  it("enforces burst limit when requests exceed 15 in 1 minute", () => {
    const baseTime = 1700000000000;
    for (let i = 0; i < 15; i++) {
      const ok = checkAiRateLimit(tenantId, userId, baseTime + i * 100);
      expect(ok.allowed).toBe(true);
    }

    const blocked = checkAiRateLimit(tenantId, userId, baseTime + 1600);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("Burst rate limit");
    expect(blocked.remaining).toBe(0);
  });

  it("enforces hourly limit of 60 requests", () => {
    const baseTime = 1700000000000;
    // Spread 60 requests across 50 minutes (to avoid burst limit)
    for (let i = 0; i < 60; i++) {
      const ok = checkAiRateLimit(tenantId, userId, baseTime + i * 50 * 1000);
      expect(ok.allowed).toBe(true);
    }

    const blocked = checkAiRateLimit(tenantId, userId, baseTime + 55 * 60 * 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain("Hourly AI query limit");
  });

  it("isolates rate limit buckets between different users and tenants", () => {
    const baseTime = 1700000000000;
    for (let i = 0; i < 15; i++) {
      checkAiRateLimit(tenantId, "user-A", baseTime + i * 100);
    }

    // User A is burst blocked
    const userABlocked = checkAiRateLimit(tenantId, "user-A", baseTime + 1600);
    expect(userABlocked.allowed).toBe(false);

    // User B under the same tenant is permitted
    const userBAllowed = checkAiRateLimit(tenantId, "user-B", baseTime + 1600);
    expect(userBAllowed.allowed).toBe(true);

    // User under different tenant is permitted
    const otherTenantAllowed = checkAiRateLimit("tenant-002", "user-A", baseTime + 1600);
    expect(otherTenantAllowed.allowed).toBe(true);
  });
});

