import { describe, expect, it } from "vitest";
import {
  generateDeviceToken,
  hashDeviceToken,
  validateDeviceCode,
} from "@/server/domain/devices/types";
import { DomainError } from "@/server/errors";

describe("Task A4.1: Devices Domain Unit Tests", () => {
  describe("validateDeviceCode", () => {
    it("accepts valid 2-character uppercase alphanumeric codes", () => {
      expect(validateDeviceCode("01")).toBe("01");
      expect(validateDeviceCode("99")).toBe("99");
      expect(validateDeviceCode("A1")).toBe("A1");
      expect(validateDeviceCode("Z9")).toBe("Z9");
      expect(validateDeviceCode("AB")).toBe("AB");
    });

    it("normalizes lowercase alphanumeric codes to uppercase", () => {
      expect(validateDeviceCode("a1")).toBe("A1");
      expect(validateDeviceCode("b9")).toBe("B9");
      expect(validateDeviceCode("cd")).toBe("CD");
    });

    it("trims outer whitespace", () => {
      expect(validateDeviceCode(" 01 ")).toBe("01");
      expect(validateDeviceCode(" A2  ")).toBe("A2");
    });

    it("rejects codes with length !== 2", () => {
      expect(() => validateDeviceCode("1")).toThrow(DomainError);
      expect(() => validateDeviceCode("001")).toThrow(DomainError);
      expect(() => validateDeviceCode("")).toThrow(DomainError);
      expect(() => validateDeviceCode("   ")).toThrow(DomainError);
    });

    it("rejects codes with invalid characters", () => {
      expect(() => validateDeviceCode("0-")).toThrow(DomainError);
      expect(() => validateDeviceCode("A_")).toThrow(DomainError);
      expect(() => validateDeviceCode("@1")).toThrow(DomainError);
      expect(() => validateDeviceCode("1 ")).toThrow(DomainError);
      expect(() => validateDeviceCode("!!")).toThrow(DomainError);
    });
  });

  describe("generateDeviceToken", () => {
    it("generates token with mf_dev_ prefix and 256 bits of hex entropy", () => {
      const token = generateDeviceToken();
      expect(token.startsWith("mf_dev_")).toBe(true);
      // 'mf_dev_' (7 chars) + 64 hex characters = 71 characters
      expect(token.length).toBe(71);
      expect(/^mf_dev_[0-9a-f]{64}$/.test(token)).toBe(true);
    });

    it("generates distinct high-entropy tokens on consecutive calls", () => {
      const token1 = generateDeviceToken();
      const token2 = generateDeviceToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe("hashDeviceToken", () => {
    it("computes deterministic SHA-256 hex digest", () => {
      const rawToken = "mf_dev_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const hash1 = hashDeviceToken(rawToken);
      const hash2 = hashDeviceToken(rawToken);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
      expect(/^[0-9a-f]{64}$/.test(hash1)).toBe(true);
    });

    it("produces different hashes for different tokens", () => {
      const hash1 = hashDeviceToken(generateDeviceToken());
      const hash2 = hashDeviceToken(generateDeviceToken());
      expect(hash1).not.toBe(hash2);
    });
  });
});
