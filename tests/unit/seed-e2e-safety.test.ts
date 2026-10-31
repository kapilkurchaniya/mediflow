import { describe, it, expect } from "vitest";
import {
  validateE2EDatabaseUrl,
  ALLOWED_TEST_DATABASE,
  ALLOWED_LOCAL_HOSTS,
} from "../../scripts/seed-e2e-guard";

describe("E2E Seed Database Safety Guard", () => {
  const VALID_LOCAL_URL = "postgres://mediflow@localhost:5432/mediflow_test";

  it("exports strict safety constants", () => {
    expect(ALLOWED_TEST_DATABASE).toBe("mediflow_test");
    expect(ALLOWED_LOCAL_HOSTS).toContain("localhost");
    expect(ALLOWED_LOCAL_HOSTS).toContain("127.0.0.1");
  });

  it("throws when DATABASE_URL is missing or empty", () => {
    expect(() => validateE2EDatabaseUrl("", "1")).toThrow(
      /DATABASE_URL environment variable is required/i
    );
    expect(() => validateE2EDatabaseUrl(undefined, "1")).toThrow(
      /DATABASE_URL environment variable is required/i
    );
  });

  it("throws when ALLOW_E2E_DB_RESET is not explicitly '1'", () => {
    expect(() => validateE2EDatabaseUrl(VALID_LOCAL_URL, undefined)).toThrow(
      /explicit ALLOW_E2E_DB_RESET="1" permission flag/i
    );
    expect(() => validateE2EDatabaseUrl(VALID_LOCAL_URL, "0")).toThrow(
      /explicit ALLOW_E2E_DB_RESET="1" permission flag/i
    );
    expect(() => validateE2EDatabaseUrl(VALID_LOCAL_URL, "true")).toThrow(
      /explicit ALLOW_E2E_DB_RESET="1" permission flag/i
    );
  });

  it("throws when host is remote or non-local", () => {
    const remoteUrls = [
      "postgres://mediflow@db.mediflow.com:5432/mediflow_test",
      "postgres://mediflow@192.168.1.100:5432/mediflow_test",
      "postgres://mediflow@production.internal:5432/mediflow_test",
      "postgres://mediflow@10.0.0.1:5432/mediflow_test",
    ];

    for (const url of remoteUrls) {
      expect(() => validateE2EDatabaseUrl(url, "1")).toThrow(
        /Refusing to reset non-local database/i
      );
    }
  });

  it("strictly rejects non-matching database names, even if they contain 'test'", () => {
    const invalidDbUrls = [
      "postgres://mediflow@localhost:5432/mediflow",
      "postgres://mediflow@localhost:5432/contest", // Substring trap
      "postgres://mediflow@localhost:5432/pharmacy_test_backup",
      "postgres://mediflow@localhost:5432/mediflow_testing",
      "postgres://mediflow@localhost:5432/mediflow_production",
    ];

    for (const url of invalidDbUrls) {
      expect(() => validateE2EDatabaseUrl(url, "1")).toThrow(
        /E2E seed strictly requires the database name to be "mediflow_test"/i
      );
    }
  });

  it("accepts valid local mediflow_test URLs with permission flag '1'", () => {
    const validUrls = [
      "postgres://mediflow@localhost:5432/mediflow_test",
      "postgres://mediflow:secret@127.0.0.1:5432/mediflow_test",
      "postgres://mediflow@[::1]:5432/mediflow_test",
    ];

    for (const url of validUrls) {
      const res = validateE2EDatabaseUrl(url, "1");
      expect(res.dbName).toBe("mediflow_test");
      expect(ALLOWED_LOCAL_HOSTS).toContain(res.host);
    }
  });
});
