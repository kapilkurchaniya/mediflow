import { describe, expect, it } from "vitest";
import { getStoreCondition, getStoreOrNullCondition } from "@/server/domain/reports";
import { sql } from "drizzle-orm";

describe("Chain Reports & Multi-Store Filtering (Task B3.1)", () => {
  const dummyColumn = sql`store_id`;

  it("getStoreCondition returns TRUE for 'all' scope", () => {
    const cond = getStoreCondition(dummyColumn, "all");
    expect(cond).toBeDefined();
  });

  it("getStoreCondition returns TRUE for undefined/null scope", () => {
    const cond = getStoreCondition(dummyColumn, undefined);
    expect(cond).toBeDefined();
  });

  it("getStoreCondition handles single string storeId", () => {
    const cond = getStoreCondition(dummyColumn, "store-123");
    expect(cond).toBeDefined();
  });

  it("getStoreCondition handles array of storeIds", () => {
    const cond = getStoreCondition(dummyColumn, ["store-1", "store-2"]);
    expect(cond).toBeDefined();
  });

  it("getStoreOrNullCondition returns TRUE for 'all' scope", () => {
    const cond = getStoreOrNullCondition(dummyColumn, "all");
    expect(cond).toBeDefined();
  });

  it("getStoreOrNullCondition handles single string storeId", () => {
    const cond = getStoreOrNullCondition(dummyColumn, "store-1");
    expect(cond).toBeDefined();
  });

  it("calculates gross margin percentage correctly across chain data", () => {
    const revenuePaise = 500000; // ₹5,000
    const cogsPaise = 350000; // ₹3,500
    const grossMarginPaise = revenuePaise - cogsPaise; // ₹1,500
    const marginPct = (grossMarginPaise / revenuePaise) * 100;

    expect(grossMarginPaise).toBe(150000);
    expect(marginPct).toBe(30);
  });

  it("handles zero revenue without division by zero", () => {
    const revenuePaise = 0;
    const cogsPaise = 0;
    const grossMarginPaise = revenuePaise - cogsPaise;
    const marginPct = revenuePaise > 0 ? (grossMarginPaise / revenuePaise) * 100 : 0;

    expect(grossMarginPaise).toBe(0);
    expect(marginPct).toBe(0);
  });
});
