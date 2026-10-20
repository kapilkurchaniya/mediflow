import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nextDocNumber } from "@/server/domain/sequence";
import { createTestDb } from "../setup/db";
import { makeStore, makeTenant } from "../setup/factories";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.cleanup();
});

const next = (tenantId: string, storeId: string, docType = "sale", prefix = "INV", now?: Date) =>
  t.db.transaction((tx) => nextDocNumber(tx, tenantId, storeId, docType, prefix, now));

describe("nextDocNumber", () => {
  it("starts at 000001 and counts up", async () => {
    const tenant = await makeTenant(t.db);
    const store = await makeStore(t.db, tenant.id);
    const now = new Date(2026, 9, 20); // 20 Oct 2026 -> FY 2026-27
    expect(await next(tenant.id, store.id, "sale", "INV", now)).toBe("INV/26-27/000001");
    expect(await next(tenant.id, store.id, "sale", "INV", now)).toBe("INV/26-27/000002");
  });

  it("CONCURRENCY: 50 parallel bills get 50 distinct, consecutive numbers (gap-free)", async () => {
    const tenant = await makeTenant(t.db);
    const store = await makeStore(t.db, tenant.id);
    const now = new Date(2026, 9, 20);
    const numbers = await Promise.all(Array.from({ length: 50 }, () => next(tenant.id, store.id, "sale", "INV", now)));

    expect(new Set(numbers).size).toBe(50);
    const serials = numbers.map((n) => Number(n.split("/")[2])).sort((a, b) => a - b);
    expect(serials).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it("the series restarts on 1 April (Indian financial year)", async () => {
    const tenant = await makeTenant(t.db);
    const store = await makeStore(t.db, tenant.id);
    expect(await next(tenant.id, store.id, "sale", "INV", new Date(2027, 2, 30))).toBe("INV/26-27/000001");
    expect(await next(tenant.id, store.id, "sale", "INV", new Date(2027, 2, 31))).toBe("INV/26-27/000002");
    expect(await next(tenant.id, store.id, "sale", "INV", new Date(2027, 3, 1))).toBe("INV/27-28/000001");
    expect(await next(tenant.id, store.id, "sale", "INV", new Date(2027, 3, 2))).toBe("INV/27-28/000002");
  });

  it("each store and each document type has its own series", async () => {
    const tenant = await makeTenant(t.db);
    const a = await makeStore(t.db, tenant.id);
    const b = await makeStore(t.db, tenant.id);
    const now = new Date(2026, 9, 20);
    expect(await next(tenant.id, a.id, "sale", "INV", now)).toBe("INV/26-27/000001");
    expect(await next(tenant.id, b.id, "sale", "INV", now)).toBe("INV/26-27/000001");
    expect(await next(tenant.id, a.id, "sale_return", "CN", now)).toBe("CN/26-27/000001");
    expect(await next(tenant.id, a.id, "sale", "INV", now)).toBe("INV/26-27/000002");
  });

  it("a rolled-back transaction does not burn a number", async () => {
    const tenant = await makeTenant(t.db);
    const store = await makeStore(t.db, tenant.id);
    const now = new Date(2026, 9, 20);
    await expect(
      t.db.transaction(async (tx) => {
        await nextDocNumber(tx, tenant.id, store.id, "sale", "INV", now);
        throw new Error("sale failed after numbering");
      }),
    ).rejects.toThrow();
    expect(await next(tenant.id, store.id, "sale", "INV", now)).toBe("INV/26-27/000001");
  });

  it("numbers with the 3-letter default prefix fit GST Rule 46's 16-character limit", async () => {
    const tenant = await makeTenant(t.db);
    const store = await makeStore(t.db, tenant.id);
    const n = await next(tenant.id, store.id);
    expect(n.length).toBeLessThanOrEqual(16);
  });

  it("refuses to issue a sale number longer than 16 characters (GST Rule 46) and does not burn a serial", async () => {
    const tenant = await makeTenant(t.db);
    const store = await makeStore(t.db, tenant.id);
    const now = new Date(2026, 9, 20);
    await expect(next(tenant.id, store.id, "sale", "BILL", now)).rejects.toMatchObject({ code: "INVOICE_NO_TOO_LONG" });
    // the failed attempt rolled back with its transaction: the next valid bill is still number 1
    expect(await next(tenant.id, store.id, "sale", "INV", now)).toBe("INV/26-27/000001");
  });

  it("only sale invoices are length-checked (other documents are not GST tax invoices)", async () => {
    const tenant = await makeTenant(t.db);
    const store = await makeStore(t.db, tenant.id);
    expect(await next(tenant.id, store.id, "purchase_order", "PURCHASE", new Date(2026, 9, 20))).toBe("PURCHASE/26-27/000001");
  });
});
