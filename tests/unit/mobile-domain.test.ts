/** Unit Tests for Mobile Security, Approvals & Razorpay Verification (Lane A: A5.7.9) */
import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  sha256,
  signAccessToken,
  verifyAccessToken,
} from "../../src/server/domain/mobile/auth";
import {
  canonicalJson,
} from "../../src/server/domain/mobile/approvals";
import {
  getKolkataTimeWindow,
} from "../../src/server/domain/mobile/dashboard";
import {
  verifyRazorpaySignature,
} from "../../src/server/domain/mobile/payments";

describe("Mobile Authentication & Token Lifecycle", () => {
  it("signs and verifies valid 15m Bearer JWT", () => {
    const payload = {
      sub: "user-123",
      tenantId: "tenant-456",
      sid: "session-789",
      did: "device-101",
      role: "owner",
    };
    const token = signAccessToken(payload, 900);
    const verified = verifyAccessToken(token);

    expect(verified).not.toBeNull();
    expect(verified?.sub).toBe("user-123");
    expect(verified?.sid).toBe("session-789");
    expect(verified?.did).toBe("device-101");
    expect(verified?.role).toBe("owner");
    expect(verified?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects expired JWT tokens", () => {
    const payload = {
      sub: "user-123",
      tenantId: "tenant-456",
      sid: "session-789",
      did: "device-101",
      role: "pharmacist",
    };
    // Signed with -10 seconds TTL
    const token = signAccessToken(payload, -10);
    const verified = verifyAccessToken(token);
    expect(verified).toBeNull();
  });

  it("rejects tampered JWT signature", () => {
    const token = signAccessToken({
      sub: "user-123",
      tenantId: "tenant-456",
      sid: "session-789",
      did: "device-101",
      role: "owner",
    });
    const parts = token.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ sub: "hacker" })).toString("base64url");
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    expect(verifyAccessToken(tamperedToken)).toBeNull();
  });
});

describe("Canonical JSON & Snapshot Integrity", () => {
  it("produces deterministic canonical JSON regardless of key order", () => {
    const objA = { b: 2, a: 1, details: { z: 26, y: 25 } };
    const objB = { a: 1, details: { y: 25, z: 26 }, b: 2 };

    const jsonA = canonicalJson(objA);
    const jsonB = canonicalJson(objB);

    expect(jsonA).toBe(jsonB);
    expect(sha256(jsonA)).toBe(sha256(jsonB));
  });

  it("accurately detects payload tampering via snapshot hash", () => {
    const original = { refId: "sale-1", amountPaise: 50000 };
    const tampered = { refId: "sale-1", amountPaise: 90000 };

    expect(sha256(canonicalJson(original))).not.toBe(sha256(canonicalJson(tampered)));
  });
});

describe("Razorpay Webhook Cryptographic Verification", () => {
  const secret = "test_webhook_secret_key";

  it("verifies authentic Razorpay HMAC-SHA256 signature", () => {
    const rawBody = JSON.stringify({ event: "payment.captured", payment: { entity: { id: "pay_123", amount: 5000 } } });
    const validSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    expect(verifyRazorpaySignature(rawBody, validSignature, secret)).toBe(true);
  });

  it("rejects forged or modified webhook bodies", () => {
    const rawBody = JSON.stringify({ event: "payment.captured", payment: { entity: { id: "pay_123", amount: 5000 } } });
    const forgedBody = JSON.stringify({ event: "payment.captured", payment: { entity: { id: "pay_123", amount: 1000 } } });
    const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    expect(verifyRazorpaySignature(forgedBody, signature, secret)).toBe(false);
  });
});

describe("Asia/Kolkata Business Day Windows", () => {
  it("calculates exact UTC boundaries for Asia/Kolkata calendar day", () => {
    const { businessDate, dayStartUtc, nextDayStartUtc } = getKolkataTimeWindow("2026-11-06");

    expect(businessDate).toBe("2026-11-06");
    // 2026-11-06 00:00:00 IST is 2026-11-05 18:30:00 UTC
    expect(dayStartUtc.toISOString()).toBe("2026-11-05T18:30:00.000Z");
    // Next day start is exactly 24 hours later
    expect(nextDayStartUtc.toISOString()).toBe("2026-11-06T18:30:00.000Z");
    expect(nextDayStartUtc.getTime() - dayStartUtc.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
