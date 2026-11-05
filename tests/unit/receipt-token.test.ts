import { describe, it, expect } from "vitest";
import { generateReceiptToken, verifyReceiptToken } from "@/lib/receipt-token";

describe("Public Receipt Token (HMAC-SHA256)", () => {
  const saleId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
  const tenantId = "f9e8d7c6-b5a4-3210-fedc-ba0987654321";

  it("generates a valid, cryptographically signed token string", () => {
    const token = generateReceiptToken({ saleId, tenantId, expiresInDays: 30 });
    expect(typeof token).toBe("string");
    expect(token).toContain(".");

    const parts = token.split(".");
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(10);
    expect(parts[1].length).toBeGreaterThan(10);
  });

  it("successfully verifies an uncorrupted token and extracts payload", () => {
    const token = generateReceiptToken({ saleId, tenantId, expiresInDays: 7 });
    const verified = verifyReceiptToken(token);

    expect(verified.valid).toBe(true);
    if (verified.valid) {
      expect(verified.saleId).toBe(saleId);
      expect(verified.tenantId).toBe(tenantId);
      expect(verified.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    }
  });

  it("rejects token with altered signature", () => {
    const token = generateReceiptToken({ saleId, tenantId });
    const [payloadB64, sigB64] = token.split(".");

    // Alter the last character of the signature
    const corruptedChar = sigB64.slice(-1) === "A" ? "B" : "A";
    const corruptedSig = sigB64.slice(0, -1) + corruptedChar;
    const tamperedToken = `${payloadB64}.${corruptedSig}`;

    const verified = verifyReceiptToken(tamperedToken);
    expect(verified.valid).toBe(false);
    if (!verified.valid) {
      expect(verified.error).toBe("Invalid token signature");
    }
  });

  it("rejects token with altered payload", () => {
    const token = generateReceiptToken({ saleId, tenantId });
    const [, sigB64] = token.split(".");

    // Create a modified payload but keep the old signature
    const fakePayloadB64 = Buffer.from(
      JSON.stringify({
        saleId: "00000000-0000-0000-0000-000000000000",
        tenantId,
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    )
      .toString("base64")
      .replace(/=/g, "");

    const tamperedToken = `${fakePayloadB64}.${sigB64}`;
    const verified = verifyReceiptToken(tamperedToken);
    expect(verified.valid).toBe(false);
    if (!verified.valid) {
      expect(verified.error).toBe("Invalid token signature");
    }
  });

  it("rejects expired token", () => {
    // expiresInDays: -1 ensures exp is in the past
    const expiredToken = generateReceiptToken({ saleId, tenantId, expiresInDays: -1 });
    const verified = verifyReceiptToken(expiredToken);

    expect(verified.valid).toBe(false);
    if (!verified.valid) {
      expect(verified.error).toBe("Receipt link has expired");
    }
  });

  it("rejects malformed tokens", () => {
    expect(verifyReceiptToken("").valid).toBe(false);
    expect(verifyReceiptToken("only-one-part").valid).toBe(false);
    expect(verifyReceiptToken("part1.part2.part3").valid).toBe(false);
  });
});

