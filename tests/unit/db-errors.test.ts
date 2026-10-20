import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "@/server/db/errors";

describe("isUniqueViolation", () => {
  const pg = { code: "23505", constraint: "racks_store_code_uq" };

  it("finds the Postgres error inside Drizzle's wrapper", () => {
    const wrapped = Object.assign(new Error("Failed query: insert into ..."), { cause: pg });
    expect(isUniqueViolation(wrapped)).toBe(true);
    expect(isUniqueViolation(wrapped, "racks_store_code_uq")).toBe(true);
  });
  it("can be limited to one constraint", () => {
    expect(isUniqueViolation({ cause: pg }, "some_other_uq")).toBe(false);
  });
  it("ignores other errors", () => {
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation({ cause: { code: "23503" } })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("text")).toBe(false);
  });
});
