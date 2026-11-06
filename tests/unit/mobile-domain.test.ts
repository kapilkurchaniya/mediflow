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
import {
  createRazorpayQrCode,
} from "../../src/server/domain/mobile/razorpay-client";
import { PERMISSIONS, SYSTEM_ROLES } from "../../src/lib/permissions";

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

  it("rejects non-JWT or malformed strings gracefully", () => {
    expect(verifyAccessToken("")).toBeNull();
    expect(verifyAccessToken("not.a.valid.jwt")).toBeNull();
    expect(verifyAccessToken("Bearer token")).toBeNull();
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

  it("handles complex nested arrays, nulls, and booleans canonically", () => {
    const complex1 = { list: [1, null, false, { b: 2, a: 1 }], ok: true };
    const complex2 = { ok: true, list: [1, null, false, { a: 1, b: 2 }] };
    expect(canonicalJson(complex1)).toBe(canonicalJson(complex2));
  });

  it("accurately detects payload tampering via snapshot hash", () => {
    const original = { refId: "sale-1", amountPaise: 50000 };
    const tampered = { refId: "sale-1", amountPaise: 90000 };

    expect(sha256(canonicalJson(original))).not.toBe(sha256(canonicalJson(tampered)));
  });

  it("produces lowercase 64-char hex string from sha256 helper", () => {
    const hash = sha256("test-input-data");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignores undefined properties while strictly preserving null and zero values", () => {
    const obj1 = { a: 0, b: null, c: undefined };
    const obj2 = { b: null, a: 0 };
    expect(canonicalJson(obj1)).toBe(canonicalJson(obj2));
  });
});

describe("Razorpay Webhook Cryptographic Verification", () => {
  const secret = "test_webhook_secret_key";

  it("creates dynamic single-use UPI QR code with structured provider payload", async () => {
    const qr = await createRazorpayQrCode({
      amountPaise: 45000,
      orderRef: "ORD_TEST_99",
      description: "MediFlow Delivery Payment",
      closeByEpochSeconds: Math.floor(Date.now() / 1000) + 1800,
      notes: { store_id: "s1" },
    });
    expect(qr.id).toMatch(/^qr_/);
    expect(qr.qrPayload).toContain("upi://pay");
    expect(qr.qrPayload).toContain("am=450.00");
    expect(qr.qrPayload).toContain("tr=ORD_TEST_99");
    expect(qr.providerOrderRef).toBe("ORD_TEST_99");
  });

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

  it("rejects invalid signature formats and empty signatures safely", () => {
    const rawBody = JSON.stringify({ event: "payment.captured" });
    expect(verifyRazorpaySignature(rawBody, "", secret)).toBe(false);
    expect(verifyRazorpaySignature(rawBody, "short_invalid_sig", secret)).toBe(false);
  });
});

describe("Asia/Kolkata Business Day Windows", () => {
  it("calculates exact UTC boundaries for Asia/Kolkata calendar day", () => {
    const { businessDate, dayStartUtc, nextDayStartUtc } = getKolkataTimeWindow("2026-11-06");

    expect(businessDate).toBe("2026-11-06");
    expect(dayStartUtc.toISOString()).toBe("2026-11-05T18:30:00.000Z");
    expect(nextDayStartUtc.toISOString()).toBe("2026-11-06T18:30:00.000Z");
    expect(nextDayStartUtc.getTime() - dayStartUtc.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("defaults to current Kolkata calendar date when dateStr is omitted", () => {
    const { businessDate, dayStartUtc, nextDayStartUtc } = getKolkataTimeWindow();
    expect(businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(nextDayStartUtc.getTime() - dayStartUtc.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("correctly offsets leap year business day transitions", () => {
    const { businessDate, dayStartUtc, nextDayStartUtc } = getKolkataTimeWindow("2024-02-29");
    expect(businessDate).toBe("2024-02-29");
    expect(dayStartUtc.toISOString()).toBe("2024-02-28T18:30:00.000Z");
    expect(nextDayStartUtc.toISOString()).toBe("2024-02-29T18:30:00.000Z");
  });
});

describe("Mobile Permissions & System Roles", () => {
  it("includes delivery.manage and delivery.fulfill in PERMISSIONS dictionary", () => {
    expect(PERMISSIONS["delivery.manage"]).toBeDefined();
    expect(PERMISSIONS["delivery.fulfill"]).toBeDefined();
  });

  it("configures delivery_staff role with delivery.fulfill and strictly without financial access", () => {
    const deliveryRole = SYSTEM_ROLES.find((r) => r.key === "delivery_staff");
    expect(deliveryRole).toBeDefined();
    expect(deliveryRole?.permissions).toContain("delivery.fulfill");
    expect(deliveryRole?.permissions).not.toContain("accounting.view");
    expect(deliveryRole?.permissions).not.toContain("report.all_stores");
    expect(deliveryRole?.permissions).not.toContain("sale.create");
  });

  it("guarantees owner role has comprehensive access including all delivery and reporting permissions", () => {
    const ownerRole = SYSTEM_ROLES.find((r) => r.key === "owner");
    expect(ownerRole).toBeDefined();
    expect(ownerRole?.permissions).toContain("delivery.manage");
    expect(ownerRole?.permissions).toContain("accounting.view");
    expect(ownerRole?.permissions).toContain("report.all_stores");
  });
});
