import { describe, expect, it, vi, afterEach } from "vitest";
import {
  computeCodeChallenge,
  fetchGoogleUserInfo,
  generateCodeVerifier,
  sanitizeNextPath,
  signSignedPayload,
  verifySignedPayload,
} from "@/server/oauth/google";

describe("Google OAuth PKCE & security helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("computes RFC 7636 S256 code challenge from verifier", () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    const challenge = computeCodeChallenge(verifier);
    expect(challenge).not.toBe(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(computeCodeChallenge(verifier)).toBe(challenge);
  });

  it("signs and verifies HMAC payloads and rejects tampering or expiry", () => {
    const secret = "test-secret-0123456789abcdef";
    const now = 1_700_000_000_000;
    const token = signSignedPayload({ state: "abc", exp: now + 60_000 }, secret);

    const decoded = verifySignedPayload<{ state: string; exp: number }>(token, secret, now + 10_000);
    expect(decoded?.state).toBe("abc");

    // Expired
    expect(verifySignedPayload(token, secret, now + 120_000)).toBeNull();

    // Tampered payload
    const [, sig] = token.split(".");
    const tamperedData = Buffer.from(JSON.stringify({ state: "evil", exp: now + 60_000 })).toString("base64url");
    expect(verifySignedPayload(`${tamperedData}.${sig}`, secret, now + 10_000)).toBeNull();

    // Wrong secret
    expect(verifySignedPayload(token, "wrong-secret", now + 10_000)).toBeNull();
  });

  it("blocks open-redirect paths in sanitizeNextPath", () => {
    expect(sanitizeNextPath("/dashboard/pos")).toBe("/dashboard/pos");
    expect(sanitizeNextPath("https://evil.example/phish")).toBe("/dashboard");
    expect(sanitizeNextPath("//evil.example")).toBe("/dashboard");
    expect(sanitizeNextPath("/\\evil.example")).toBe("/dashboard");
    expect(sanitizeNextPath(undefined)).toBe("/dashboard");
  });

  it("rejects Google profiles whose email_verified is not true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          sub: "google-sub-123",
          email: "User@Pharmacy.IN",
          email_verified: false,
          name: "Test User",
        }),
      }),
    );

    await expect(fetchGoogleUserInfo("access-token")).rejects.toThrow("UNVERIFIED_GOOGLE_EMAIL");
  });

  it("normalizes verified Google profile emails to lowercase", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          sub: "google-sub-123",
          email: "Dr.Aarav@ApexHealth.IN",
          email_verified: true,
          name: "Dr. Aarav",
          picture: "https://lh3.googleusercontent.com/a/avatar",
        }),
      }),
    );

    const profile = await fetchGoogleUserInfo("access-token");
    expect(profile).toEqual({
      sub: "google-sub-123",
      email: "dr.aarav@apexhealth.in",
      emailVerified: true,
      name: "Dr. Aarav",
      picture: "https://lh3.googleusercontent.com/a/avatar",
    });
  });
});

